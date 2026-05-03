# Uniswap Trade API — Developer Feedback

## Project: AgentArena
Autonomous AI agents competing in a real-time PnL arena (agar.io style) on Unichain Testnet. Each agent runs an LLM-powered trading loop, executes swaps via the Uniswap Trade API, and is visualized as a bubble whose size reflects its accumulated PnL.

**Repo:** https://github.com/heronlancellot/defi-war  
**Track:** Uniswap Foundation — Autonomous Agents on Unichain  
**Hackathon:** ETHGlobal Open Agents

---

## What worked well

- The REST API design (`/quote` + `/swap`) is clean and predictable — easy to wrap in a typed TypeScript client
- Unichain Testnet (chain ID 1301) is fast and cheap, ideal for autonomous agent loops that fire every 60 s
- Quote responses include all the data needed to sign and submit the transaction without extra RPC calls
- The `x-api-key` header auth is simple and requires zero SDK overhead
- Permit2 integration works end-to-end once the approval flow is understood — the signed calldata from `/swap` just goes straight to `sendRawTransaction`

---

## What didn't work / bugs found

- **CORS headers missing on some error responses** from the `/quote` endpoint — when the API returns a 4xx/5xx, the preflight fails and `fetch` throws a network error in Node environments with no useful message. Had to wrap every call in a try/catch that re-reads the raw body to get any signal.
- **Occasional `500` on valid pairs when pool liquidity is low on testnet** — the response body is a generic `{"error":"INTERNAL_ERROR"}` with no retry hint or estimated recovery time. We added a 3-retry with exponential backoff, but it was guesswork.
- **Slippage tolerance not validated server-side** — submitting `slippageTolerance: 0` returns valid calldata. This led to a silent failure in simulation: our agent got filled at 0% slippage tolerance but real execution would've reverted.
- **Permit2 approval race on fresh wallets** — on first BUY with USDC, the engine needs to issue an `approve(permit2Address, MaxUint256)` before the swap can execute. The timing window between approval confirmation and the swap call occasionally triggered a `PERMIT2_NOT_APPROVED` revert, especially when testnet was congested.

---

## What we couldn't finish / blocked by

- **ENS registration** — intended to register each agent as a subname under `arena.eth` (gasless via off-chain resolver). Blocked on: (a) no public `arena.eth` parent domain available on Unichain Testnet, and (b) `@ensdomains/ensjs` documentation for programmatic subname registration with a custom parent is sparse. The `register.ts` file exists but only logs the intent. ENS names appear as `agent-<uuid>.arena.eth` in the UI but are never actually registered on-chain.
- **Real on-chain swaps at scale** — we got individual swaps working manually, but running 5+ agents simultaneously with `REAL_SWAPS=true` hit testnet faucet rate limits fast. Most of the demo runs on simulation mode (real price data, no broadcast tx). The simulation path is accurate — PnL is calculated from real CoinGecko deltas — but it's not truly on-chain.
- **0G Storage reliability** — appending trade history to 0G worked in isolation but the indexer query (`GET /v1/query?prefix=...`) returned stale results under load. We fallback to local JSONL automatically, but the 0G integration is best-effort and not battle-tested.

---

## Documentation gaps

- **No end-to-end Node.js + Viem example** for the full `quote → permit2 sign → submit` flow. All examples in the docs use ethers.js. Porting the permit2 signing flow to Viem (`signTypedData` with the exact EIP-712 domain) required reading the Uniswap SDK source code.
- **No token list for Unichain Testnet (chain ID 1301)** — we hardcoded ETH_NATIVE, WETH (`0x4200...0006`), and USDC (`0x31d0...1D`) based on community Discord messages, not official docs.
- **Permit2 contract address on Unichain Testnet** — not documented anywhere official; we found `0x000000000022D473030F116dDEE9F6B43aC78BA3` via block explorer search.
- **Rate limits not documented** — we hit 429s on the `/quote` endpoint under multi-agent load. The retry-after header wasn't always present. We added an 8 s minimum gap between LLM + API calls as a heuristic.

---

## Missing endpoints / features (wishlist)

- **`GET /price?tokenIn=&tokenOut=&chainId=`** — a lightweight spot price endpoint that doesn't require specifying an input amount. Our market data loop calls `/quote` with 1 ETH just to get the price, which is wasteful and counts against rate limits.
- **WebSocket or SSE for real-time price updates** — would eliminate the need to poll and would let agent loops react to price movements instantly rather than on a fixed interval.
- **`GET /tokens?chainId=`** — a verified token list per chain. Critical for agents that want to explore new pairs without hardcoding addresses.
- **`GET /pools?chainId=&tokenA=&tokenB=`** — pool metadata (TVL, fee tier, address) to let agents filter for liquid pairs before requesting a quote.
- **Sandbox / simulation mode** — a flag or separate endpoint to simulate swap execution without broadcasting, returning expected output amounts and gas. This would have saved us significant debugging time during development.

---

## DX friction

- **Setting up permit2 on a fresh EOA** requires knowing: (a) the permit2 contract address per chain, (b) the correct `approve` call target, and (c) the EIP-712 domain fields used in the signed payload — none of which are in one place in the docs.
- **Error codes are too generic** — `"INTERNAL_ERROR"` from `/quote` and `/swap` covers a wide range of failures. More specific codes like `INSUFFICIENT_LIQUIDITY`, `PAIR_NOT_FOUND`, `AMOUNT_TOO_SMALL`, `SLIPPAGE_EXCEEDED` would have cut our debugging time significantly.
- **No mock/local mode** — during development we needed real testnet tokens just to test the parsing and signing logic. A mock server that returns realistic but fake quotes (like `viem` test clients do) would be very helpful.
- **Chain ID typo danger** — passing the wrong chain ID returns a 200 with an empty result, not an error. We wasted a day debugging because `1301` (Unichain Testnet) and `130` (a different chain) are easy to confuse.

---

## Overall assessment

The Uniswap Trade API is genuinely useful for autonomous agent use cases — the quote/swap REST interface is clean and the permit2 calldata is production-ready. The main friction points are documentation (especially for Viem/non-ethers contexts and Unichain Testnet specifics) and error observability. With a proper error code vocabulary, a spot-price endpoint, and a token list API, building agents like AgentArena would be significantly faster.
