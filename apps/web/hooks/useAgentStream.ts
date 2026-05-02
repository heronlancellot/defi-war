'use client'

import { useEffect, useRef, useState } from 'react'

export interface AgentRow {
  id: string
  name: string
  ensName: string
  walletAddress: string
  strategy: string
  pnlTotal: number
  pnlLastTrade: number
  tradeCount: number
}

export function useAgentStream(): { agents: AgentRow[]; connected: boolean } {
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001'

    const connect = () => {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => setConnected(true)

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'init' || msg.type === 'update') {
            setAgents(msg.agents ?? [])
          }
        } catch {}
      }

      ws.onclose = () => {
        setConnected(false)
        // Reconnect after 5s
        retryRef.current = setTimeout(connect, 5_000)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      wsRef.current?.close()
      if (retryRef.current) clearTimeout(retryRef.current)
    }
  }, [])

  return { agents, connected }
}
