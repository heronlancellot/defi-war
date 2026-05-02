'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { Agent } from '@agent-arena/shared'

// Mock agents for Phase 1
const MOCK_AGENTS: Agent[] = [
  {
    id: '1', name: 'alpha-trader', ensName: 'alpha-trader.arena.eth',
    walletAddress: '0x00000a48', strategy: 'Buy low sell high',
    pnlTotal: 22.10, pnlLastTrade: 1.3, tradeCount: 14,
    createdAt: new Date(), x: 0, y: 0, vx: 0, vy: 0, radius: 0,
  },
  {
    id: '2', name: 'beta-bot', ensName: 'beta-bot.arena.eth',
    walletAddress: '0x00000280', strategy: 'Mean reversion',
    pnlTotal: 0.14, pnlLastTrade: -5.94, tradeCount: 7,
    createdAt: new Date(), x: 0, y: 0, vx: 0, vy: 0, radius: 0,
  },
  {
    id: '3', name: 'gamma-agent', ensName: 'gamma-agent.arena.eth',
    walletAddress: '0x0000170e', strategy: 'Momentum',
    pnlTotal: -0.42, pnlLastTrade: -0.42, tradeCount: 3,
    createdAt: new Date(), x: 0, y: 0, vx: 0, vy: 0, radius: 0,
  },
  {
    id: '4', name: 'delta-trader', ensName: 'delta-trader.arena.eth',
    walletAddress: '0x00001976', strategy: 'Scalping',
    pnlTotal: -0.18, pnlLastTrade: 0.02, tradeCount: 22,
    createdAt: new Date(), x: 0, y: 0, vx: 0, vy: 0, radius: 0,
  },
]

const getRadius = (pnl: number) => Math.min(120, Math.max(20, 40 + pnl * 2))
const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n) + '...' : s

interface BubbleAgent extends Agent {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
}

export default function Arena() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const agentsRef = useRef<BubbleAgent[]>([])
  const animFrameRef = useRef<number>(0)
  const tooltipRef = useRef<{ agent: BubbleAgent | null; mx: number; my: number }>({
    agent: null, mx: 0, my: 0,
  })

  const initAgents = useCallback((width: number, height: number) => {
    agentsRef.current = MOCK_AGENTS.map(a => ({
      ...a,
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      radius: getRadius(a.pnlTotal),
    }))
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height

    // Clear
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, W, H)

    // Update + draw agents
    for (const agent of agentsRef.current) {
      agent.x += agent.vx
      agent.y += agent.vy

      // Bounce
      if (agent.x - agent.radius < 0) { agent.x = agent.radius; agent.vx *= -1 }
      if (agent.x + agent.radius > W) { agent.x = W - agent.radius; agent.vx *= -1 }
      if (agent.y - agent.radius < 0) { agent.y = agent.radius; agent.vy *= -1 }
      if (agent.y + agent.radius > H) { agent.y = H - agent.radius; agent.vy *= -1 }

      // Draw bubble
      ctx.beginPath()
      ctx.arc(agent.x, agent.y, agent.radius, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Text inside
      ctx.fillStyle = '#111'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const fontSize = Math.max(9, Math.min(13, agent.radius / 4))
      ctx.font = `600 ${fontSize}px ui-monospace, monospace`
      ctx.fillText(agent.walletAddress.slice(0, 10), agent.x, agent.y - fontSize * 1.2)

      const pnlLastColor = agent.pnlLastTrade >= 0 ? '#16a34a' : '#dc2626'
      ctx.fillStyle = pnlLastColor
      ctx.font = `${fontSize - 1}px ui-monospace, monospace`
      ctx.fillText(
        `${agent.pnlLastTrade >= 0 ? '+' : ''}${agent.pnlLastTrade.toFixed(2)}%`,
        agent.x, agent.y
      )

      const pnlTotalColor = agent.pnlTotal >= 0 ? '#22c55e' : '#ef4444'
      ctx.fillStyle = pnlTotalColor
      ctx.font = `bold ${fontSize}px ui-monospace, monospace`
      ctx.fillText(
        `${agent.pnlTotal >= 0 ? '+' : ''}${agent.pnlTotal.toFixed(2)}%`,
        agent.x, agent.y + fontSize * 1.2
      )

      // Green dot for "user's agent" (first agent = mock user)
      if (agent.id === '1') {
        ctx.beginPath()
        ctx.arc(agent.x, agent.y - agent.radius + 8, 5, 0, Math.PI * 2)
        ctx.fillStyle = '#22c55e'
        ctx.fill()
      }
    }

    // Tooltip
    const { agent: hovAgent, mx, my } = tooltipRef.current
    if (hovAgent) {
      const padX = 12, padY = 8, lineH = 18
      const lines = [
        hovAgent.name,
        hovAgent.walletAddress,
        truncate(hovAgent.strategy, 40),
        `Trades: ${hovAgent.tradeCount}`,
      ]
      const maxW = Math.max(...lines.map(l => {
        ctx.font = '12px ui-sans-serif, sans-serif'
        return ctx.measureText(l).width
      }))
      const tw = maxW + padX * 2
      const th = lines.length * lineH + padY * 2
      let tx = mx + 14
      let ty = my - th / 2
      if (tx + tw > W) tx = mx - tw - 14
      if (ty < 0) ty = 0
      if (ty + th > H) ty = H - th

      ctx.fillStyle = 'rgba(0,0,0,0.85)'
      ctx.beginPath()
      ctx.roundRect(tx, ty, tw, th, 6)
      ctx.fill()

      ctx.fillStyle = '#fff'
      ctx.font = '12px ui-sans-serif, sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      lines.forEach((line, i) => {
        ctx.fillText(line, tx + padX, ty + padY + i * lineH)
      })
    }

    animFrameRef.current = requestAnimationFrame(draw)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    const resize = () => {
      canvas.width = parent.clientWidth
      canvas.height = parent.clientHeight
      initAgents(canvas.width, canvas.height)
    }

    resize()
    window.addEventListener('resize', resize)
    animFrameRef.current = requestAnimationFrame(draw)

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const hit = agentsRef.current.find(a => {
        const dx = a.x - mx, dy = a.y - my
        return Math.sqrt(dx * dx + dy * dy) <= a.radius
      }) ?? null
      tooltipRef.current = { agent: hit, mx, my }
    }

    const onMouseLeave = () => { tooltipRef.current = { agent: null, mx: 0, my: 0 } }

    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseleave', onMouseLeave)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [draw, initAgents])

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full"
      style={{ background: '#1a1a1a' }}
    />
  )
}
