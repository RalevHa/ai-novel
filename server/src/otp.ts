import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { db } from './db'
import { OTP_MINUTES, otpMail, type Purpose, sendMail } from './mail'
import { emailCodes } from './schema'

const MAX_TRIES = 5, RESEND_SECONDS = 60

// bound to user, purpose and address, so a code cannot be replayed for another account, flow or email
const mac = (userId: number, purpose: Purpose, email: string, code: string) =>
  createHmac('sha256', process.env.JWT_SECRET!).update(`${userId}\n${purpose}\n${email}\n${code}`).digest('hex')

/** A fresh 6-digit code that replaces any earlier one for this user and purpose; null when one was sent less than a minute ago. Times are compared in SQL (naive UTC). */
export async function issueCode(userId: number, purpose: Purpose, email: string) {
  const code = String(randomInt(1_000_000)).padStart(6, '0')
  const fields = { email, codeHash: mac(userId, purpose, email, code), attempts: 0, expiresAt: sql`now() + make_interval(mins => ${OTP_MINUTES})`, createdAt: sql`now()` }
  const rows = await db.insert(emailCodes).values({ userId, purpose, ...fields })
    .onConflictDoUpdate({ target: [emailCodes.userId, emailCodes.purpose], set: fields, setWhere: sql`${emailCodes.createdAt} < now() - make_interval(secs => ${RESEND_SECONDS})` })
    .returning({ id: emailCodes.id })
  return rows.length ? code : null
}

/** True (once) when `code` is the live code for this user, purpose and address. A try is counted before comparing, so parallel guesses cannot exceed MAX_TRIES. */
export async function checkCode(userId: number, purpose: Purpose, email: string, code: string) {
  const [row] = await db.update(emailCodes).set({ attempts: sql`${emailCodes.attempts} + 1` })
    .where(and(eq(emailCodes.userId, userId), eq(emailCodes.purpose, purpose), sql`${emailCodes.expiresAt} > now()`, sql`${emailCodes.attempts} < ${MAX_TRIES}`))
    .returning({ codeHash: emailCodes.codeHash, email: emailCodes.email })
  if (!row || row.email !== email) return false
  const a = Buffer.from(row.codeHash), b = Buffer.from(mac(userId, purpose, email, code))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  await db.delete(emailCodes).where(and(eq(emailCodes.userId, userId), eq(emailCodes.purpose, purpose)))
  return true
}

/** Issues a code and mails it; 'wait' when one went out less than a minute ago. Throws if the mail cannot be sent. */
export async function sendCode(u: { id: number; name: string }, purpose: Purpose, email: string) {
  const code = await issueCode(u.id, purpose, email)
  if (!code) return 'wait' as const
  await sendMail(email, otpMail(purpose, code, u.name))
  return 'sent' as const
}
