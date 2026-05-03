import type { Agent, LLMDecision } from '@agent-arena/shared'
import type { MarketData } from '../market/prices.js'

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL = 'google/gemma-4-26b-a4b-it:free'

// Global serializer — one LLM call at a time + minimum gap between calls
const LLM_GAP_MS = 8_000
let llmQueue: Promise<any> = Promise.resolve()

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = llmQueue.then(async () => {
    const result = await fn()
    await new Promise(r => setTimeout(r, LLM_GAP_MS))
    return result
  })
  llmQueue = next.catch(() => {})
  return next
}

export function getLLMDecision(
  agent: Agent & { portfolioEth?: number; lastTrade?: string },
  marketData: MarketData,
  ethBalance: number,
  usdcBalance: number,
): Promise<LLMDecision> {
  return enqueue(() => _getLLMDecision(agent, marketData, ethBalance, usdcBalance))
}

async function _getLLMDecision(
  agent: Agent & { portfolioEth?: number; lastTrade?: string },
  marketData: MarketData,
  ethBalance: number,
  usdcBalance: number,
): Promise<LLMDecision> {
  const systemPrompt = `
You are an autonomous trading agent operating on Unichain Sepolia testnet.
Your strategy: "${agent.strategy}"

You trade ETH↔USDC on Uniswap. Decide whether to increase or reduce ETH exposure.
Reply ONLY with valid JSON:
{
  "action": "BUY" | "SELL" | "HOLD",
  "amountPercent": number (1-100),
  "reasoning": "short string in English"
}

BUY = swap USDC→ETH (profits if ETH price rises) — only viable if you have USDC
SELL = swap ETH→USDC (profits if ETH price falls) — only viable if you have ETH
HOLD = keep current position

IMPORTANT: If you have 0 USDC, you CANNOT BUY — choose SELL or HOLD instead.
If you have 0 ETH, you CANNOT SELL — choose BUY or HOLD instead.
`.trim()

  const totalValueUsd = ethBalance * marketData.eth + usdcBalance
  const ethPct = totalValueUsd > 0 ? ((ethBalance * marketData.eth) / totalValueUsd * 100).toFixed(1) : '0.0'

  const userPrompt = `
Market:
- ETH price: $${marketData.eth.toFixed(2)}
- 1h change: ${marketData.ethChange1h.toFixed(2)}%
- 24h change: ${marketData.ethChange24h.toFixed(2)}%
- 24h volume: $${(marketData.volume24h / 1e6).toFixed(1)}M

Portfolio (real on-chain balances):
- ETH: ${ethBalance.toFixed(6)} ETH ($${(ethBalance * marketData.eth).toFixed(2)})
- USDC: ${usdcBalance.toFixed(2)} USDC
- Total value: $${totalValueUsd.toFixed(2)} (${ethPct}% in ETH)
- Cumulative PnL: ${agent.pnlTotal.toFixed(2)}%
- Last trade: ${agent.lastTrade ?? 'none'}

Decide.
`.trim()

  const model = process.env.LLM_MODEL ?? DEFAULT_MODEL
  const body = JSON.stringify({
    model,
    max_tokens: 150,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  })

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/heronlancellot/defi-war',
        'X-Title': 'AgentArena',
      },
      body,
    })

    if (res.status === 429) {
      const wait = (attempt + 1) * 12_000
      console.warn(`[LLM] 429 rate limit, retrying in ${wait / 1000}s (attempt ${attempt + 1}/3)`)
      await new Promise(r => setTimeout(r, wait))
      continue
    }

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenRouter error ${res.status}: ${err}`)
    }

    const data = await res.json()
    const text: string = data.choices?.[0]?.message?.content ?? ''
    return parseDecision(text)
  }

  throw new Error(`OpenRouter: max retries exceeded for model ${model}`)
}

function parseDecision(text: string): LLMDecision {
  const stripped = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
  const match = stripped.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`LLM returned no JSON: ${text.slice(0, 200)}`)

  const parsed = JSON.parse(match[0])

  if (parsed.action) parsed.action = String(parsed.action).toUpperCase().trim()
  if (typeof parsed.amountPercent === 'string') parsed.amountPercent = parseFloat(parsed.amountPercent)
  if (!parsed.amountPercent || parsed.amountPercent <= 0) parsed.amountPercent = 25

  // ETH-only: tokenIn/tokenOut always ETH
  parsed.tokenIn = 'ETH'
  parsed.tokenOut = 'ETH'

  return parsed as LLMDecision
}
