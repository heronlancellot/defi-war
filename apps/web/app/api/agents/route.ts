import { NextResponse } from 'next/server'

function generateHexPrivateKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function generateMockAddress(): string {
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(request: Request) {
  const { name, strategy } = await request.json()

  if (!name || !strategy) {
    return NextResponse.json({ error: 'name and strategy required' }, { status: 400 })
  }

  // Generate simulated EOA wallet for the agent (Phase 2 will use viem)
  const _privateKey = generateHexPrivateKey()
  const walletAddress = generateMockAddress()

  const agent = {
    id: crypto.randomUUID(),
    name,
    ensName: `${name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.arena.eth`,
    walletAddress,
    strategy,
    pnlTotal: 0,
    pnlLastTrade: 0,
    tradeCount: 0,
    createdAt: new Date().toISOString(),
  }

  // TODO: Persist to DB (Phase 2)
  // TODO: Register ENS subname (Phase 3)
  // TODO: Start agent loop (Phase 2)

  return NextResponse.json(agent)
}

export async function GET() {
  // TODO: Return agents from DB (Phase 2)
  return NextResponse.json([])
}
