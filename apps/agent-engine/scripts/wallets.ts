/**
 * Show all agent wallets + private keys
 * Usage: pnpm tsx scripts/wallets.ts
 */
import 'dotenv/config'
import { Pool } from 'pg'

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/defi',
  })

  const res = await pool.query('SELECT * FROM agents ORDER BY created_at ASC')
  const agents = res.rows

  console.log('\n=== AgentArena Wallets ===\n')
  for (const a of agents) {
    console.log(`Agent:       ${a.name}`)
    console.log(`ENS:         ${a.ens_name}`)
    console.log(`Address:     ${a.wallet_address}`)
    console.log(`Private Key: ${a.private_key}`)
    console.log(`Strategy:    ${a.strategy.slice(0, 60)}...`)
    console.log(`PnL:         ${Number(a.pnl_total).toFixed(4)}% (${a.trade_count} trades)`)
    console.log(`Faucet:      https://faucet.unichain.org/?address=${a.wallet_address}`)
    console.log('─'.repeat(60))
  }

  console.log(`\nTotal: ${agents.length} agents`)
  console.log('\nFund each address with testnet ETH on Unichain Sepolia (chain 1301)')
  console.log('Faucet: https://faucet.unichain.org\n')

  await pool.end()
}

main().catch(console.error)
