import type { Agent as AgentType, LLMDecision } from '@agent-arena/shared'
import { getLLMDecision } from './llm.js'
import { validateDecision } from './decision.js'
import { fetchMarketData } from '../market/prices.js'
import { getAllAgents, getAgentById, updateAgentPnl, saveTrade } from '../db/schema.js'
import { appendTradeHistory } from '../storage/0g.js'
import { arenaEvents } from '../events.js'
import { getQuote, TOKENS } from '../uniswap/api.js'
import { executeSwap } from '../uniswap/execute.js'
import { createPublicClient, http, parseEther, formatEther, formatUnits, parseUnits } from 'viem'
import { defineChain } from 'viem'

const unichainTestnet = defineChain({
  id: 1301,
  name: 'Unichain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env.UNICHAIN_RPC_URL ?? 'https://sepolia.unichain.org'] } },
  testnet: true,
})

const publicClient = createPublicClient({ chain: unichainTestnet, transport: http() })

const USDC_ABI = [{
  name: 'balanceOf', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}] as const

const runningLoops = new Map<string, boolean>()
const testAgentCycle = new Map<string, number>() // tracks SELL/BUY alternation

export async function startAllAgentLoops() {
  const agents = await getAllAgents()
  console.log(`[Engine] Starting loops for ${agents.length} agent(s)`)
  for (let i = 0; i < agents.length; i++) {
    startAgentLoop(agents[i].id)
    if (i < agents.length - 1) await sleep(12_000)
  }
}

export async function triggerCycleAll() {
  const agents = await getAllAgents()
  console.log(`[Engine] Manual trigger: running ${agents.length} cycle(s) now`)
  for (const agent of agents) {
    runOneCycle(agent.id).catch(err => console.error(`[${agent.id}] trigger error:`, err))
  }
}

export function startAgentLoop(agentId: string, isTest = false) {
  if (runningLoops.get(agentId)) return
  runningLoops.set(agentId, true)
  isTest ? runTestLoop(agentId) : runLoop(agentId)
}

async function runTestLoop(agentId: string) {
  while (runningLoops.get(agentId)) {
    try {
      await runTestCycle(agentId)
    } catch (err) {
      console.error(`[test-trader] Cycle error:`, err)
    }
    await sleep(Number(process.env.AGENT_LOOP_INTERVAL_MS ?? 60_000))
  }
}

async function runTestCycle(agentId: string) {
  const row = await getAgentById(agentId)
  if (!row) return

  const agent = dbRowToAgent(row)
  const { ethBalance, usdcBalance } = await fetchOnChainBalances(agent.walletAddress)

  let market
  try {
    market = await fetchMarketData()
  } catch {
    console.error('[test-trader] Market fetch failed')
    return
  }

  // Alternate SELL → BUY → SELL → BUY...
  const cycle = testAgentCycle.get(agentId) ?? 0
  const action = cycle % 2 === 0 ? 'SELL' : 'BUY'
  testAgentCycle.set(agentId, cycle + 1)

  // Guard: no ETH to sell or no USDC to buy
  if (action === 'SELL' && ethBalance < 0.001) {
    console.log(`[test-trader] SELL skipped — no ETH (${ethBalance})`)
    return
  }
  if (action === 'BUY' && usdcBalance < 0.5) {
    console.log(`[test-trader] BUY skipped — no USDC (${usdcBalance})`)
    return
  }

  const decision: LLMDecision = {
    action,
    tokenIn: action === 'SELL' ? 'ETH' : 'USDC',
    tokenOut: action === 'SELL' ? 'USDC' : 'ETH',
    amountPercent: 25,
    reasoning: `Test cycle #${cycle} — forced ${action}`,
  }

  console.log(`[test-trader] ── cycle ${cycle} → ${action} 25% ──`)
  console.log(`[test-trader] Balances: ${ethBalance.toFixed(6)} ETH | ${usdcBalance.toFixed(2)} USDC`)

  const privateKey = row.private_key as string
  const canTrade = process.env.REAL_SWAPS === 'true' && privateKey?.startsWith('0x')

  let pnlChange = 0
  let txHash: string | undefined
  let newEth = ethBalance
  let newUsdc = usdcBalance

  if (canTrade) {
    try {
      const result = await executeTradeOnChain({ agent, decision, market, privateKey, ethBalance, usdcBalance })
      pnlChange = result.pnlChange
      txHash = result.txHash
      newEth = result.newEth
      newUsdc = result.newUsdc
      console.log(`[test-trader] ✅ REAL tx: ${txHash}`)
    } catch (err) {
      console.warn(`[test-trader] Real swap failed → simulation:`, String(err).slice(0, 200))
      pnlChange = simulatePnl(decision, market)
      ;({ newEth, newUsdc } = simulatePortfolio(decision, ethBalance, usdcBalance, market.eth))
    }
  } else {
    pnlChange = simulatePnl(decision, market)
    ;({ newEth, newUsdc } = simulatePortfolio(decision, ethBalance, usdcBalance, market.eth))
  }

  const newPnlTotal = agent.pnlTotal + pnlChange

  await saveTrade({
    id: crypto.randomUUID(),
    agentId,
    action,
    tokenIn: decision.tokenIn,
    tokenOut: decision.tokenOut,
    amountIn: '25',
    amountOut: '0',
    txHash,
    pnl: pnlChange,
    reasoning: decision.reasoning,
  })

  await updateAgentPnl(agentId, newPnlTotal, pnlChange, newEth, newUsdc, `${action} ETH 25%`)
  appendTradeHistory({ agentId, action, tokenIn: decision.tokenIn, tokenOut: decision.tokenOut, pnl: pnlChange, reasoning: decision.reasoning, timestamp: new Date().toISOString(), txHash }).catch(() => {})
  arenaEvents.emit('agent:updated', agentId)
  arenaEvents.emit('trade:executed', {
    agentId,
    agentName: agent.name,
    action,
    amountPercent: 25,
    pnl: pnlChange,
    reasoning: decision.reasoning,
    txHash: txHash ?? null,
    timestamp: new Date().toISOString(),
  })

  const mode = canTrade && txHash ? 'REAL' : 'SIM'
  console.log(`[test-trader] ✓ ${action} 25% | PnL:${pnlChange >= 0 ? '+' : ''}${pnlChange.toFixed(4)}% | Total:${newPnlTotal.toFixed(4)}% | ${mode}`)
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

  // 1. Read real on-chain balances
  const { ethBalance, usdcBalance } = await fetchOnChainBalances(agent.walletAddress)
  console.log(`[${agent.name}] On-chain: ${ethBalance.toFixed(6)} ETH | ${usdcBalance.toFixed(2)} USDC`)

  // 2. Fetch market data
  let market
  try {
    market = await fetchMarketData()
    console.log(`[${agent.name}] Market: ETH=$${market.eth.toFixed(2)} | 1h=${market.ethChange1h.toFixed(2)}%`)
  } catch (err) {
    console.error(`[${agent.name}] Failed to fetch market data:`, String(err))
    return
  }

  // 3. LLM decision — pass real balances
  let decision: LLMDecision
  try {
    decision = await getLLMDecision(agent, market, ethBalance, usdcBalance)
    console.log(`[${agent.name}] LLM: ${decision.action} ${decision.amountPercent}% | "${decision.reasoning}"`)
    if (!validateDecision(decision)) throw new Error('Invalid decision')
  } catch (err) {
    console.warn(`[${agent.name}] LLM error → HOLD:`, String(err).slice(0, 300))
    decision = { action: 'HOLD', tokenIn: 'ETH', tokenOut: 'USDC', amountPercent: 0, reasoning: 'LLM error' }
  }

  if (decision.action === 'HOLD') {
    console.log(`[${agent.name}] HOLD — skipping trade`)
    return
  }

  // 4. Execute swap — SELL = ETH→USDC, BUY = USDC→ETH
  let pnlChange = 0
  let txHash: string | undefined
  let newEth = ethBalance
  let newUsdc = usdcBalance

  const privateKey = row.private_key as string
  const canTrade = process.env.REAL_SWAPS === 'true' && privateKey?.startsWith('0x')

  if (canTrade) {
    try {
      const result = await executeTradeOnChain({
        agent, decision, market, privateKey, ethBalance, usdcBalance,
      })
      pnlChange = result.pnlChange
      txHash = result.txHash
      newEth = result.newEth
      newUsdc = result.newUsdc
      console.log(`[${agent.name}] REAL tx: ${txHash}`)
    } catch (err) {
      console.warn(`[${agent.name}] Real swap failed → simulation:`, String(err).slice(0, 200))
      pnlChange = simulatePnl(decision, market)
      ;({ newEth, newUsdc } = simulatePortfolio(decision, ethBalance, usdcBalance, market.eth))
    }
  } else {
    pnlChange = simulatePnl(decision, market)
    ;({ newEth, newUsdc } = simulatePortfolio(decision, ethBalance, usdcBalance, market.eth))
  }

  const newPnlTotal = agent.pnlTotal + pnlChange

  // 5. Persist
  await saveTrade({
    id: crypto.randomUUID(),
    agentId,
    action: decision.action,
    tokenIn: decision.action === 'SELL' ? 'ETH' : 'USDC',
    tokenOut: decision.action === 'SELL' ? 'USDC' : 'ETH',
    amountIn: decision.amountPercent.toString(),
    amountOut: '0',
    txHash,
    pnl: pnlChange,
    reasoning: decision.reasoning,
  })

  await updateAgentPnl(agentId, newPnlTotal, pnlChange, newEth, newUsdc, `${decision.action} ETH ${decision.amountPercent}%`)

  appendTradeHistory({
    agentId,
    action: decision.action,
    tokenIn: decision.action === 'SELL' ? 'ETH' : 'USDC',
    tokenOut: decision.action === 'SELL' ? 'USDC' : 'ETH',
    pnl: pnlChange,
    reasoning: decision.reasoning,
    timestamp: new Date().toISOString(),
    txHash,
  }).catch(() => {})

  arenaEvents.emit('agent:updated', agentId)
  arenaEvents.emit('trade:executed', {
    agentId,
    agentName: agent.name,
    action: decision.action,
    amountPercent: decision.amountPercent,
    pnl: pnlChange,
    reasoning: decision.reasoning,
    txHash: txHash ?? null,
    timestamp: new Date().toISOString(),
  })

  const mode = canTrade && txHash ? 'REAL' : 'SIM'
  const txStr = txHash ? ` tx:${txHash.slice(0, 10)}...` : ''
  console.log(`[${agent.name}] ✓ ${decision.action} ${decision.amountPercent}% | PnL:${pnlChange >= 0 ? '+' : ''}${pnlChange.toFixed(4)}% | Total:${newPnlTotal.toFixed(4)}% | ${mode}${txStr}`)
}

// ── On-chain balance reader ──────────────────────────────────────────────────

async function fetchOnChainBalances(walletAddress: string): Promise<{ ethBalance: number; usdcBalance: number }> {
  const [ethWei, usdcRaw] = await Promise.all([
    publicClient.getBalance({ address: walletAddress as `0x${string}` }),
    publicClient.readContract({
      address: TOKENS.USDC as `0x${string}`,
      abi: USDC_ABI,
      functionName: 'balanceOf',
      args: [walletAddress as `0x${string}`],
    }).catch(() => 0n),
  ])
  return {
    ethBalance: Number(formatEther(ethWei)),
    usdcBalance: Number(usdcRaw) / 1e6,
  }
}

// ── Real swap via Uniswap ────────────────────────────────────────────────────

async function executeTradeOnChain(params: {
  agent: AgentType & { portfolioEth: number }
  decision: LLMDecision
  market: { eth: number }
  privateKey: string
  ethBalance: number
  usdcBalance: number
}): Promise<{ pnlChange: number; txHash: string; newEth: number; newUsdc: number }> {
  const { agent, decision, market, privateKey, ethBalance, usdcBalance } = params

  let amountIn: bigint
  let tokenIn: string
  let tokenOut: string

  if (decision.action === 'SELL') {
    // SELL: native ETH → USDC (reserve 10% for gas, use native ETH address)
    const useEth = ethBalance * 0.9 * (decision.amountPercent / 100)
    if (useEth < 0.0001) throw new Error(`ETH too small: ${useEth}`)
    amountIn = parseEther(useEth.toFixed(6))
    tokenIn = TOKENS.ETH_NATIVE
    tokenOut = TOKENS.USDC
  } else {
    // BUY: USDC → native ETH
    const useUsdc = usdcBalance * (decision.amountPercent / 100)
    if (useUsdc < 0.5) throw new Error(`USDC too small: ${useUsdc}`)
    amountIn = parseUnits(useUsdc.toFixed(6), 6)
    tokenIn = TOKENS.USDC
    tokenOut = TOKENS.ETH_NATIVE
  }

  const quote = await getQuote(tokenIn, tokenOut, amountIn.toString(), agent.walletAddress)
  const result = await executeSwap(quote, privateKey)

  // Calculate actual amounts received from quote output
  const rawOut = (quote.quote as any)?.output?.amount ?? '0'
  const amountOutNum = decision.action === 'SELL'
    ? Number(formatUnits(BigInt(rawOut), 6))   // USDC received
    : Number(formatEther(BigInt(rawOut)))        // ETH received

  const valueIn = decision.action === 'SELL'
    ? Number(formatEther(amountIn)) * market.eth
    : Number(formatUnits(amountIn, 6))

  const valueOut = decision.action === 'SELL'
    ? amountOutNum
    : amountOutNum * market.eth

  const pnlChange = ((valueOut - valueIn) / valueIn) * 100

  // Update estimated portfolio (next cycle will read real on-chain values anyway)
  const newEth = decision.action === 'SELL'
    ? ethBalance - Number(formatEther(amountIn))
    : ethBalance + amountOutNum
  const newUsdc = decision.action === 'SELL'
    ? usdcBalance + amountOutNum
    : usdcBalance - Number(formatUnits(amountIn, 6))

  return { pnlChange, txHash: result.txHash, newEth, newUsdc }
}

// ── Simulation fallback ──────────────────────────────────────────────────────

function simulatePnl(decision: LLMDecision, market: { ethChange1h: number }): number {
  const priceMove = market.ethChange1h
  const correct = (decision.action === 'BUY' && priceMove > 0) || (decision.action === 'SELL' && priceMove < 0)
  const magnitude = Math.abs(priceMove) * (decision.amountPercent / 100) * 0.3
  return correct ? magnitude : -magnitude
}

function simulatePortfolio(
  decision: LLMDecision,
  ethBalance: number,
  usdcBalance: number,
  ethPrice: number,
): { newEth: number; newUsdc: number } {
  if (decision.action === 'SELL') {
    const ethSell = ethBalance * (decision.amountPercent / 100)
    return { newEth: ethBalance - ethSell, newUsdc: usdcBalance + ethSell * ethPrice }
  } else {
    const usdcBuy = Math.max(usdcBalance, 200) * (decision.amountPercent / 100)
    return { newEth: ethBalance + usdcBuy / ethPrice, newUsdc: Math.max(0, usdcBalance - usdcBuy) }
  }
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
