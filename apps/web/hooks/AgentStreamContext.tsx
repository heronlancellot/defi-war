'use client'

import { createContext, useContext } from 'react'
import { useAgentStream } from './useAgentStream'
import type { AgentRow, TradeEvent } from './useAgentStream'

interface AgentStreamCtx {
  agents: AgentRow[]
  connected: boolean
  tradeEvents: TradeEvent[]
}

const Ctx = createContext<AgentStreamCtx>({ agents: [], connected: false, tradeEvents: [] })

export function AgentStreamProvider({ children }: { children: React.ReactNode }) {
  const value = useAgentStream()
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAgentStreamCtx() {
  return useContext(Ctx)
}
