import type { Agent, LLMDecision } from '@agent-arena/shared'

export async function runAgentLoop(agent: Agent): Promise<void> {
  console.log(`[${agent.name}] Starting loop...`)

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await runOneCycle(agent)
    } catch (err) {
      console.error(`[${agent.name}] Cycle error:`, err)
      // Never crash — log and continue
    }
    await sleep(Number(process.env.AGENT_LOOP_INTERVAL_MS ?? 60_000))
  }
}

async function runOneCycle(agent: Agent): Promise<void> {
  // 1. Fetch market data
  // 2. Call LLM
  // 3. Execute swap if BUY/SELL
  // 4. Update PnL
  // 5. Persist to 0G Storage
  console.log(`[${agent.name}] Cycle complete (stub)`)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
