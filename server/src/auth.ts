import { jwt } from '@elysiajs/jwt'
import { eq, sql } from 'drizzle-orm'
import { Elysia, status } from 'elysia'
import { db } from './db'
import { chapters, characters, stories, users } from './schema'

export type Role = 'admin' | 'writer' | 'user'

export const prod = process.env.NODE_ENV === 'production'

/** Refuse to boot with a missing or placeholder secret; session tokens are only as strong as JWT_SECRET. */
export function assertConfig() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not set')
  if (prod && (secret === 'change-me' || secret.length < 32)) throw new Error('JWT_SECRET must be a random string of 32+ characters in production')
  if (prod && !process.env.SMTP_HOST) throw new Error('SMTP_HOST is not set: sign-up needs to email a code (see SMTP_* in server/.env.example)')
  if (prod && process.env.ADMIN_PASSWORD === 'admin1234') throw new Error('Change ADMIN_PASSWORD from the example value before running in production')
}

/** True when a token (iat in seconds) predates the last password change (epoch seconds, 0 = never). Compared by whole seconds, so signing in right after a reset is never refused. */
export const issuedBeforeChange = (iat: number | undefined, changedEpoch: number) => changedEpoch > 0 && (iat ?? 0) < Math.floor(changedEpoch)

export const auth = new Elysia({ name: 'auth' })
  .use(jwt({ name: 'jwt', secret: process.env.JWT_SECRET!, exp: '30d' }))
  .derive({ as: 'global' }, async ({ jwt, cookie: { token } }) => {
    const p = token.value ? await jwt.verify(token.value as string) : false
    // role comes from the DB, not the token: demoting, suspending or deleting a user takes effect on their next request
    const u = p && (await db.select({ role: users.role, suspended: users.suspendedAt, changed: sql<number>`coalesce(extract(epoch from ${users.passwordChangedAt}), 0)::float8` }).from(users).where(eq(users.id, Number(p.sub))))[0]
    return { me: p && u && !u.suspended && !issuedBeforeChange(p.iat, u.changed) ? { id: Number(p.sub), role: u.role as Role } : null }
  })

// status() (not set.status) keeps the error out of the success response type that Eden infers
export const adminOnly = { beforeHandle: ({ me }: { me: { role: Role } | null }) => { if (me?.role !== 'admin') return status(me ? 403 : 401, { error: 'ต้องเป็นผู้ดูแลระบบเท่านั้น' }) } }

const OWNED = /^\/api\/admin\/(stories|chapters|characters)\/(\d+)/

/** A writer may only touch stories they created; admins pass. The story is found from the id in the URL (story, chapter or character). */
async function ownStory({ me, request }: { me: { id: number; role: Role } | null; request: Request }) {
  if (me?.role !== 'writer') return
  const m = OWNED.exec(new URL(request.url).pathname)
  if (!m) return
  const [kind, n] = [m[1], Number(m[2])]
  const [row] = kind === 'stories'
    ? await db.select({ authorId: stories.authorId }).from(stories).where(eq(stories.id, n))
    : kind === 'chapters'
      ? await db.select({ authorId: stories.authorId }).from(chapters).innerJoin(stories, eq(stories.id, chapters.storyId)).where(eq(chapters.id, n))
      : await db.select({ authorId: stories.authorId }).from(characters).innerJoin(stories, eq(stories.id, characters.storyId)).where(eq(characters.id, n))
  if (row && row.authorId !== me.id) return status(403, { error: 'นี่ไม่ใช่เรื่องของคุณ' }) // a missing row falls through to the handler's own 404
}

/** Admin or writer; writers are then limited to their own stories. */
export const staffOnly = {
  beforeHandle: [
    ({ me }: { me: { role: Role } | null }) => { if (me?.role !== 'admin' && me?.role !== 'writer') return status(me ? 403 : 401, { error: 'ต้องเป็นนักเขียนหรือผู้ดูแลระบบเท่านั้น' }) },
    ownStory,
  ],
}

export const userOnly = { beforeHandle: ({ me }: { me: { role: Role } | null }) => { if (!me) return status(401, { error: 'ต้องเข้าสู่ระบบก่อน' }) } }

/** Create the admin from env on first boot. */
export async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD
  if (!email || !password) return
  const exists = await db.query.users.findFirst({ where: eq(users.email, email) })
  if (!exists) await db.insert(users).values({ email, name: 'Admin', role: 'admin', passwordHash: await Bun.password.hash(password), emailVerifiedAt: sql`now()` })
}
