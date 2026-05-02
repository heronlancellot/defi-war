import 'dotenv/config'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { getAllAgents, getDb, createAgent } from './db/schema.js'
import { startAllAgentLoops, startAgentLoop } from './agent/loop.js'
import { registerAgentSubname } from './ens/register.js'
import { getAgentHistory } from './storage/0g.js'
import { arenaEvents } from './events.js'

// Initialize DB
getDb()
console.log('[AgentArena] DB initialized')

function mapRow(row: any) {
  return {
    id: row.id,
    name: row.name,
    ensName: row.ens_name,
    walletAddress: row.wallet_address,
    strategy: row.strategy,
    pnlTotal: row.pnl_total,
    pnlLastTrade: row.pnl_last_trade,
    tradeCount: row.trade_count,
  }
}

// HTTP server for inter-service communication
const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'GET' && req.url === '/agents') {
    const agents = getAllAgents()
    res.end(JSON.stringify(agents.map(mapRow)))
    return
  }

  // GET /agents/:id/history
  if (req.method === 'GET' && req.url?.match(/^\/agents\/[^/]+\/history$/)) {
    const agentId = req.url.split('/')[2]
    getAgentHistory(agentId).then(history => {
      res.end(JSON.stringify(history))
    }).catch(() => {
      res.end(JSON.stringify([]))
    })
    return
  }

  if (req.method === 'POST' && req.url === '/agents') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const agent = JSON.parse(body)
        // Register ENS subname before saving
        const ensName = await registerAgentSubname(agent.name, agent.walletAddress, agent.strategy)
        agent.ensName = ensName
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

// WebSocket server (shared HTTP server — upgrade)
const wss = new WebSocketServer({ server })
const clients = new Set<WebSocket>()

wss.on('connection', (ws) => {
  clients.add(ws)
  // Send current state immediately on connect
  const agents = getAllAgents()
  ws.send(JSON.stringify({ type: 'init', agents: agents.map(mapRow) }))

  ws.on('close', () => clients.delete(ws))
  ws.on('error', () => clients.delete(ws))
})

// Listen to arena events and broadcast to all WS clients
arenaEvents.on('agent:updated', () => {
  if (clients.size === 0) return
  const agents = getAllAgents()
  const msg = JSON.stringify({ type: 'update', agents: agents.map(mapRow) })
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg)
  }
})

const PORT = process.env.AGENT_ENGINE_PORT ?? 3001
server.listen(PORT, () => {
  console.log(`[AgentArena] Agent Engine running on port ${PORT}`)
  console.log(`[AgentArena] WebSocket server ready on ws://localhost:${PORT}`)
  startAllAgentLoops()
})
