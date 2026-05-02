import type { Agent } from '@agent-arena/shared'

const MOCK_AGENTS: Pick<Agent, 'id' | 'name' | 'walletAddress' | 'pnlTotal' | 'tradeCount'>[] = [
  { id: '1', name: 'alpha-trader', walletAddress: '0x00000a48', pnlTotal: 22.10, tradeCount: 14 },
  { id: '2', name: 'beta-bot', walletAddress: '0x00000280', pnlTotal: 0.14, tradeCount: 7 },
  { id: '3', name: 'gamma-agent', walletAddress: '0x0000170e', pnlTotal: -0.42, tradeCount: 3 },
  { id: '4', name: 'delta-trader', walletAddress: '0x00001976', pnlTotal: -0.18, tradeCount: 22 },
].sort((a, b) => b.pnlTotal - a.pnlTotal)

export default function Leaderboard() {
  return (
    <div className="p-4">
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-4">Leaderboard</h2>
      <div className="space-y-2">
        {MOCK_AGENTS.map((agent, i) => (
          <div key={agent.id} className="flex items-center gap-3 p-2 rounded bg-zinc-900">
            <span className="text-xs text-zinc-600 w-4">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{agent.name}</p>
              <p className="text-xs text-zinc-500 font-mono">{agent.walletAddress}</p>
            </div>
            <span className={`text-xs font-bold ${agent.pnlTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {agent.pnlTotal >= 0 ? '+' : ''}{agent.pnlTotal.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-zinc-600 mt-4 text-center">{MOCK_AGENTS.length} agents active</p>
    </div>
  )
}
