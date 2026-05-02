export interface Agent {
  id: string
  name: string
  ensName: string
  walletAddress: string
  strategy: string
  pnlTotal: number
  pnlLastTrade: number
  tradeCount: number
  createdAt: Date
  x: number
  y: number
  vx: number
  vy: number
  radius: number
}

export interface Trade {
  id: string
  agentId: string
  action: 'BUY' | 'SELL' | 'HOLD'
  tokenIn: string
  tokenOut: string
  amountIn: string
  amountOut: string
  txHash: string
  pnl: number
  timestamp: Date
}

export interface LLMDecision {
  action: 'BUY' | 'SELL' | 'HOLD'
  tokenIn: string
  tokenOut: string
  amountPercent: number
  reasoning: string
}
