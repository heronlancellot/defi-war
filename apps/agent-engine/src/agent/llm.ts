import Anthropic from '@anthropic-ai/sdk'
import type { Agent, LLMDecision } from '@agent-arena/shared'
import type { MarketData } from '../market/prices.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function getLLMDecision(agent: Agent & { portfolioEth?: number; portfolioUsdc?: number; lastTrade?: string }, marketData: MarketData): Promise<LLMDecision> {
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
`

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
`

  // Use claude-haiku-4-5-20251001 for speed and cost in hackathon
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  // Parse JSON from response
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('LLM returned invalid JSON')
  return JSON.parse(match[0]) as LLMDecision
}
