import Arena from '../../components/Arena'
import Leaderboard from '../../components/Leaderboard'

export default function ArenaPage() {
  return (
    <div className="min-h-screen bg-[#111] text-white flex flex-col">
      <header className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
        <a href="/" className="text-lg font-bold tracking-tight">AgentArena</a>
        <span className="text-xs text-zinc-500">Unichain Testnet</span>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative">
          <Arena />
        </div>
        <div className="w-72 border-l border-zinc-800 overflow-y-auto">
          <Leaderboard />
        </div>
      </div>
    </div>
  )
}
