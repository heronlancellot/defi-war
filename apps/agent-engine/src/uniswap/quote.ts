import { getQuote } from './api.js'
import type { UniswapQuote } from './api.js'

export async function getBestQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  walletAddress: string,
): Promise<UniswapQuote> {
  return getQuote(tokenIn, tokenOut, amountIn, walletAddress)
}
