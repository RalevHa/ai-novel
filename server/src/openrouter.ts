type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

export const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'anthropic/claude-sonnet-4.5'
// hard ceiling on one chapter's output so a runaway model cannot burn money until the connection times out
export const MAX_OUTPUT_TOKENS = Number(process.env.MAX_OUTPUT_TOKENS) || 16000
/** What a call cost: OpenRouter reports credits (= USD) in `usage.cost` without being asked. */
export type Usage = { tokens: number; cost: number }
const toUsage = (u: any): Usage => ({ tokens: Number(u.total_tokens) || 0, cost: Number(u.cost) || 0 })

const URL = 'https://openrouter.ai/api/v1/chat/completions'
const headers = () => ({ Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' })

/** One-shot (non-streaming) completion; returns the text. `onUsage` receives the cost when the provider reports it. */
export async function chat(model: string, messages: Msg[], onUsage?: (u: Usage) => void) {
  const r = await fetch(URL, { method: 'POST', signal: AbortSignal.timeout(180_000), headers: headers(), body: JSON.stringify({ model, messages, max_tokens: MAX_OUTPUT_TOKENS }) })
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${await r.text()}`)
  const body = await r.json()
  if (body.usage) onUsage?.(toUsage(body.usage))
  const choice = body.choices?.[0]
  const text = (choice?.message?.content ?? '').trim() as string
  // reasoning models spend max_tokens on thinking first; running out leaves an empty answer
  if (!text && choice?.finish_reason === 'length') throw new Error('โมเดลใช้ token หมดไปกับการคิดจนไม่ได้ตอบ ลองเปลี่ยนเป็นโมเดลที่ไม่ใช่แบบ reasoning หรือเพิ่ม MAX_OUTPUT_TOKENS')
  return text
}

/** Stream text deltas from OpenRouter chat completions. `onUsage` fires on the final chunk, so never when the caller stops early. */
export async function* streamChat(model: string, messages: Msg[], onUsage?: (u: Usage) => void) {
  // own controller: aborted when the consumer stops iterating (client disconnect / stop button)
  const ac = new AbortController()
  try {
    const r = await fetch(URL, { method: 'POST', signal: ac.signal, headers: headers(), body: JSON.stringify({ model, messages, stream: true, max_tokens: MAX_OUTPUT_TOKENS }) })
    if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${await r.text()}`)

    const dec = new TextDecoder()
    let buf = ''
    for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
      buf += dec.decode(chunk, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop()!
      for (const l of lines) {
        if (!l.startsWith('data: ') || l.includes('[DONE]')) continue
        try {
          const j = JSON.parse(l.slice(6))
          if (j.usage) onUsage?.(toUsage(j.usage))
          const t = j.choices?.[0]?.delta?.content
          if (t) yield t as string
        } catch {}
      }
    }
  } finally {
    ac.abort()
  }
}
