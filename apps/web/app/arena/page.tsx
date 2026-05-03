'use client'

import Arena from '../../components/Arena'
import Leaderboard from '../../components/Leaderboard'
import TradeToasts from '../../components/TradeToast'
import { AgentStreamProvider, useAgentStreamCtx } from '../../hooks/AgentStreamContext'

function ArenaContent() {
  const { tradeEvents } = useAgentStreamCtx()

  return (
    <div className="min-h-screen bg-[#111] text-white flex flex-col">
      <header className="px-6 py-3 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <a href="/" className="text-lg font-bold tracking-tight">AgentArena</a>
          <span className="text-xs text-zinc-600">×</span>
          <span className="text-xs text-zinc-500">Unichain Testnet</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span>Powered by Uniswap · 0G · ENS</span>
          <a href="/" className="hover:text-white transition-colors">+ New Agent</a>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative">
          <Arena />
        </div>
        <div className="w-72 border-l border-zinc-800 overflow-y-auto flex-shrink-0">
          <Leaderboard />
        </div>
      </div>

      <TradeToasts events={tradeEvents} />
    </div>
  )
}

export default function ArenaPage() {
  return (
    <AgentStreamProvider>
      <ArenaContent />
    </AgentStreamProvider>
  )
}
