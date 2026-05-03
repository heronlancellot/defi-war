import { Pool } from 'pg'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/agent_arena',
})

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message)
})

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      ens_name TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      private_key TEXT NOT NULL,
      strategy TEXT NOT NULL,
      pnl_total DOUBLE PRECISION DEFAULT 0,
      pnl_last_trade DOUBLE PRECISION DEFAULT 0,
      trade_count INTEGER DEFAULT 0,
      portfolio_eth DOUBLE PRECISION DEFAULT 0.1,
      portfolio_usdc DOUBLE PRECISION DEFAULT 200.0,
      last_trade TEXT,
      created_at TEXT NOT NULL
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      action TEXT NOT NULL,
      token_in TEXT NOT NULL,
      token_out TEXT NOT NULL,
      amount_in TEXT NOT NULL,
      amount_out TEXT NOT NULL,
      tx_hash TEXT,
      pnl DOUBLE PRECISION NOT NULL,
      reasoning TEXT,
      timestamp TEXT NOT NULL
    )
  `)

  console.log('[DB] PostgreSQL connected and migrations applied')
}

export async function seedDemoAgents(): Promise<void> {
  const demos = [
    { name: 'alpha-trader',  strategy: 'Buy ETH when 1h change is negative (dip buy), sell when up 2%+. Aggressive.' },
    { name: 'beta-bot',      strategy: 'Mean reversion: sell ETH when it rises fast, buy when it drops fast.' },
    { name: 'gamma-agent',   strategy: 'Momentum trader: follow the trend. Buy when rising, sell when falling.' },
    { name: 'delta-scalper', strategy: 'Scalp small moves. Always use 20% of portfolio. High frequency.' },
    { name: 'epsilon-hodl',  strategy: 'Long-term holder. Only buy dips bigger than 3%. Never sell unless up 10%.' },
    { name: 'test-trader',   strategy: 'TEST_AGENT: alternates SELL/BUY every cycle to validate swap execution.' },
  ]

  let inserted = 0
  for (const d of demos) {
    const privateKey = generatePrivateKey()
    const account = privateKeyToAccount(privateKey)
    const res = await pool.query(
      `INSERT INTO agents (id, name, ens_name, wallet_address, private_key, strategy, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (name) DO NOTHING`,
      [
        crypto.randomUUID(),
        d.name,
        `${d.name}.arena.eth`,
        account.address,
        privateKey,
        d.strategy,
        new Date().toISOString(),
      ],
    )
    if (res.rowCount && res.rowCount > 0) inserted++
  }
  if (inserted > 0) console.log(`[DB] Seeded ${inserted} new agent(s)`)
}

export async function createAgent(agent: {
  id: string
  name: string
  ensName: string
  walletAddress: string
  privateKey: string
  strategy: string
}): Promise<void> {
  await pool.query(
    `INSERT INTO agents (id, name, ens_name, wallet_address, private_key, strategy, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [agent.id, agent.name, agent.ensName, agent.walletAddress, agent.privateKey, agent.strategy, new Date().toISOString()],
  )
}

export async function getAllAgents(): Promise<any[]> {
  const res = await pool.query('SELECT * FROM agents ORDER BY pnl_total DESC')
  return res.rows
}

export async function getAgentById(id: string): Promise<any | null> {
  const res = await pool.query('SELECT * FROM agents WHERE id = $1', [id])
  return res.rows[0] ?? null
}

export async function updateAgentPnl(
  id: string,
  pnlTotal: number,
  pnlLastTrade: number,
  portfolioEth: number,
  portfolioUsdc: number,
  lastTrade: string,
): Promise<void> {
  await pool.query(
    `UPDATE agents
     SET pnl_total = $1, pnl_last_trade = $2, portfolio_eth = $3,
         portfolio_usdc = $4, last_trade = $5, trade_count = trade_count + 1
     WHERE id = $6`,
    [pnlTotal, pnlLastTrade, portfolioEth, portfolioUsdc, lastTrade, id],
  )
}

export async function saveTrade(trade: {
  id: string
  agentId: string
  action: string
  tokenIn: string
  tokenOut: string
  amountIn: string
  amountOut: string
  txHash?: string
  pnl: number
  reasoning?: string
}): Promise<void> {
  await pool.query(
    `INSERT INTO trades (id, agent_id, action, token_in, token_out, amount_in, amount_out, tx_hash, pnl, reasoning, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      trade.id,
      trade.agentId,
      trade.action,
      trade.tokenIn,
      trade.tokenOut,
      trade.amountIn,
      trade.amountOut,
      trade.txHash ?? null,
      trade.pnl,
      trade.reasoning ?? null,
      new Date().toISOString(),
    ],
  )
}
