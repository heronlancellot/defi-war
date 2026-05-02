export interface MarketData {
  eth: number
  ethChange1h: number
  ethChange24h: number
  volume24h: number
  liquidity: number
}

export async function fetchMarketData(): Promise<MarketData> {
  // TODO: Use CoinGecko or Uniswap subgraph
  // Stub for Phase 1:
  return {
    eth: 2000 + Math.random() * 200,
    ethChange1h: (Math.random() - 0.5) * 4,
    ethChange24h: (Math.random() - 0.5) * 10,
    volume24h: 50_000_000,
    liquidity: 120_000_000,
  }
}
