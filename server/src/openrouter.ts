type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

export const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'anthropic/claude-sonnet-4.5'
// hard ceiling on one chapter's output so a runaway model cannot burn money until the connection times out
export const MAX_OUTPUT_TOKENS = Number(process.env.MAX_OUTPUT_TOKENS) || 16000
/** What a call cost: OpenRouter reports credits (= USD) in `usage.cost` without being asked; a local server reports tokens only (cost 0). */
export type Usage = { tokens: number; cost: number }
const toUsage = (u: any): Usage => ({ tokens: Number(u.total_tokens) || 0, cost: Number(u.cost) || 0 })

/** OpenRouter's API root (overridable so tests can point at a fake server). */
export const API_BASE = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '')
const URL = `${API_BASE}/chat/completions`

/** Who pays and what they may reach: `apiKey` is a writer's own OpenRouter key (the site's key is used when absent); local models only for the site's admins. */
export type AiAccess = { apiKey?: string; allowLocal?: boolean }
const LOCAL = 'local:'
const isLocal = (model: string) => model.startsWith(LOCAL)

/**
 * One chat-completions request. A model written `local:<name>` goes to an OpenAI-compatible server on this machine
 * (Ollama unless LOCAL_BASE_URL says otherwise); anything else goes to OpenRouter.
 */
async function send(model: string, body: { messages: Msg[]; stream?: boolean }, signal: AbortSignal, access?: AiAccess) {
  const local = isLocal(model)
  if (local && access && !access.allowLocal) throw new Error('โมเดลในเครื่อง (local:) ใช้ได้เฉพาะผู้ดูแลระบบ เลือกโมเดลของ OpenRouter แทน')
  const base = (process.env.LOCAL_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, '')
  const key = local ? process.env.LOCAL_API_KEY : access?.apiKey || process.env.OPENROUTER_API_KEY
  let r: Response
  try {
    r = await fetch(local ? `${base}/chat/completions` : URL, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', ...(key && { Authorization: `Bearer ${key}` }) },
      // local servers only report usage on a stream when asked; OpenRouter always does
      body: JSON.stringify({ ...body, model: local ? model.slice(LOCAL.length) : model, max_tokens: MAX_OUTPUT_TOKENS, ...(local && body.stream && { stream_options: { include_usage: true } }) }),
    })
  } catch (e) {
    if (local && !['AbortError', 'TimeoutError'].includes((e as Error).name)) throw new Error(`เชื่อมต่อโมเดลในเครื่องที่ ${base} ไม่ได้ (เปิด Ollama อยู่หรือเปล่า?)`)
    throw e
  }
  if (!r.ok) {
    // with a writer's own key, say what to do about the two usual causes instead of an API error
    if (access?.apiKey && !local && r.status === 401) throw new Error('คีย์ OpenRouter ของคุณใช้ไม่ได้ (พิมพ์ผิด ถูกลบ หรือหมดอายุ) ตั้งคีย์ใหม่ที่หน้า "โปรไฟล์ของฉัน"')
    if (access?.apiKey && !local && r.status === 402) throw new Error('เครดิต OpenRouter ของคุณหมด เติมเครดิตที่ openrouter.ai แล้วลองใหม่')
    throw new Error(`${local ? 'Local model' : 'OpenRouter'} ${r.status}: ${await r.text()}`)
  }
  return r
}

/** One-shot (non-streaming) completion; returns the text. `onUsage` receives the cost when the provider reports it. */
export async function chat(model: string, messages: Msg[], onUsage?: (u: Usage) => void, access?: AiAccess) {
  // a local model may need minutes to read a long chapter before it answers
  const r = await send(model, { messages }, AbortSignal.timeout(isLocal(model) ? 600_000 : 180_000), access)
  const body = await r.json()
  if (body.usage) onUsage?.(toUsage(body.usage))
  const choice = body.choices?.[0]
  const text = (choice?.message?.content ?? '').trim() as string
  // reasoning models spend max_tokens on thinking first; running out leaves an empty answer
  if (!text && choice?.finish_reason === 'length') throw new Error('โมเดลใช้ token หมดไปกับการคิดจนไม่ได้ตอบ ลองเปลี่ยนเป็นโมเดลที่ไม่ใช่แบบ reasoning หรือเพิ่ม MAX_OUTPUT_TOKENS')
  return text
}

/** Stream text deltas from chat completions. `onUsage` fires on the final chunk, so never when the caller stops early. */
export async function* streamChat(model: string, messages: Msg[], onUsage?: (u: Usage) => void, access?: AiAccess) {
  // own controller: aborted when the consumer stops iterating (client disconnect / stop button)
  const ac = new AbortController()
  try {
    const r = await send(model, { messages, stream: true }, ac.signal, access)

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
