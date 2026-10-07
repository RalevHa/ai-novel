import { eq } from 'drizzle-orm'
import { overBudget } from './budget'
import { db } from './db'
import type { AiAccess, Usage } from './openrouter'
import { aiUsage, userAiKeys } from './schema'
import { decryptSecret } from './secrets'

// Who pays for a call to a model. A writer's own OpenRouter key is used when they have one ('own': their money, not counted against the site's cap);
// an admin without one uses the site's key ('site'); a writer without a key cannot use AI at all.

export type AiCtx = { access: AiAccess; source: 'site' | 'own'; record: (kind: string, model: string, u: Usage) => void }
type Me = { id: number; role: string }

export async function ownKey(userId: number) {
  const [row] = await db.select({ ciphertext: userAiKeys.ciphertext }).from(userAiKeys).where(eq(userAiKeys.userId, userId))
  if (!row) return null
  try { return decryptSecret(row.ciphertext) } catch { return null } // the secret was changed since it was saved: the same as having no key
}

/** The access and the payer for this user's AI calls, or the reason they cannot make any. */
export async function resolveAi(me: Me): Promise<{ ok: true; ctx: AiCtx } | { ok: false; error: string }> {
  const key = await ownKey(me.id)
  const admin = me.role === 'admin'
  if (!key && !admin) return { ok: false, error: 'ต้องตั้งคีย์ OpenRouter ของคุณเองที่หน้า "โปรไฟล์ของฉัน" ก่อนจึงจะใช้ AI ได้ (ค่าใช้จ่ายเป็นของคุณ)' }
  const source = key ? 'own' : 'site'
  const record = (kind: string, model: string, u: Usage) => {
    db.insert(aiUsage).values({ userId: me.id, source, kind, model, tokens: u.tokens, cost: u.cost }).catch(e => console.error('could not record AI usage', e))
  }
  return { ok: true, ctx: { access: { apiKey: key ?? undefined, allowLocal: admin }, source, record } }
}

/** resolveAi plus the site's monthly cap, which only applies when the site's key would pay. */
export async function aiGate(me: Me): Promise<{ ctx: AiCtx } | { stop: string }> {
  const ai = await resolveAi(me)
  if (!ai.ok) return { stop: ai.error }
  const stop = ai.ctx.source === 'site' ? await overBudget() : null
  return stop ? { stop } : { ctx: ai.ctx }
}
