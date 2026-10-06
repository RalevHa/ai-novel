import { jwt } from '@elysiajs/jwt'
import { eq } from 'drizzle-orm'
import { Elysia, status } from 'elysia'
import { db } from './db'
import { users } from './schema'

export type Role = 'admin' | 'user'

export const prod = process.env.NODE_ENV === 'production'

/** Refuse to boot with a missing or placeholder secret; session tokens are only as strong as JWT_SECRET. */
export function assertConfig() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not set')
  if (prod && (secret === 'change-me' || secret.length < 32)) throw new Error('JWT_SECRET must be a random string of 32+ characters in production')
  if (prod && process.env.ADMIN_PASSWORD === 'admin1234') throw new Error('Change ADMIN_PASSWORD from the example value before running in production')
}

export const auth = new Elysia({ name: 'auth' })
  .use(jwt({ name: 'jwt', secret: process.env.JWT_SECRET!, exp: '30d' }))
  .derive({ as: 'global' }, async ({ jwt, cookie: { token } }) => {
    const p = token.value ? await jwt.verify(token.value as string) : false
    // role comes from the DB, not the token: demoting or deleting a user takes effect on their next request
    const u = p && (await db.select({ role: users.role }).from(users).where(eq(users.id, Number(p.sub))))[0]
    return { me: p && u ? { id: Number(p.sub), role: u.role as Role } : null }
  })

// status() (not set.status) keeps the error out of the success response type that Eden infers
export const adminOnly = { beforeHandle: ({ me }: { me: { role: Role } | null }) => { if (me?.role !== 'admin') return status(me ? 403 : 401, { error: 'ต้องเป็นผู้ดูแลระบบเท่านั้น' }) } }

export const userOnly = { beforeHandle: ({ me }: { me: { role: Role } | null }) => { if (!me) return status(401, { error: 'ต้องเข้าสู่ระบบก่อน' }) } }

/** Create the admin from env on first boot. */
export async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD
  if (!email || !password) return
  const exists = await db.query.users.findFirst({ where: eq(users.email, email) })
  if (!exists) await db.insert(users).values({ email, name: 'Admin', role: 'admin', passwordHash: await Bun.password.hash(password) })
}
