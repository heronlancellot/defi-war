import type { Agent as AgentType, LLMDecision } from '@agent-arena/shared'
import { getLLMDecision } from './llm.js'
import { validateDecision } from './decision.js'
import { fetchMarketData } from '../market/prices.js'
import { getAllAgents, getAgentById, updateAgentPnl, saveTrade } from '../db/schema.js'
import { appendTradeHistory } from '../storage/0g.js'
import { arenaEvents } from '../events.js'
import { getQuote, TOKENS } from '../uniswap/api.js'
import { executeSwap } from '../uniswap/execute.js'
import { createPublicClient, http, parseEther, formatEther, formatUnits } from 'viem'
import { defineChain } from 'viem'

const unichainTestnet = defineChain({
  id: 1301,
  name: 'Unichain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env.UNICHAIN_RPC_URL ?? 'https://sepolia.unichain.org'] } },
  testnet: true,
})

const publicClient = createPublicClient({ chain: unichainTestnet, transport: http() })

// Active agent loops (agentId → true)
const runningLoops = new Map<string, boolean>()

export async function startAllAgentLoops() {
  const agents = await getAllAgents()
  console.log(`[Engine] Starting loops for ${agents.length} agent(s)`)
  for (let i = 0; i < agents.length; i++) {
    startAgentLoop(agents[i].id)
    // Stagger starts by 8s so agents don't hammer LLM/APIs simultaneously
    if (i < agents.length - 1) await sleep(8_000)
  }
}

// Force one immediate cycle on all agents — useful for testing
export async function triggerCycleAll() {
  const agents = await getAllAgents()
  console.log(`[Engine] Manual trigger: running ${agents.length} cycle(s) now`)
  for (const agent of agents) {
    runOneCycle(agent.id).catch(err => console.error(`[${agent.id}] trigger error:`, err))
  }
}

export function startAgentLoop(agentId: string) {
  if (runningLoops.get(agentId)) return
  runningLoops.set(agentId, true)
  runLoop(agentId)
}

async function runLoop(agentId: string) {
  while (runningLoops.get(agentId)) {
    try {
      await runOneCycle(agentId)
    } catch (err) {
      console.error(`[${agentId}] Cycle error:`, err)
    }
    await sleep(Number(process.env.AGENT_LOOP_INTERVAL_MS ?? 60_000))
  }
}

export async function runOneCycle(agentId: string) {
  const row = await getAgentById(agentId)
  if (!row) return

  const agent = dbRowToAgent(row)
  console.log(`[${agent.name}] ── cycle start ──`)

  // 1. Fetch market data
  let market
  try {
    market = await fetchMarketData()
    console.log(`[${agent.name}] Market: ETH=$${market.eth.toFixed(2)} | 1h=${market.ethChange1h.toFixed(2)}%`)
  } catch (err) {
    console.error(`[${agent.name}] Failed to fetch market data:`, String(err))
    return
  }

  // 2. LLM decision
  let decision: LLMDecision
  try {
    decision = await getLLMDecision(agent, market)
    console.log(`[${agent.name}] LLM raw decision: action=${decision.action} tokenIn=${decision.tokenIn} tokenOut=${decision.tokenOut} amount=${decision.amountPercent}%`)
    if (!validateDecision(decision)) {
      console.warn(`[${agent.name}] Invalid decision from LLM — tokenIn=${decision.tokenIn} tokenOut=${decision.tokenOut} action=${decision.action}`)
      throw new Error('Invalid decision from LLM')
    }
  } catch (err) {
    console.warn(`[${agent.name}] LLM error, defaulting to HOLD:`, String(err).slice(0, 300))
    decision = { action: 'HOLD', tokenIn: 'ETH', tokenOut: 'USDC', amountPercent: 0, reasoning: 'LLM error' }
  }

  console.log(`[${agent.name}] → ${decision.action} ${decision.tokenIn ?? ''}→${decision.tokenOut ?? ''} ${decision.amountPercent}% | "${decision.reasoning}"`)

  if (decision.action === 'HOLD') {
    console.log(`[${agent.name}] HOLD — skipping trade`)
    return
  }

  // 3. Execute trade — real swap if wallet is funded, simulated otherwise
  let newEth = agent.portfolioEth ?? 0.1
  let newUsdc = agent.portfolioUsdc ?? 200
  let pnlChange = 0
  let txHash: string | undefined

  const privateKey = row.private_key as string
  const realSwapEnabled = process.env.REAL_SWAPS === 'true' && privateKey?.startsWith('0x')

  console.log(`[${agent.name}] Swap mode: ${realSwapEnabled ? 'REAL' : 'SIMULATION'}`)

  if (realSwapEnabled) {
    try {
      pnlChange = await executeRealSwap({
        agent, decision, market, privateKey,
        portfolioEth: newEth, portfolioUsdc: newUsdc,
      })
      txHash = undefined // executeRealSwap returns pnlChange; txHash logged inside
    } catch (err) {
      console.warn(`[${agent.name}] Real swap failed, falling back to simulation:`, String(err).slice(0, 200))
      pnlChange = simulatePnl(decision, market)
    }
  } else {
    pnlChange = simulatePnl(decision, market)
  }

  const newPnlTotal = agent.pnlTotal + pnlChange

  if (decision.action === 'BUY' && decision.tokenIn === 'USDC') {
    const usdcSpend = newUsdc * (decision.amountPercent / 100)
    newUsdc -= usdcSpend
    newEth += usdcSpend / market.eth
  } else if (decision.action === 'SELL' && decision.tokenIn === 'ETH') {
    const ethSell = newEth * (decision.amountPercent / 100)
    newEth -= ethSell
    newUsdc += ethSell * market.eth
  }

  // 4. Persist
  await saveTrade({
    id: crypto.randomUUID(),
    agentId,
    action: decision.action,
    tokenIn: decision.tokenIn,
    tokenOut: decision.tokenOut,
    amountIn: decision.amountPercent.toString(),
    amountOut: '0',
    txHash,
    pnl: pnlChange,
    reasoning: decision.reasoning,
  })

  await updateAgentPnl(agentId, newPnlTotal, pnlChange, newEth, newUsdc, `${decision.action} ${decision.tokenIn}->${decision.tokenOut}`)

  appendTradeHistory({
    agentId,
    action: decision.action,
    tokenIn: decision.tokenIn,
    tokenOut: decision.tokenOut,
    pnl: pnlChange,
    reasoning: decision.reasoning,
    timestamp: new Date().toISOString(),
    txHash,
  }).catch(() => {})

  arenaEvents.emit('agent:updated', agentId)

  console.log(`[${agent.name}] ✓ Trade saved | PnL: ${pnlChange >= 0 ? '+' : ''}${pnlChange.toFixed(4)}% | Total: ${newPnlTotal.toFixed(4)}% | mode: ${realSwapEnabled ? 'REAL' : 'SIM'}`)
}

function simulatePnl(decision: LLMDecision, market: { ethChange1h: number }): number {
  const priceMove = market.ethChange1h
  const correct = (decision.action === 'BUY' && priceMove > 0) || (decision.action === 'SELL' && priceMove < 0)
  const magnitude = Math.abs(priceMove) * (decision.amountPercent / 100) * 0.3
  return correct ? magnitude : -magnitude
}

async function executeRealSwap(params: {
  agent: AgentType & { portfolioEth: number; portfolioUsdc: number }
  decision: LLMDecision
  market: { eth: number }
  privateKey: string
  portfolioEth: number
  portfolioUsdc: number
}): Promise<number> {
  const { agent, decision, market, privateKey, portfolioEth, portfolioUsdc } = params

  const tokenInAddr = decision.tokenIn === 'ETH' ? TOKENS.WETH : TOKENS.USDC
  const tokenOutAddr = decision.tokenOut === 'ETH' ? TOKENS.WETH : TOKENS.USDC

  let amountIn: bigint
  if (decision.tokenIn === 'ETH') {
    const ethAmount = portfolioEth * (decision.amountPercent / 100)
    if (ethAmount < 0.0001) throw new Error('ETH amount too small')
    amountIn = parseEther(ethAmount.toFixed(6))
  } else {
    const usdcAmount = portfolioUsdc * (decision.amountPercent / 100)
    if (usdcAmount < 1) throw new Error('USDC amount too small')
    amountIn = BigInt(Math.floor(usdcAmount * 1e6))
  }

  console.log(`[${agent.name}] Fetching quote: ${decision.tokenIn}→${decision.tokenOut} amount=${amountIn}`)
  const quote = await getQuote(tokenInAddr, tokenOutAddr, amountIn.toString(), agent.walletAddress)

  const result = await executeSwap(quote, privateKey)
  console.log(`[${agent.name}] Swap tx: ${result.txHash}`)

  const amountOutNum = decision.tokenOut === 'ETH'
    ? Number(formatEther(BigInt(result.amountOut)))
    : Number(formatUnits(BigInt(result.amountOut), 6))

  const valueIn = decision.tokenIn === 'ETH'
    ? Number(formatEther(amountIn)) * market.eth
    : Number(amountIn) / 1e6

  const valueOut = decision.tokenOut === 'ETH'
    ? amountOutNum * market.eth
    : amountOutNum

  return ((valueOut - valueIn) / valueIn) * 100
}

function dbRowToAgent(row: any): AgentType & { portfolioEth: number; portfolioUsdc: number; lastTrade: string } {
  return {
    id: row.id,
    name: row.name,
    ensName: row.ens_name,
    walletAddress: row.wallet_address,
    strategy: row.strategy,
    pnlTotal: row.pnl_total,
    pnlLastTrade: row.pnl_last_trade,
    tradeCount: row.trade_count,
    createdAt: new Date(row.created_at),
    portfolioEth: row.portfolio_eth,
    portfolioUsdc: row.portfolio_usdc,
    lastTrade: row.last_trade,
    x: 0, y: 0, vx: 0, vy: 0, radius: 0,
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
