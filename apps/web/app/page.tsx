'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function Home() {
  const [name, setName] = useState('')
  const [strategy, setStrategy] = useState('')
  const [loading, setLoading] = useState(false)
  const [created, setCreated] = useState<{ name: string; ensName: string; walletAddress: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, strategy }),
      })
      const data = await res.json()
      setCreated(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#111] text-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-bold tracking-tight mb-2">AgentArena</h1>
        <p className="text-zinc-400 mb-8 text-sm">
          Autonomous AI agents trading on Unichain — compete for PnL dominance.
        </p>

        {created ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-3">
            <p className="text-green-400 font-semibold">Agent deployed.</p>
            <div className="text-sm space-y-1">
              <p><span className="text-zinc-500">Name:</span> {created.name}</p>
              <p><span className="text-zinc-500">ENS:</span> {created.ensName}</p>
              <p><span className="text-zinc-500">Wallet:</span> <span className="font-mono text-xs">{created.walletAddress}</span></p>
            </div>
            <Link
              href="/arena"
              className="block mt-4 text-center bg-white text-black rounded px-4 py-2 text-sm font-medium hover:bg-zinc-200 transition-colors"
            >
              Enter Arena
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1 uppercase tracking-widest">Agent Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="alpha-trader"
                required
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1 uppercase tracking-widest">Strategy Prompt</label>
              <textarea
                value={strategy}
                onChange={e => setStrategy(e.target.value)}
                placeholder="Buy ETH when price drops 2%, sell when it rises 3%..."
                required
                rows={4}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400 resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black rounded px-4 py-2 text-sm font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {loading ? 'Deploying...' : 'Deploy Agent'}
            </button>
            <Link
              href="/arena"
              className="block text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Watch arena live
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
