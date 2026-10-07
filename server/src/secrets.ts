import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

// Encrypts a writer's OpenRouter key before it goes to the database (AES-256-GCM, a fresh random IV each time, so the same key never
// looks the same twice and any tampering is caught when decrypting). The encryption key is derived from KEY_ENCRYPTION_SECRET, or from
// JWT_SECRET when that is not set. Changing the secret makes stored keys unreadable: writers then have to enter theirs again.
const secret = () => {
  const s = process.env.KEY_ENCRYPTION_SECRET || process.env.JWT_SECRET
  if (!s) throw new Error('KEY_ENCRYPTION_SECRET (or JWT_SECRET) is not set')
  return s
}
// a 32-byte key from the secret, tied to this one purpose (the secret is a long random string, so one HMAC round is enough)
const derive = (s: string) => createHmac('sha256', s).update('ai-novel/user-ai-key-v1').digest()

export function encryptSecret(plain: string, s = secret()) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', derive(s), iv)
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join('.')
}

/** Throws if the text was altered or the secret is not the one it was encrypted with. */
export function decryptSecret(packed: string, s = secret()) {
  const [v, iv, tag, ct] = packed.split('.')
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('unreadable secret')
  const d = createDecipheriv('aes-256-gcm', derive(s), Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8')
}
