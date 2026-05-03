'use client'

import { useEffect, useRef, useState } from 'react'
import type { TradeEvent } from '../hooks/useAgentStream'

// ── Particle canvas ──────────────────────────────────────────────────────────

interface Particle {
  x: number; y: number; vx: number; vy: number
  alpha: number; size: number; color: string; rot: number; rotV: number
}

function ParticleBurst({ profit }: { profit: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = 380
    canvas.height = 200

    const colors = profit
      ? ['#22c55e', '#4ade80', '#86efac', '#fbbf24', '#ffffff']
      : ['#ef4444', '#f87171', '#fca5a5', '#f97316', '#ffffff']

    const particles: Particle[] = Array.from({ length: 45 }, () => ({
      x: 190 + (Math.random() - 0.5) * 80,
      y: 100,
      vx: (Math.random() - 0.5) * 9,
      vy: -(Math.random() * 7 + 3),
      alpha: 1,
      size: Math.random() * 7 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.35,
    }))

    let raf: number
    const tick = () => {
      ctx.clearRect(0, 0, 380, 200)
      let alive = false
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.2
        p.alpha -= 0.016; p.rot += p.rotV
        if (p.alpha <= 0) continue
        alive = true
        ctx.save()
        ctx.globalAlpha = p.alpha
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.55)
        ctx.restore()
      }
      if (alive) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [profit])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none w-full h-full"
    />
  )
}

// ── Single toast ─────────────────────────────────────────────────────────────

const UNICHAIN_EXPLORER = 'https://sepolia.uniscan.xyz/tx'

function Toast({ event, onDone }: { event: TradeEvent; onDone: () => void }) {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in')
  const profit = event.pnl >= 0
  const hasReason = event.reasoning && !event.reasoning.startsWith('Test cycle')
  const hasTx = !!event.txHash

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), 80)
    const t2 = setTimeout(() => setPhase('out'), 5500)
    const t3 = setTimeout(onDone, 6200)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [onDone])

  const vis = phase === 'in'
    ? 'opacity-0 translate-y-5 scale-95'
    : phase === 'out'
    ? 'opacity-0 -translate-y-2 scale-95'
    : 'opacity-100 translate-y-0 scale-100'

  const borderColor = profit ? 'border-green-500/40' : 'border-red-500/30'
  const glowColor   = profit ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'
  const barColor    = profit ? 'bg-green-500' : 'bg-red-500'

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${borderColor} bg-zinc-900/95 backdrop-blur-md shadow-2xl w-80 transition-all duration-300 ease-out ${vis}`}
      style={{ boxShadow: `0 0 40px ${glowColor}, 0 8px 32px rgba(0,0,0,0.6)` }}
    >
      <ParticleBurst profit={profit} />

      {/* inner glow */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${glowColor} 0%, transparent 70%)` }}
      />

      <div className="relative z-10 p-4 space-y-3">

        {/* ── Header row ── */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-xl select-none ${profit ? 'animate-bounce' : ''}`}>
              {profit ? '🚀' : '📉'}
            </span>
            <span className="text-white font-bold text-sm truncate">{event.agentName}</span>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              event.action === 'BUY'
                ? 'bg-green-500/15 text-green-400 ring-1 ring-green-500/30'
                : 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30'
            }`}>
              {event.action}
            </span>
            <span className="text-xs text-zinc-500">{event.amountPercent}%</span>
          </div>
        </div>

        {/* ── PnL ── */}
        <div className={`text-2xl font-black tabular-nums tracking-tight ${profit ? 'text-green-400' : 'text-red-400'}`}>
          {profit ? '+' : ''}{event.pnl.toFixed(4)}%
          <span className="text-sm font-normal text-zinc-500 ml-1">PnL</span>
        </div>

        {/* ── Reasoning ── */}
        {hasReason && (
          <div className="rounded-lg bg-zinc-800/60 px-3 py-2 border border-zinc-700/40">
            <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">
              <span className="text-zinc-600 mr-1">💬</span>
              {event.reasoning}
            </p>
          </div>
        )}

        {/* ── Tx Hash ── */}
        {hasTx && (
          <a
            href={`${UNICHAIN_EXPLORER}/${event.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg bg-zinc-800/60 px-3 py-2 border border-zinc-700/40 hover:border-zinc-500/60 transition-colors group"
          >
            <span className="text-xs text-zinc-500">tx</span>
            <span className="text-xs font-mono text-zinc-300 truncate flex-1 group-hover:text-white transition-colors">
              {event.txHash!.slice(0, 18)}...{event.txHash!.slice(-6)}
            </span>
            <svg className="w-3 h-3 text-zinc-600 group-hover:text-zinc-300 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}

        {/* ── SIM badge when no tx ── */}
        {!hasTx && (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
            <span className="text-xs text-zinc-600">simulated trade</span>
          </div>
        )}
      </div>

      {/* ── Progress bar ── */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-800 rounded-b-2xl overflow-hidden">
        <div
          className={`h-full ${barColor} opacity-70`}
          style={{ animation: phase === 'hold' ? 'shrink 5.4s linear forwards' : undefined }}
        />
      </div>
    </div>
  )
}

// ── Container ────────────────────────────────────────────────────────────────

export default function TradeToasts({ events }: { events: TradeEvent[] }) {
  const [visible, setVisible] = useState<TradeEvent[]>([])
  const seenRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    for (const e of events) {
      if (!seenRef.current.has(e.id)) {
        seenRef.current.add(e.id)
        setVisible(prev => [e, ...prev].slice(0, 4))
      }
    }
  }, [events])

  const dismiss = (id: string) => setVisible(prev => prev.filter(e => e.id !== id))

  if (visible.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse gap-3 pointer-events-none">
      {visible.map(e => (
        <div key={e.id} className="pointer-events-auto">
          <Toast event={e} onDone={() => dismiss(e.id)} />
        </div>
      ))}
    </div>
  )
}
