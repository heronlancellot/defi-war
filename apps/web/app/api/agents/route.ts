import { NextResponse } from 'next/server'

const ENGINE_URL = process.env.AGENT_ENGINE_URL ?? 'http://localhost:3001'

export async function POST(request: Request) {
  const { name, strategy } = await request.json()
  if (!name || !strategy) {
    return NextResponse.json({ error: 'name and strategy required' }, { status: 400 })
  }

  // Send to engine — it generates the wallet properly (privateKey → address via viem)
  const payload = {
    id: crypto.randomUUID(),
    name,
    ensName: `${name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.arena.eth`,
    strategy,
  }

  try {
    const res = await fetch(`${ENGINE_URL}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({ error: err.error ?? 'Engine error' }, { status: 500 })
    }
    // Engine returns { ok, id } — return full agent shape for the UI
    return NextResponse.json({
      ...payload,
      pnlTotal: 0,
      pnlLastTrade: 0,
      tradeCount: 0,
    })
  } catch {
    return NextResponse.json({ error: 'Agent engine not reachable' }, { status: 503 })
  }
}

export async function GET() {
  try {
    const res = await fetch(`${ENGINE_URL}/agents`, { cache: 'no-store' })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json([])
  }
}
