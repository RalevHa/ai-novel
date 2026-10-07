import { overBudget } from './budget'
import { db } from './db'
import type { AiAccess, Usage } from './openrouter'
import { aiUsage } from './schema'

// Who pays for a call to a model. A writer's own OpenRouter key comes with the request (it lives in their browser, never in our database): when
// present it pays ('own': their money, not counted against the site's cap). An admin without one uses the site's key ('site'). A writer
// without a key cannot use AI at all.

export type AiCtx = { access: AiAccess; source: 'site' | 'own'; record: (kind: string, model: string, u: Usage) => void }
type Me = { id: number; role: string }

/** The access and the payer for this user's AI calls, or the reason they cannot make any. `key` is the one sent with the request, already parsed. */
export function resolveAi(me: Me, key?: string): { ok: true; ctx: AiCtx } | { ok: false; error: string } {
  const admin = me.role === 'admin'
  if (!key && !admin) return { ok: false, error: 'ต้องตั้งคีย์ OpenRouter ของคุณเองที่หน้า "โปรไฟล์ของฉัน" ก่อนจึงจะใช้ AI ได้ (ค่าใช้จ่ายเป็นของคุณ)' }
  const source = key ? 'own' : 'site'
  const record = (kind: string, model: string, u: Usage) => {
    db.insert(aiUsage).values({ userId: me.id, source, kind, model, tokens: u.tokens, cost: u.cost }).catch(e => console.error('could not record AI usage', e))
  }
  return { ok: true, ctx: { access: { apiKey: key, allowLocal: admin }, source, record } }
}

/** resolveAi plus the site's monthly cap, which only applies when the site's key would pay. */
export async function aiGate(me: Me, key?: string): Promise<{ ctx: AiCtx } | { stop: string }> {
  const ai = resolveAi(me, key)
  if (!ai.ok) return { stop: ai.error }
  const stop = ai.ctx.source === 'site' ? await overBudget() : null
  return stop ? { stop } : { ctx: ai.ctx }
}
