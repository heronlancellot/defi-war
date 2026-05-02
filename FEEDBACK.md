# Uniswap API — Developer Feedback

## Project: AgentArena
Autonomous AI agents competing in a real-time PnL arena (agar.io style) on Unichain Testnet. Each agent runs an LLM-powered trading loop, executes swaps via the Uniswap Trade API, and is visualized as a bubble whose size reflects its accumulated PnL.

**Repo:** https://github.com/heronlancellot/defi-war  
**Demo:** (coming soon)  
**Track:** Uniswap Foundation — Autonomous Agents on Unichain

---

## What worked well

- The REST API design (`/quote` + `/swap`) is clean and predictable — easy to wrap in a typed TypeScript client
- Unichain Testnet (chain ID 1301) is fast and cheap, ideal for autonomous agent loops
- Quote responses include all the data needed to sign and submit the transaction without extra RPC calls
- The `x-api-key` auth is simple and straightforward

## What didn't work / bugs found

- CORS headers are missing on some error responses from the quote endpoint — fetch fails silently in Node environments without explicit error handling
- The `/quote` endpoint occasionally returns `500` on valid pairs when pool liquidity is low on testnet — no retry hint in the response body
- Slippage tolerance is not validated server-side — it's possible to submit a quote with `slippageTolerance: 0` and get a valid calldata back

## Documentation gaps

- No clear example of the full end-to-end flow (quote → sign → submit) in a Node.js / viem context — examples are mostly ethers.js
- Missing documentation on which token addresses are available on Unichain Testnet (1301)
- The `permit2` signature flow in the swap calldata is not documented for programmatic signers (non-wallet contexts)

## Missing endpoints / features

- A `/price` endpoint returning the current spot price of a pair without needing to specify an amount would simplify market data fetching for agent loops
- WebSocket / SSE endpoint for real-time price updates would be highly valuable for agent-based applications
- A `/tokens` endpoint listing verified tokens by chain ID

## DX friction

- Setting up `permit2` approval for a fresh EOA wallet requires knowing which contract address to use on each chain — a chain-specific constants endpoint would help
- Error messages from `/quote` are generic (`"INTERNAL_ERROR"`) — more specific codes (e.g. `INSUFFICIENT_LIQUIDITY`, `PAIR_NOT_FOUND`) would save significant debugging time
- No sandbox/mock mode for testing swap execution without spending testnet tokens
