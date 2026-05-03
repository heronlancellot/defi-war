import { getQuote } from './api.js'
import type { UniswapQuoteResponse } from './api.js'

export async function getBestQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  walletAddress: string,
): Promise<UniswapQuoteResponse> {
  return getQuote(tokenIn, tokenOut, amountIn, walletAddress)
}
