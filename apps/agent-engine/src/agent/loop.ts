import type { Agent as AgentType, LLMDecision } from '@agent-arena/shared'
import { getLLMDecision } from './llm.js'
import { validateDecision } from './decision.js'
import { fetchMarketData } from '../market/prices.js'
import { getAllAgents, getAgentById, updateAgentPnl, saveTrade } from '../db/schema.js'
import { appendTradeHistory } from '../storage/0g.js'
import { arenaEvents } from '../events.js'

// Active agent loops (agentId → true)
const runningLoops = new Map<string, boolean>()

export function startAllAgentLoops() {
  const agents = getAllAgents()
  console.log(`[Engine] Starting loops for ${agents.length} agent(s)`)
  for (const agent of agents) {
    startAgentLoop(agent.id)
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

async function runOneCycle(agentId: string) {
  const row = getAgentById(agentId)
  if (!row) return

  const agent = dbRowToAgent(row)
  console.log(`[${agent.name}] Starting cycle...`)

  // 1. Fetch market data
  const market = await fetchMarketData()

  // 2. LLM decision
  let decision: LLMDecision
  try {
    decision = await getLLMDecision(agent, market)
    if (!validateDecision(decision)) throw new Error('Invalid decision from LLM')
  } catch (err) {
    console.warn(`[${agent.name}] LLM error, defaulting to HOLD:`, err)
    decision = { action: 'HOLD', tokenIn: 'ETH', tokenOut: 'USDC', amountPercent: 0, reasoning: 'LLM error' }
  }

  console.log(`[${agent.name}] Decision: ${decision.action} | ${decision.reasoning}`)

  if (decision.action === 'HOLD') return

  // 3. Simulate trade (Phase 2 — real swap in Phase 3)
  const pnlChange = simulatePnl(decision, market)
  const newPnlTotal = agent.pnlTotal + pnlChange

  let newEth = agent.portfolioEth ?? 0.1
  let newUsdc = agent.portfolioUsdc ?? 200

  if (decision.action === 'BUY' && decision.tokenIn === 'USDC') {
    const usdcSpend = newUsdc * (decision.amountPercent / 100)
    const ethBought = usdcSpend / market.eth
    newUsdc -= usdcSpend
    newEth += ethBought
  } else if (decision.action === 'SELL' && decision.tokenIn === 'ETH') {
    const ethSell = newEth * (decision.amountPercent / 100)
    const usdcGained = ethSell * market.eth
    newEth -= ethSell
    newUsdc += usdcGained
  }

  // 4. Persist
  const tradeId = crypto.randomUUID()
  saveTrade({
    id: tradeId,
    agentId,
    action: decision.action,
    tokenIn: decision.tokenIn,
    tokenOut: decision.tokenOut,
    amountIn: decision.amountPercent.toString(),
    amountOut: '0',
    pnl: pnlChange,
    reasoning: decision.reasoning,
  })

  updateAgentPnl(agentId, newPnlTotal, pnlChange, newEth, newUsdc, `${decision.action} ${decision.tokenIn}->${decision.tokenOut}`)

  // Fire-and-forget: persist to 0G Storage (or local fallback)
  appendTradeHistory({
    agentId,
    action: decision.action,
    tokenIn: decision.tokenIn,
    tokenOut: decision.tokenOut,
    pnl: pnlChange,
    reasoning: decision.reasoning,
    timestamp: new Date().toISOString(),
  }).catch(() => {}) // never blocks the loop

  // Emit event so WebSocket server can broadcast to clients
  arenaEvents.emit('agent:updated', agentId)

  console.log(`[${agent.name}] Trade done | PnL: ${pnlChange.toFixed(2)}% | Total: ${newPnlTotal.toFixed(2)}%`)
}

function simulatePnl(decision: LLMDecision, market: { ethChange1h: number }): number {
  // Simulated PnL based on price movement and decision direction
  const priceMove = market.ethChange1h
  const correct = (decision.action === 'BUY' && priceMove > 0) || (decision.action === 'SELL' && priceMove < 0)
  const magnitude = Math.abs(priceMove) * (decision.amountPercent / 100) * 0.3
  return correct ? magnitude : -magnitude
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
