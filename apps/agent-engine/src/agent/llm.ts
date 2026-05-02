import type { Agent, LLMDecision } from '@agent-arena/shared'
import type { MarketData } from '../market/prices.js'

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
// Default model — override via LLM_MODEL env var
// Good free/cheap options: "google/gemini-flash-1.5", "meta-llama/llama-3.1-8b-instruct:free"
const DEFAULT_MODEL = 'google/gemini-flash-1.5'

export async function getLLMDecision(
  agent: Agent & { portfolioEth?: number; portfolioUsdc?: number; lastTrade?: string },
  marketData: MarketData,
): Promise<LLMDecision> {
  const systemPrompt = `
Você é um agente de trading autônomo na blockchain Unichain.
Sua estratégia definida pelo usuário: "${agent.strategy}"

Você recebe dados de mercado e decide: BUY, SELL ou HOLD.
Responda APENAS com JSON válido no formato:
{
  "action": "BUY" | "SELL" | "HOLD",
  "tokenIn": "ETH" | "USDC",
  "tokenOut": "ETH" | "USDC",
  "amountPercent": number (0-100),
  "reasoning": "string curta"
}
`.trim()

  const userPrompt = `
Dados de mercado atuais:
- ETH/USDC: $${marketData.eth.toFixed(2)}
- Variação 1h: ${marketData.ethChange1h.toFixed(2)}%
- Variação 24h: ${marketData.ethChange24h.toFixed(2)}%
- Volume 24h: $${(marketData.volume24h / 1e6).toFixed(1)}M
- Liquidez pool: $${(marketData.liquidity / 1e6).toFixed(1)}M

Seu portfolio atual:
- ETH: ${agent.portfolioEth ?? 0.1}
- USDC: ${agent.portfolioUsdc ?? 200}
- PnL total: ${agent.pnlTotal.toFixed(2)}%
- Último trade: ${agent.lastTrade ?? 'nenhum'}

Decida sua próxima ação.
`.trim()

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/heronlancellot/defi-war',
      'X-Title': 'AgentArena',
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL ?? DEFAULT_MODEL,
      max_tokens: 256,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenRouter error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const text: string = data.choices?.[0]?.message?.content ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`LLM returned invalid JSON: ${text}`)
  return JSON.parse(match[0]) as LLMDecision
}
