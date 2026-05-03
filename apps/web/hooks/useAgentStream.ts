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

export interface TradeEvent {
  id: string
  agentId: string
  agentName: string
  action: 'BUY' | 'SELL'
  amountPercent: number
  pnl: number
  reasoning: string
  txHash: string | null
  timestamp: number
}

export function useAgentStream(): { agents: AgentRow[]; connected: boolean; tradeEvents: TradeEvent[] } {
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [connected, setConnected] = useState(false)
  const [tradeEvents, setTradeEvents] = useState<TradeEvent[]>([])
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

          if (msg.type === 'trade' && msg.trade) {
            const t = msg.trade
            const event: TradeEvent = {
              id: `${t.agentId}-${Date.now()}-${Math.random()}`,
              agentId: t.agentId,
              agentName: t.agentName,
              action: t.action,
              amountPercent: t.amountPercent,
              pnl: t.pnl,
              reasoning: t.reasoning,
              txHash: t.txHash ?? null,
              timestamp: Date.now(),
            }
            setTradeEvents(prev => [event, ...prev].slice(0, 10))
          }
        } catch {}
      }

      ws.onclose = () => {
        setConnected(false)
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

  return { agents, connected, tradeEvents }
}
