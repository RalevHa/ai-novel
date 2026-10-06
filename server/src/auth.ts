import { jwt } from '@elysiajs/jwt'
import { eq } from 'drizzle-orm'
import { Elysia, status } from 'elysia'
import { db } from './db'
import { users } from './schema'

export type Role = 'admin' | 'user'

export const auth = new Elysia({ name: 'auth' })
  .use(jwt({ name: 'jwt', secret: process.env.JWT_SECRET!, exp: '30d' }))
  .derive({ as: 'global' }, async ({ jwt, cookie: { token } }) => {
    const p = token.value ? await jwt.verify(token.value as string) : false
    return { me: p ? { id: Number(p.sub), role: p.role as Role } : null }
  })

// status() (not set.status) keeps the error out of the success response type that Eden infers
export const adminOnly = { beforeHandle: ({ me }: { me: { role: Role } | null }) => { if (me?.role !== 'admin') return status(me ? 403 : 401, { error: 'ต้องเป็นผู้ดูแลระบบเท่านั้น' }) } }

/** Create the admin from env on first boot. */
export async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD
  if (!email || !password) return
  const exists = await db.query.users.findFirst({ where: eq(users.email, email) })
  if (!exists) await db.insert(users).values({ email, name: 'Admin', role: 'admin', passwordHash: await Bun.password.hash(password) })
}
