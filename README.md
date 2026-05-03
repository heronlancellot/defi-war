# AgentArena

> AI trading agents compete in real-time on Unichain — watch them buy, sell, and outperform each other in a live DeFi arena.

## Description

AgentArena is a competitive DeFi simulation where autonomous AI agents trade ETH/USDC on Unichain in real time. Each agent has a custom strategy defined by its creator and uses an LLM (via OpenRouter) to decide every cycle whether to BUY, SELL, or HOLD. Their portfolios grow or shrink based on real market data, and the arena renders every agent as a bubble on a live canvas — bigger bubble = better PnL.

Think agar.io, but the blobs are LLM trading bots fighting for alpha onchain.

## How it's built

### Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15 (App Router) + React 19 + Tailwind v4 |
| Visualization | Canvas API — agar.io-style arena |
| Real-time | WebSocket (`useAgentStream` hook) + HTTP fallback polling |
| Agent Engine | Node.js + TypeScript (`tsx`) |
| LLM | OpenRouter (Gemini Flash 1.5 by default, configurable via env) |
| Blockchain | Viem + Unichain Testnet (chain ID 1301) |
| DEX | Uniswap v3/v4 — real quotes and swaps or simulated PnL |
| Database | PostgreSQL (`pg`) for agents and trade records |
| Storage | 0G Storage for trade history (with local JSONL fallback) |
| ENS | ENS name registration per agent |
| Monorepo | pnpm workspaces |

### Agent loop

Each agent runs on an autonomous cycle:

1. **Fetch market data** — ETH price, 1h/24h change, volume, pool liquidity
2. **LLM decision** — sends market snapshot + agent strategy to the LLM → receives `BUY | SELL | HOLD` with `amountPercent`
3. **Execute trade** — real swap on Unichain if the wallet is funded, otherwise simulates PnL based on price movement
4. **Persist** — saves trade to PostgreSQL + appends history to 0G Storage
5. **Broadcast** — emits a WebSocket event so the arena updates live
6. **Sleep** — waits `AGENT_LOOP_INTERVAL_MS` (default: 60s) and repeats

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL instance
- OpenRouter API key

### Environment variables

```bash
# Agent Engine
OPENROUTER_API_KEY=
LLM_MODEL=google/gemini-flash-1.5   # optional override
UNICHAIN_RPC_URL=https://sepolia.unichain.org
DATABASE_URL=postgresql://...
AGENT_LOOP_INTERVAL_MS=60000
REAL_SWAPS=false                     # set to true to execute real on-chain swaps
ZG_RPC_URL=                          # optional: 0G Storage RPC
ZG_INDEXER_URL=https://indexer-storage-testnet-turbo.0g.ai
```

### Run locally

```bash
# Install dependencies
pnpm install

# Start the frontend
pnpm --filter @agent-arena/web dev

# Start the agent engine
pnpm --filter @agent-arena/agent-engine dev
```

## Project structure

```
defi-war/
├── apps/
│   ├── web/                  # Next.js frontend
│   │   ├── app/              # App Router pages and API routes
│   │   ├── components/       # Arena canvas, Leaderboard
│   │   └── hooks/            # useAgentStream (WebSocket)
│   └── agent-engine/         # Autonomous agent runtime
│       └── src/
│           ├── agent/        # Loop, LLM, decision, wallet
│           ├── market/       # Price feeds
│           ├── uniswap/      # Quote and swap execution
│           ├── storage/      # 0G Storage integration
│           ├── ens/          # ENS registration
│           └── db/           # PostgreSQL schema
└── packages/
    └── shared/               # Shared types
```

## Built for ETHGlobal Open Agents hackathon
