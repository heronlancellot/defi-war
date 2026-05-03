import { parseEther, formatUnits } from 'viem'
import { getQuote, TOKENS } from '../uniswap/api.js'

export interface MarketData {
  eth: number
  ethChange1h: number
  ethChange24h: number
  volume24h: number
  liquidity: number
}

// 60-second cache to avoid hammering APIs on every agent cycle
let cache: { data: MarketData; ts: number } | null = null
let pendingFetch: Promise<MarketData> | null = null
const CACHE_MS = 60_000

export async function fetchMarketData(): Promise<MarketData> {
  if (cache && Date.now() - cache.ts < CACHE_MS) {
    return cache.data
  }
  // If another agent already triggered a fetch, wait for it (avoid parallel API calls)
  if (pendingFetch) return pendingFetch

  pendingFetch = doFetch().finally(() => { pendingFetch = null })
  return pendingFetch
}

async function doFetch(): Promise<MarketData> {
  // Fetch both sources in parallel — use whichever succeeds
  const [uniswapResult, geckoResult] = await Promise.allSettled([
    fetchUniswapPrice(),
    fetchCoinGeckoData(),
  ])

  const uniswapPrice = uniswapResult.status === 'fulfilled' ? uniswapResult.value : null
  const gecko = geckoResult.status === 'fulfilled' ? geckoResult.value : null

  const data: MarketData = {
    // Prefer Unichain on-chain price; fall back to CoinGecko mainnet price
    eth: uniswapPrice ?? gecko?.eth ?? 0,
    ethChange1h: gecko?.ethChange1h ?? 0,
    ethChange24h: gecko?.ethChange24h ?? 0,
    volume24h: gecko?.volume24h ?? 0,
    liquidity: gecko?.liquidity ?? 0,
  }

  if (data.eth === 0) {
    console.warn('[Market] Could not fetch ETH price from any source')
    if (cache) return cache.data
  } else {
    console.log(`[Market] ETH $${data.eth.toFixed(2)} | 1h: ${data.ethChange1h.toFixed(2)}% | 24h: ${data.ethChange24h.toFixed(2)}% | src: ${uniswapPrice ? 'uniswap+gecko' : 'gecko-only'}`)
    cache = { data, ts: Date.now() }
  }

  return data
}


// Get actual on-chain price from Unichain via Uniswap quote (1 WETH → USDC)
async function fetchUniswapPrice(): Promise<number | null> {
  if (!process.env.UNISWAP_API_KEY) return null
  try {
    const oneEth = parseEther('1').toString()
    // Use a burn address as swapper — we only need the quote, not to execute
    const quote = await getQuote(TOKENS.ETH_NATIVE, TOKENS.USDC, oneEth, '0x000000000000000000000000000000000000dEaD')
    // USDC has 6 decimals
    return Number(formatUnits(BigInt((quote.quote as any).output?.amount ?? '0'), 6))
  } catch {
    return null
  }
}

// CoinGecko free API — no key needed, provides 1h/24h change and volume
async function fetchCoinGeckoData(): Promise<MarketData | null> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=ethereum&price_change_percentage=1h,24h',
      { signal: AbortSignal.timeout(8_000) },
    )
    if (!res.ok) return null
    const [coin] = (await res.json()) as any[]
    if (!coin) return null
    return {
      eth: coin.current_price ?? 0,
      ethChange1h: coin.price_change_percentage_1h_in_currency ?? 0,
      ethChange24h: coin.price_change_percentage_24h ?? 0,
      volume24h: coin.total_volume ?? 0,
      liquidity: coin.market_cap ?? 0,
    }
  } catch {
    return null
  }
}
