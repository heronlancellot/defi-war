import { NextResponse } from 'next/server'

const ENGINE_URL = process.env.AGENT_ENGINE_URL ?? 'http://localhost:3001'

export async function POST(request: Request) {
  const { name, strategy } = await request.json()
  if (!name || !strategy) {
    return NextResponse.json({ error: 'name and strategy required' }, { status: 400 })
  }

  // Generate wallet locally (web crypto)
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  const walletAddress = '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')

  const pkBytes = new Uint8Array(32)
  crypto.getRandomValues(pkBytes)
  const privateKey = '0x' + Array.from(pkBytes).map(b => b.toString(16).padStart(2, '0')).join('')

  const agent = {
    id: crypto.randomUUID(),
    name,
    ensName: `${name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.arena.eth`,
    walletAddress,
    privateKey,
    strategy,
  }

  // Persist in engine (which has the DB)
  try {
    await fetch(`${ENGINE_URL}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(agent),
    })
  } catch {
    // Engine might not be running — store locally for now
    console.warn('Agent engine not reachable')
  }

  return NextResponse.json({
    id: agent.id,
    name: agent.name,
    ensName: agent.ensName,
    walletAddress: agent.walletAddress,
    strategy: agent.strategy,
    pnlTotal: 0,
    pnlLastTrade: 0,
    tradeCount: 0,
  })
}

export async function GET() {
  try {
    const res = await fetch(`${ENGINE_URL}/agents`, { cache: 'no-store' })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json([])
  }
}
