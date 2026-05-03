'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useAgentStream } from '../hooks/useAgentStream'

const getRadius = (pnl: number) => Math.min(120, Math.max(20, 40 + pnl * 2))
const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n) + '…' : s

interface BubbleAgent {
  id: string
  name: string
  ensName: string
  walletAddress: string
  strategy: string
  pnlTotal: number
  pnlLastTrade: number
  tradeCount: number
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  isUser?: boolean
}

export default function Arena() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const agentsRef = useRef<BubbleAgent[]>([])
  const animFrameRef = useRef<number>(0)
  const tooltipRef = useRef<{ agent: BubbleAgent | null; mx: number; my: number }>({ agent: null, mx: 0, my: 0 })

  const { agents: streamAgents } = useAgentStream()
  const [agentData, setAgentData] = useState<any[]>([])

  // Use WebSocket stream when available
  useEffect(() => {
    if (streamAgents.length > 0) setAgentData(streamAgents)
  }, [streamAgents])

  // HTTP fallback poll when WS is not connected/empty
  useEffect(() => {
    if (streamAgents.length > 0) return // WS active, no need to poll
    const poll = async () => {
      try {
        const res = await fetch('/api/agents', { cache: 'no-store' })
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) setAgentData(data)
      } catch {}
    }
    poll()
    const id = setInterval(poll, 10_000)
    return () => clearInterval(id)
  }, [streamAgents.length])

  // Sync agent data into canvas ref — preserve positions/velocities
  useEffect(() => {
    const source = agentData
    const canvas = canvasRef.current
    const W = canvas?.width ?? 800
    const H = canvas?.height ?? 600

    agentsRef.current = source.map((a, i) => {
      const existing = agentsRef.current.find(e => e.id === a.id)
      return {
        id: a.id,
        name: a.name,
        ensName: a.ensName ?? a.ens_name ?? '',
        walletAddress: a.walletAddress ?? a.wallet_address ?? '',
        strategy: a.strategy,
        pnlTotal: a.pnlTotal ?? a.pnl_total ?? 0,
        pnlLastTrade: a.pnlLastTrade ?? a.pnl_last_trade ?? 0,
        tradeCount: a.tradeCount ?? a.trade_count ?? 0,
        isUser: i === 0,
        x: existing?.x ?? Math.random() * W,
        y: existing?.y ?? Math.random() * H,
        vx: existing?.vx ?? (Math.random() - 0.5) * 1.5,
        vy: existing?.vy ?? (Math.random() - 0.5) * 1.5,
        radius: getRadius(a.pnlTotal ?? a.pnl_total ?? 0),
      }
    })
  }, [agentData])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width, H = canvas.height
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, W, H)

    if (agentsRef.current.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.font = '14px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('Waiting for agents...', W / 2, H / 2)
      animFrameRef.current = requestAnimationFrame(draw)
      return
    }

    for (const agent of agentsRef.current) {
      agent.x += agent.vx
      agent.y += agent.vy
      if (agent.x - agent.radius < 0) { agent.x = agent.radius; agent.vx *= -1 }
      if (agent.x + agent.radius > W) { agent.x = W - agent.radius; agent.vx *= -1 }
      if (agent.y - agent.radius < 0) { agent.y = agent.radius; agent.vy *= -1 }
      if (agent.y + agent.radius > H) { agent.y = H - agent.radius; agent.vy *= -1 }

      // Bubble
      ctx.beginPath()
      ctx.arc(agent.x, agent.y, agent.radius, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.fill()
      ctx.strokeStyle = agent.isUser ? '#22c55e' : 'rgba(255,255,255,0.2)'
      ctx.lineWidth = agent.isUser ? 2.5 : 1
      ctx.stroke()

      const fs = Math.max(9, Math.min(13, agent.radius / 4))
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      ctx.fillStyle = '#111'
      ctx.font = `600 ${fs}px ui-monospace, monospace`
      ctx.fillText(agent.walletAddress.slice(0, 10), agent.x, agent.y - fs * 1.2)

      ctx.fillStyle = agent.pnlLastTrade >= 0 ? '#16a34a' : '#dc2626'
      ctx.font = `${fs - 1}px ui-monospace, monospace`
      ctx.fillText(`${agent.pnlLastTrade >= 0 ? '+' : ''}${agent.pnlLastTrade.toFixed(2)}%`, agent.x, agent.y)

      ctx.fillStyle = agent.pnlTotal >= 0 ? '#22c55e' : '#ef4444'
      ctx.font = `bold ${fs}px ui-monospace, monospace`
      ctx.fillText(`${agent.pnlTotal >= 0 ? '+' : ''}${agent.pnlTotal.toFixed(2)}%`, agent.x, agent.y + fs * 1.2)

      if (agent.isUser) {
        ctx.beginPath()
        ctx.arc(agent.x, agent.y - agent.radius + 8, 5, 0, Math.PI * 2)
        ctx.fillStyle = '#22c55e'
        ctx.fill()
      }
    }

    // Tooltip
    const { agent: hov, mx, my } = tooltipRef.current
    if (hov) {
      const lines = [hov.name, hov.walletAddress, truncate(hov.strategy, 40), `Trades: ${hov.tradeCount}`]
      ctx.font = '12px ui-sans-serif, sans-serif'
      const maxW = Math.max(...lines.map(l => ctx.measureText(l).width))
      const tw = maxW + 24, th = lines.length * 18 + 16
      let tx = mx + 14, ty = my - th / 2
      if (tx + tw > W) tx = mx - tw - 14
      if (ty < 0) ty = 0
      if (ty + th > H) ty = H - th
      ctx.fillStyle = 'rgba(0,0,0,0.85)'
      ctx.beginPath()
      ctx.roundRect(tx, ty, tw, th, 6)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      lines.forEach((l, i) => ctx.fillText(l, tx + 12, ty + 8 + i * 18))
    }

    animFrameRef.current = requestAnimationFrame(draw)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    const resize = () => { canvas.width = parent.clientWidth; canvas.height = parent.clientHeight }
    resize()
    window.addEventListener('resize', resize)
    animFrameRef.current = requestAnimationFrame(draw)

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const hit = agentsRef.current.find(a => {
        const dx = a.x - mx, dy = a.y - my
        return Math.sqrt(dx * dx + dy * dy) <= a.radius
      }) ?? null
      tooltipRef.current = { agent: hit, mx, my }
    }
    const onLeave = () => { tooltipRef.current = { agent: null, mx: 0, my: 0 } }

    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseleave', onLeave)
    return () => {
      cancelAnimationFrame(animFrameRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseleave', onLeave)
    }
  }, [draw])

  return <canvas ref={canvasRef} className="block w-full h-full" style={{ background: '#1a1a1a' }} />
}
