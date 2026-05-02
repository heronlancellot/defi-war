// 0G Storage — save trade history via HTTP API
// Docs: https://build.0g.ai
// 0G Storage uses a KV and Log model

const ZG_INDEXER = process.env.ZG_INDEXER_URL ?? 'https://indexer-storage-testnet-turbo.0g.ai'

export interface TradeHistoryEntry {
  agentId: string
  action: string
  tokenIn: string
  tokenOut: string
  pnl: number
  reasoning: string
  timestamp: string
  txHash?: string
}

// Save entry to agent history (best-effort — never blocks the loop)
export async function appendTradeHistory(entry: TradeHistoryEntry): Promise<void> {
  if (!process.env.ZG_RPC_URL) {
    await saveToLocalFallback(entry)
    return
  }

  try {
    // 0G Storage upload via indexer endpoint
    // In production: use @0glabs/0g-ts-sdk
    await fetch(`${ZG_INDEXER}/v1/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: `agent:${entry.agentId}:trade:${Date.now()}`,
        value: JSON.stringify(entry),
      }),
    })
  } catch {
    // 0G unavailable — use local fallback
    await saveToLocalFallback(entry)
  }
}

export async function getAgentHistory(agentId: string): Promise<TradeHistoryEntry[]> {
  if (!process.env.ZG_RPC_URL) {
    return getFromLocalFallback(agentId)
  }
  try {
    const res = await fetch(`${ZG_INDEXER}/v1/query?prefix=agent:${agentId}:trade:`)
    if (!res.ok) return getFromLocalFallback(agentId)
    const data = await res.json()
    return (data.entries ?? []).map((e: any) => JSON.parse(e.value))
  } catch {
    return getFromLocalFallback(agentId)
  }
}

// Local JSON fallback (hackathon safety net)
import { writeFile, readFile, mkdir } from 'fs/promises'
import path from 'path'

const HISTORY_DIR = path.join(process.cwd(), '.agent-history')

async function saveToLocalFallback(entry: TradeHistoryEntry): Promise<void> {
  try {
    await mkdir(HISTORY_DIR, { recursive: true })
    const file = path.join(HISTORY_DIR, `${entry.agentId}.jsonl`)
    await writeFile(file, JSON.stringify(entry) + '\n', { flag: 'a' })
  } catch {}
}

async function getFromLocalFallback(agentId: string): Promise<TradeHistoryEntry[]> {
  try {
    const file = path.join(HISTORY_DIR, `${agentId}.jsonl`)
    const content = await readFile(file, 'utf-8')
    return content.trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
  } catch {
    return []
  }
}
