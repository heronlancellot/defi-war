/**
 * Show all agent wallets + private keys
 * Usage: pnpm tsx scripts/wallets.ts
 */
import 'dotenv/config'
import { getDb } from '../src/db/schema.js'

const db = getDb()
const agents = db.prepare('SELECT * FROM agents ORDER BY created_at ASC').all() as any[]

console.log('\n=== AgentArena Wallets ===\n')
for (const a of agents) {
  console.log(`Agent:       ${a.name}`)
  console.log(`ENS:         ${a.ens_name}`)
  console.log(`Address:     ${a.wallet_address}`)
  console.log(`Private Key: ${a.private_key}`)
  console.log(`Strategy:    ${a.strategy.slice(0, 60)}...`)
  console.log(`PnL:         ${a.pnl_total.toFixed(4)}% (${a.trade_count} trades)`)
  console.log(`Faucet:      https://faucet.unichain.org/?address=${a.wallet_address}`)
  console.log('─'.repeat(60))
}

console.log(`\nTotal: ${agents.length} agents`)
console.log('\nFund each address with testnet ETH on Unichain Sepolia (chain 1301)')
console.log('Faucet: https://faucet.unichain.org\n')
