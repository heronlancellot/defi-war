// Chain: Unichain Testnet chain ID 1301
// Base: https://trade-api.gateway.uniswap.org/v1

const UNISWAP_BASE = 'https://trade-api.gateway.uniswap.org/v1'
const UNICHAIN_TESTNET_ID = 1301

// Token addresses Unichain testnet
export const TOKENS = {
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x078D888E40faAe0f32594342c85940F9bb0b621',
}

export interface UniswapQuote {
  chainId: number
  swapper: string
  input: {
    token: string
    amount: string
  }
  output: {
    token: string
    amount: string
    minimumAmount: string
  }
  slippage: {
    tolerance: string
  }
  tradeType: string
  route: unknown[]
  gasFee: string
  gasFeeUSD: string
  gasFeeQuote: string
  gasUseEstimate: string
  routeString: string
  blockNumber: string
  quoteId: string
  permitData?: {
    eip712: unknown
  }
  methodParameters?: {
    calldata: string
    value: string
    to: string
  }
}

export async function getQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  walletAddress: string,
): Promise<UniswapQuote> {
  const apiKey = process.env.UNISWAP_API_KEY
  if (!apiKey) throw new Error('UNISWAP_API_KEY not set')

  const params = new URLSearchParams({
    tokenInChainId: String(UNICHAIN_TESTNET_ID),
    tokenOutChainId: String(UNICHAIN_TESTNET_ID),
    tokenIn,
    tokenOut,
    amount: amountIn,
    swapper: walletAddress,
    type: 'EXACT_INPUT',
  })

  const url = `${UNISWAP_BASE}/quote?${params.toString()}`
  const res = await fetch(url, {
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Uniswap quote failed: ${res.status} ${body}`)
  }

  return res.json() as Promise<UniswapQuote>
}
