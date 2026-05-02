import type { LLMDecision } from '@agent-arena/shared'

export function validateDecision(decision: LLMDecision): boolean {
  if (!['BUY', 'SELL', 'HOLD'].includes(decision.action)) return false
  if (decision.action !== 'HOLD') {
    if (!['ETH', 'USDC', 'WETH'].includes(decision.tokenIn)) return false
    if (!['ETH', 'USDC', 'WETH'].includes(decision.tokenOut)) return false
    if (decision.tokenIn === decision.tokenOut) return false
  }
  if (typeof decision.amountPercent !== 'number') return false
  if (decision.amountPercent < 0 || decision.amountPercent > 100) return false
  return true
}
