import { eq } from 'drizzle-orm'
import { db } from './db'
import type { AiAccess, Usage } from './openrouter'
import { aiUsage, userAiKeys } from './schema'
import { decryptSecret } from './secrets'

// Who pays for a call to a model. Everyone, admins included, uses the OpenRouter key they saved in their profile (stored encrypted, see secrets.ts);
// the site has no key of its own. The one thing that needs no key is a `local:` model, and only admins may use those.

export type AiCtx = { access: AiAccess; source: 'site' | 'own'; record: (kind: string, model: string, u: Usage) => void }
type Me = { id: number; role: string }

export async function ownKey(userId: number) {
  const [row] = await db.select({ ciphertext: userAiKeys.ciphertext }).from(userAiKeys).where(eq(userAiKeys.userId, userId))
  if (!row) return null
  try { return decryptSecret(row.ciphertext, String(userId)) } catch { return null } // the secret was changed, or the row was tampered with: the same as having no key
}

/** The access for this user's AI calls, or the reason they cannot make any. */
export async function aiGate(me: Me): Promise<{ ctx: AiCtx } | { stop: string }> {
  const key = await ownKey(me.id)
  const admin = me.role === 'admin'
  if (!key && !admin) return { stop: 'ต้องตั้งคีย์ OpenRouter ของคุณเองที่หน้า "โปรไฟล์ของฉัน" ก่อนจึงจะใช้ AI ได้ (ค่าใช้จ่ายเป็นของคุณ)' }
  // 'own' = paid with the user's key; 'site' = nobody's key (an admin's local model, and spend recorded before keys were per user)
  const source = key ? 'own' : 'site'
  const record = (kind: string, model: string, u: Usage) => {
    db.insert(aiUsage).values({ userId: me.id, source, kind, model, tokens: u.tokens, cost: u.cost }).catch(e => console.error('could not record AI usage', e))
  }
  return { ctx: { access: { apiKey: key ?? undefined, allowLocal: admin }, source, record } }
}
