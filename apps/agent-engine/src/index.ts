import 'dotenv/config'
import { createServer } from 'http'
import { getAllAgents, getDb, createAgent } from './db/schema.js'
import { startAllAgentLoops, startAgentLoop } from './agent/loop.js'

// Initialize DB
getDb()
console.log('[AgentArena] DB initialized')

// HTTP server for inter-service communication
const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'GET' && req.url === '/agents') {
    const agents = getAllAgents()
    res.end(JSON.stringify(agents.map(row => ({
      id: row.id,
      name: row.name,
      ensName: row.ens_name,
      walletAddress: row.wallet_address,
      strategy: row.strategy,
      pnlTotal: row.pnl_total,
      pnlLastTrade: row.pnl_last_trade,
      tradeCount: row.trade_count,
    }))))
    return
  }

  if (req.method === 'POST' && req.url === '/agents') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        const agent = JSON.parse(body)
        createAgent(agent)
        startAgentLoop(agent.id)
        res.statusCode = 201
        res.end(JSON.stringify({ ok: true, id: agent.id }))
      } catch (err) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: String(err) }))
      }
    })
    return
  }

  if (req.method === 'POST' && req.url === '/agents/start') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        const { agentId } = JSON.parse(body)
        startAgentLoop(agentId)
        res.end(JSON.stringify({ ok: true }))
      } catch {
        res.statusCode = 400
        res.end(JSON.stringify({ error: 'bad request' }))
      }
    })
    return
  }

  res.statusCode = 404
  res.end(JSON.stringify({ error: 'not found' }))
})

const PORT = process.env.AGENT_ENGINE_PORT ?? 3001
server.listen(PORT, () => {
  console.log(`[AgentArena] Agent Engine running on port ${PORT}`)
  startAllAgentLoops()
})
