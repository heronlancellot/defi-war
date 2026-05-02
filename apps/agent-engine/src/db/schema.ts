import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = process.env.DATABASE_URL?.replace('sqlite://', '') ?? path.join(process.cwd(), 'agent_arena.db')

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    runMigrations(db)
  }
  return db
}

function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      ens_name TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      private_key TEXT NOT NULL,
      strategy TEXT NOT NULL,
      pnl_total REAL DEFAULT 0,
      pnl_last_trade REAL DEFAULT 0,
      trade_count INTEGER DEFAULT 0,
      portfolio_eth REAL DEFAULT 0.1,
      portfolio_usdc REAL DEFAULT 200.0,
      last_trade TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      action TEXT NOT NULL,
      token_in TEXT NOT NULL,
      token_out TEXT NOT NULL,
      amount_in TEXT NOT NULL,
      amount_out TEXT NOT NULL,
      tx_hash TEXT,
      pnl REAL NOT NULL,
      reasoning TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );
  `)
}

export function createAgent(agent: {
  id: string
  name: string
  ensName: string
  walletAddress: string
  privateKey: string
  strategy: string
}) {
  const db = getDb()
  db.prepare(`
    INSERT INTO agents (id, name, ens_name, wallet_address, private_key, strategy, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(agent.id, agent.name, agent.ensName, agent.walletAddress, agent.privateKey, agent.strategy, new Date().toISOString())
}

export function getAllAgents() {
  return getDb().prepare('SELECT * FROM agents ORDER BY pnl_total DESC').all() as any[]
}

export function getAgentById(id: string) {
  return getDb().prepare('SELECT * FROM agents WHERE id = ?').get(id) as any
}

export function updateAgentPnl(
  id: string,
  pnlTotal: number,
  pnlLastTrade: number,
  portfolioEth: number,
  portfolioUsdc: number,
  lastTrade: string,
) {
  getDb().prepare(`
    UPDATE agents SET pnl_total = ?, pnl_last_trade = ?, portfolio_eth = ?, portfolio_usdc = ?, last_trade = ?, trade_count = trade_count + 1 WHERE id = ?
  `).run(pnlTotal, pnlLastTrade, portfolioEth, portfolioUsdc, lastTrade, id)
}

export function saveTrade(trade: {
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
}) {
  getDb().prepare(`
    INSERT INTO trades (id, agent_id, action, token_in, token_out, amount_in, amount_out, tx_hash, pnl, reasoning, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
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
  )
}
