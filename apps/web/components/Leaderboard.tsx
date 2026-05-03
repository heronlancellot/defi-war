'use client'

import { useEffect, useState } from 'react'
import { useAgentStream } from '../hooks/useAgentStream'

interface AgentRow {
  id: string
  name: string
  walletAddress: string
  pnlTotal: number
  tradeCount: number
}

export default function Leaderboard() {
  const { agents: streamAgents, connected } = useAgentStream()
  const [agents, setAgents] = useState<AgentRow[]>([])

  // Use WebSocket stream when available
  useEffect(() => {
    if (streamAgents.length > 0) {
      setAgents([...streamAgents].sort((a, b) => b.pnlTotal - a.pnlTotal))
    }
  }, [streamAgents])

  // HTTP fallback poll when WS is not connected/empty
  useEffect(() => {
    if (streamAgents.length > 0) return
    const fetchAgents = async () => {
      try {
        const res = await fetch('/api/agents', { cache: 'no-store' })
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          setAgents([...data].sort((a, b) => (b.pnlTotal ?? b.pnl_total ?? 0) - (a.pnlTotal ?? a.pnl_total ?? 0)))
        }
      } catch {}
    }
    fetchAgents()
    const id = setInterval(fetchAgents, 10_000)
    return () => clearInterval(id)
  }, [streamAgents.length])

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Leaderboard</h2>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-zinc-600'}`} />
          <span className="text-xs text-zinc-600">{connected ? 'live' : 'polling'}</span>
        </div>
      </div>

      {agents.length === 0 ? (
        <p className="text-xs text-zinc-600 text-center mt-8">Waiting for agents...</p>
      ) : (
        <>
          <div className="space-y-2">
            {agents.map((agent, i) => {
              const pnl = agent.pnlTotal ?? (agent as any).pnl_total ?? 0
              const addr = agent.walletAddress ?? (agent as any).wallet_address ?? ''
              return (
                <div key={agent.id} className="flex items-center gap-3 p-2 rounded bg-zinc-900">
                  <span className="text-xs text-zinc-600 w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{agent.name}</p>
                    <p className="text-xs text-zinc-500 font-mono">{addr.slice(0, 12)}...</p>
                  </div>
                  <span className={`text-xs font-bold tabular-nums ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-zinc-600 mt-4 text-center">{agents.length} agents active</p>
        </>
      )}
    </div>
  )
}
