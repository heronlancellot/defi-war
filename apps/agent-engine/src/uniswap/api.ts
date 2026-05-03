const UNISWAP_BASE = 'https://trade-api.gateway.uniswap.org/v1'
const UNICHAIN_TESTNET_ID = 1301

export const TOKENS = {
  // Use native ETH address (zero address) so Uniswap handles wrapping — no permit2 needed for ETH in
  ETH_NATIVE: '0x0000000000000000000000000000000000000000',
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x31d0220469e10c4E71834a79b1f276d740d3768F',
}

export interface UniswapQuoteResponse {
  requestId?: string
  routing: string          // CLASSIC | DUTCH_V2 | DUTCH_V3 | PRIORITY
  permitData: {
    domain: Record<string, unknown>
    types: Record<string, unknown>
    values: Record<string, unknown>
  } | null
  quote: Record<string, unknown>  // inner quote object — passed as-is to /swap
}

function apiHeaders() {
  const apiKey = process.env.UNISWAP_API_KEY
  if (!apiKey) throw new Error('UNISWAP_API_KEY not set')
  return { 'x-api-key': apiKey, 'Content-Type': 'application/json' }
}

export async function getQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  walletAddress: string,
): Promise<UniswapQuoteResponse> {
  const res = await fetch(`${UNISWAP_BASE}/quote`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({
      type: 'EXACT_INPUT',
      amount: amountIn,
      tokenInChainId: UNICHAIN_TESTNET_ID,
      tokenOutChainId: UNICHAIN_TESTNET_ID,
      tokenIn,
      tokenOut,
      swapper: walletAddress,
      slippageTolerance: 0.5,
      routingPreference: 'BEST_PRICE',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Uniswap /quote failed: ${res.status} ${body}`)
  }

  return res.json() as Promise<UniswapQuoteResponse>
}

export interface SwapTransaction {
  to: string
  data: string
  value: string
  gasLimit?: string
}

// /swap expects the inner quote object (quoteResponse.quote), not the full /quote response
export async function getSwapTransaction(
  quoteResponse: UniswapQuoteResponse,
  signature?: string,
): Promise<SwapTransaction> {
  const body: Record<string, unknown> = { quote: quoteResponse.quote }
  if (signature && quoteResponse.permitData) {
    body.signature = signature
    body.permitData = quoteResponse.permitData
  }

  const bodyStr = JSON.stringify(body)
  console.log('[Uniswap] /swap body keys:', Object.keys(body), '| quote keys:', Object.keys(quoteResponse.quote).slice(0, 5))

  const res = await fetch(`${UNISWAP_BASE}/swap`, {
    method: 'POST',
    headers: apiHeaders(),
    body: bodyStr,
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('[Uniswap] /swap failed body snippet:', bodyStr.slice(0, 300))
    throw new Error(`Uniswap /swap failed: ${res.status} ${text}`)
  }

  const data = await res.json() as any

  // Response is a TransactionRequest at top level or nested under swap
  const tx = data?.swap ?? data
  if (!tx?.to || !tx?.data) {
    throw new Error(`/swap response missing transaction fields: ${JSON.stringify(data).slice(0, 400)}`)
  }

  return {
    to: tx.to,
    data: tx.data,
    value: tx.value ?? '0',
    gasLimit: tx.gasLimit,
  }
}
