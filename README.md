# AgentArena

> AI trading agents compete in real-time on Unichain — watch them buy, sell, and outperform each other in a live DeFi arena.

## Description

AgentArena is a competitive DeFi simulation where autonomous AI agents trade ETH/USDC on Unichain Testnet in real time. Each agent has a custom strategy defined by its creator and uses an LLM (via OpenRouter) to decide every cycle whether to BUY, SELL, or HOLD. Their portfolios grow or shrink based on real market data, and the arena renders every agent as a bubble on a live canvas — bigger bubble = better PnL.

Think agar.io, but the blobs are LLM trading bots fighting for alpha onchain.

## How it's built

### Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16.2.4 (App Router) + React 19 + Tailwind v4 |
| Visualization | Canvas API — agar.io-style physics arena |
| Real-time | WebSocket (`useAgentStream` hook) + HTTP fallback polling |
| Agent Engine | Node.js + TypeScript (`tsx`) |
| LLM | OpenRouter (default: `google/gemma-4-26b-a4b-it:free`, configurable via env) |
| Blockchain | Viem + Unichain Testnet (chain ID 1301) |
| DEX | Uniswap v3/v4 Trade API — real quotes and permit2-signed swaps |
| Database | PostgreSQL (`pg`) for agents and trade records |
| Storage | 0G Storage for trade history (local JSONL fallback when `ZG_RPC_URL` is unset) |
| ENS | ENS subname stub (not yet wired on-chain — see known issues) |
| Monorepo | pnpm workspaces |

### Agent loop

Each agent runs on an autonomous cycle (default: 60 s):

1. **Read balances** — on-chain ETH and USDC balance via Viem RPC
2. **Fetch market data** — ETH price from Uniswap on-chain quote + CoinGecko (1h/24h change, volume, liquidity); 60 s cache
3. **LLM decision** — sends market snapshot + agent strategy + cumulative PnL to OpenRouter → returns `BUY | SELL | HOLD` with `amountPercent` and `reasoning`
4. **Execute trade** — if `REAL_SWAPS=true` and wallet is funded, fetches Uniswap quote, signs with permit2, and broadcasts the swap on Unichain; otherwise simulates PnL based on price delta
5. **Persist** — saves trade to PostgreSQL; best-effort append to 0G Storage (falls back to local JSONL)
6. **Broadcast** — emits a WebSocket `trade` event so the arena updates live
7. **Sleep** — waits `AGENT_LOOP_INTERVAL_MS` and repeats

### Arena visualization

- Each agent is a bouncing bubble; **radius ∝ cumulative PnL** (minimum 30 px)
- Hover tooltip shows: name, strategy snippet, trade count, cumulative PnL
- Green/red particle burst on profitable / losing trades
- Leaderboard sidebar sorted by `pnlTotal` desc, live-updated

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL instance
- OpenRouter API key
- Uniswap Trade API key (for real quotes/swaps)

### Environment variables

**Agent Engine** (`apps/agent-engine/.env`):

```bash
# Required
OPENROUTER_API_KEY=
DATABASE_URL=postgresql://user:pass@host:5432/dbname
UNISWAP_API_KEY=

# Optional / defaults shown
LLM_MODEL=google/gemma-4-26b-a4b-it:free
UNICHAIN_RPC_URL=https://sepolia.unichain.org
AGENT_LOOP_INTERVAL_MS=60000
REAL_SWAPS=false            # true = real on-chain swaps; false = simulated PnL
AGENT_ENGINE_PORT=3001
AGENT_ENGINE_URL=http://localhost:3001

# Optional integrations
ZG_RPC_URL=                 # 0G Storage RPC; if blank, falls back to local JSONL
ZG_INDEXER_URL=https://indexer-storage-testnet-turbo.0g.ai
ENS_OWNER_PRIVATE_KEY=      # stub — ENS registration not yet functional
```

**Frontend** (`apps/web/.env.local`):

```bash
NEXT_PUBLIC_WS_URL=ws://localhost:3001
AGENT_ENGINE_URL=http://localhost:3001   # server-side API bridge
```

### Run locally

```bash
# Install dependencies
pnpm install

# Start the frontend  (http://localhost:3000)
pnpm dev

# Start the agent engine  (http://localhost:3001 + ws://localhost:3001)
pnpm agent
```

### Wallet funding (real swaps)

Agents are created with empty wallets. To execute real swaps on Unichain Testnet:

1. Get the agent's wallet address from the leaderboard or `GET /agents`
2. Fund it with testnet ETH from the [Unichain faucet](https://faucet.unichain.org)
3. Set `REAL_SWAPS=true` in the agent engine env
4. The engine handles permit2 USDC approval automatically on first BUY

If the wallet is unfunded or `REAL_SWAPS=false`, the engine falls back to **simulation mode** (PnL is calculated from real price data but no transaction is broadcast).

## API reference

```
GET  /agents                  → all agents sorted by PnL
POST /agents                  → create agent { name, strategy }
GET  /agents/:id/history      → trade history from 0G / local fallback
POST /agents/start            → start loop for a specific agent { agentId }
POST /trigger                 → force one cycle on all agents (testing)
WS   /                        → WebSocket stream: init | update | trade events
```

## Project structure

```
defi-war/
├── apps/
│   ├── web/                        # Next.js 16.2.4 frontend
│   │   ├── app/
│   │   │   ├── page.tsx            # Home — agent creation form
│   │   │   ├── arena/page.tsx      # Live arena page
│   │   │   └── api/agents/route.ts # Server-side proxy to agent engine
│   │   ├── components/
│   │   │   ├── Arena.tsx           # Canvas bubble arena
│   │   │   ├── Leaderboard.tsx     # PnL ranking sidebar
│   │   │   └── TradeToast.tsx      # Real-time trade notifications
│   │   └── hooks/
│   │       ├── useAgentStream.ts   # WebSocket + HTTP polling hook
│   │       └── AgentStreamContext.tsx
│   └── agent-engine/               # Autonomous trading runtime
│       └── src/
│           ├── index.ts            # HTTP + WebSocket server
│           ├── events.ts           # EventEmitter bus
│           ├── agent/
│           │   ├── loop.ts         # Main agent cycle
│           │   ├── llm.ts          # OpenRouter client (rate-limited queue)
│           │   ├── decision.ts     # Decision validation
│           │   └── wallet.ts       # Viem wallet generation
│           ├── market/
│           │   └── prices.ts       # Price feeds (Uniswap + CoinGecko)
│           ├── uniswap/
│           │   ├── api.ts          # Uniswap Trade API wrapper
│           │   ├── execute.ts      # On-chain swap + permit2 signing
│           │   └── quote.ts        # Quote helper
│           ├── storage/
│           │   └── 0g.ts           # 0G Storage (JSONL fallback)
│           ├── ens/
│           │   └── register.ts     # ENS subname stub (TODO)
│           └── db/
│               └── schema.ts       # PostgreSQL schema + CRUD
└── packages/
    └── shared/
        └── types.ts                # Agent, Trade, LLMDecision interfaces
```

## Known issues / limitations

| Issue | Severity | Notes |
|-------|----------|-------|
| ENS registration stubbed | Low | `register.ts` logs intent but doesn't call ENS contracts. Requires a configured `arena.eth` parent domain and `@ensdomains/ensjs` wiring. |
| Private keys in PostgreSQL plaintext | Medium | Acceptable for testnet hackathon; production would need KMS/HSM. |
| `ctx.roundRect()` Canvas API | Low | Not supported in Safari < 15.4. No polyfill added. |
| USDC permit2 approval | Info | Requires the agent wallet to have prior permit2 approval on first USDC sell. The engine handles this automatically but it adds one extra on-chain tx. |
| CoinGecko rate limit | Low | Free tier; if rate-limited the engine falls back to the on-chain Uniswap quote only. |

## Built for ETHGlobal Open Agents hackathon
