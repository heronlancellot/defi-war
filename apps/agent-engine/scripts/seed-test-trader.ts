import 'dotenv/config'
import { Pool } from 'pg'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const privateKey = generatePrivateKey()
  const account = privateKeyToAccount(privateKey)
  const id = crypto.randomUUID()

  const res = await pool.query(
    `INSERT INTO agents (id, name, ens_name, wallet_address, private_key, strategy, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (name) DO NOTHING`,
    [
      id, 'test-trader', 'test-trader.arena.eth', account.address, privateKey,
      'TEST_AGENT: alternates SELL/BUY every cycle to validate swap execution.',
      new Date().toISOString(),
    ],
  )

  if (res.rowCount && res.rowCount > 0) {
    console.log('✅ test-trader criado!')
    console.log('ID:         ', id)
    console.log('Address:    ', account.address)
    console.log('PrivateKey: ', privateKey)
    console.log('')
    console.log('👉 Manda ETH testnet pra esse endereco:', account.address)
  } else {
    const existing = await pool.query(
      'SELECT id, wallet_address, private_key FROM agents WHERE name = $1',
      ['test-trader'],
    )
    const row = existing.rows[0]
    console.log('ℹ️  test-trader ja existe no DB')
    console.log('ID:         ', row.id)
    console.log('Address:    ', row.wallet_address)
    console.log('PrivateKey: ', row.private_key)
  }

  await pool.end()
}

main().catch(console.error)
