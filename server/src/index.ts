import { cors } from '@elysiajs/cors'
import { and, asc, desc, eq, ilike, inArray, isNull, max, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { join } from 'node:path'
import { Elysia, status, t } from 'elysia'
import { aiGate, ownKey } from './ai'
import { adminOnly, assertConfig, auth, prod, seedAdmin, staffOnly, userOnly } from './auth'
import { addChapter, checkChapter, summarizeChapter } from './chapters'
import { suggestCharacters } from './characters'
import { buildContext, excerptSql } from './context'
import { buildEpub } from './epub'
import { atomFeed } from './feed'
import { loopStart } from './guard'
import { checkCode, sendCode } from './otp'
import { imageNames, stripImages } from './markdown'
import { markDone, nextBeat } from './outline'
import { pageQuery, paging } from './paging'
import { forgive, limited } from './ratelimit'
import { pruneUnused, sweepOrphans } from './media'
import { MIME_BY_EXT, NAME_RE, removeUpload, saveImage, UPLOAD_DIR } from './uploads'
import { db } from './db'
import { API_BASE, streamChat, type Usage } from './openrouter'
import { encryptSecret } from './secrets'
import { auditLog, bookmarks, chapterReads, chapters, chapterVersions, characters, commentReports, commentVotes, comments, notifications, reviews, readingProgress, stories, userAiKeys, users } from './schema'
import { releasedAtFor } from './release'
import { siteRoutes } from './site'
import { restore, snapshot } from './versions'
import { liveAt, visible, visibleSql } from './visibility'

const id = { params: t.Object({ id: t.Numeric() }) }
const characterBody = t.Object({ name: t.String({ minLength: 1 }), role: t.Optional(t.String()), profile: t.Optional(t.String()), visible: t.Optional(t.Boolean()) })
// type/size are checked by saveImage (magic bytes), so the error message can be shown to the admin as-is
const imageBody = t.Object({ file: t.File() })
const cookieOpts = { httpOnly: true, secure: prod, sameSite: 'lax' as const, path: '/', maxAge: 30 * 86400 }
const WINDOW = 15 * 60_000
const publicUser = { id: users.id, email: users.email, name: users.name, role: users.role, bio: users.bio, createdAt: users.createdAt }

// what the shelf shows per story; callers join users for the author's name
const listFields = {
  id: stories.id, title: stories.title, synopsis: stories.synopsis, genre: stories.genre, mood: stories.mood, status: stories.status, createdAt: stories.createdAt, coverImage: stories.coverImage,
  authorId: stories.authorId, authorName: users.name,
  chapterCount: sql<number>`(select count(*)::int from chapters where chapters.story_id = stories.id and ${visibleSql})`,
  rating: sql<number | null>`(select round(avg(reviews.rating)::numeric, 1)::float8 from reviews where reviews.story_id = stories.id)`, // null = no reviews yet
  ratingCount: sql<number>`(select count(*)::int from reviews where reviews.story_id = stories.id)`,
  updatedAt: sql<string | null>`(select max(coalesce(chapters.publish_at, chapters.created_at)) from chapters where chapters.story_id = stories.id and ${visibleSql})`,
}

const storyBody = t.Object({
  title: t.String({ minLength: 1 }),
  synopsis: t.Optional(t.String()),
  genre: t.Optional(t.String()),
  mood: t.Optional(t.String()),
  premise: t.Optional(t.String()),
  systemPrompt: t.Optional(t.String()),
  outline: t.Optional(t.String()),
  status: t.Optional(t.Union([t.Literal('ongoing'), t.Literal('completed')])),
  model: t.Optional(t.String()),
  published: t.Optional(t.Boolean()),
})

const authRoutes = new Elysia({ prefix: '/auth' })
  .use(auth)
  .post('/register', async ({ body, status, request, server }) => {
    if (process.env.ALLOW_REGISTRATION === 'false') return status(403, { error: 'ปิดรับสมัครสมาชิก' })
    if (limited(`register:${server?.requestIP(request)?.address}`, 5, 60 * 60_000)) return status(429, { error: 'สมัครบ่อยเกินไป ลองใหม่ภายหลัง' })
    const existing = await db.query.users.findFirst({ where: eq(users.email, body.email), columns: { id: true, emailVerifiedAt: true } })
    if (existing?.emailVerifiedAt) return status(409, { error: 'อีเมลนี้ถูกใช้แล้ว' })
    const row = { name: body.name, passwordHash: await Bun.password.hash(body.password), termsAcceptedAt: sql`now()` }
    // an address nobody has confirmed can be claimed again, so a stranger who typed it cannot lock its owner out; the old unconfirmed sign-up is overwritten
    const [u] = existing
      ? await db.update(users).set(row).where(eq(users.id, existing.id)).returning(publicUser)
      : await db.insert(users).values({ ...row, email: body.email }).returning(publicUser)
    try { await sendCode(u, 'verify', u.email) } catch (e) { console.error('verify mail failed', e); return status(503, { error: 'ส่งอีเมลยืนยันไม่สำเร็จ ลองใหม่ภายหลัง' }) }
    return { needsVerify: true as const, email: u.email } // no session until the code is entered
  }, { body: t.Object({ email: t.String({ format: 'email' }), name: t.String({ minLength: 1 }), password: t.String({ minLength: 8 }), acceptTerms: t.Literal(true, { error: 'ต้องยอมรับข้อกำหนดการใช้งานและนโยบายความเป็นส่วนตัวก่อนสมัคร' }) }) })
  .post('/login', async ({ body, jwt, cookie: { token }, status, request, server }) => {
    // per IP + email: guessing one account from one address is capped, without letting a stranger lock the admin out from elsewhere
    const key = `login:${server?.requestIP(request)?.address}:${body.email.toLowerCase()}`
    if (limited(key, 10, WINDOW)) return status(429, { error: 'ลองเข้าสู่ระบบบ่อยเกินไป รอสักครู่แล้วลองใหม่' })
    const u = await db.query.users.findFirst({ where: eq(users.email, body.email) })
    if (!u || !(await Bun.password.verify(body.password, u.passwordHash))) return status(401, { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })
    forgive(key)
    if (!u.emailVerifiedAt) {
      await sendCode(u, 'verify', u.email).catch(e => console.error('verify mail failed', e)) // the web then opens the code page; "send again" is there if this failed
      return status(403, { error: 'ยังไม่ได้ยืนยันอีเมล เราส่งรหัสไปให้แล้ว', needsVerify: true as const, email: u.email })
    }
    token.set({ value: await jwt.sign({ sub: String(u.id), role: u.role }), ...cookieOpts })
    return { id: u.id, email: u.email, name: u.name, role: u.role }
  }, { body: t.Object({ email: t.String(), password: t.String() }) })
  .post('/verify', async ({ body, jwt, cookie: { token }, status, request, server }) => {
    if (limited(`verify:${server?.requestIP(request)?.address}:${body.email.toLowerCase()}`, 10, WINDOW)) return status(429, { error: 'ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่' })
    const u = await db.query.users.findFirst({ where: eq(users.email, body.email), columns: { id: true, email: true, emailVerifiedAt: true } })
    if (!u || u.emailVerifiedAt || !(await checkCode(u.id, 'verify', u.email, body.code))) return status(400, { error: 'รหัสไม่ถูกต้องหรือหมดอายุ' })
    const [me] = await db.update(users).set({ emailVerifiedAt: sql`now()` }).where(eq(users.id, u.id)).returning(publicUser)
    token.set({ value: await jwt.sign({ sub: String(me.id), role: me.role }), ...cookieOpts })
    return me
  }, { body: t.Object({ email: t.String(), code: t.String({ minLength: 6, maxLength: 6 }) }) })
  // "send again" and "forgot password" always answer ok, so they cannot be used to find out which addresses have an account
  .post('/resend', async ({ body, status, request, server }) => {
    if (limited(`resend:${server?.requestIP(request)?.address}`, 10, 60 * 60_000)) return status(429, { error: 'ขอรหัสบ่อยเกินไป ลองใหม่ภายหลัง' })
    const u = await db.query.users.findFirst({ where: eq(users.email, body.email), columns: { id: true, name: true, email: true, emailVerifiedAt: true } })
    if (u && !u.emailVerifiedAt) await sendCode(u, 'verify', u.email).catch(e => console.error('verify mail failed', e))
    return { ok: true }
  }, { body: t.Object({ email: t.String() }) })
  .post('/forgot', async ({ body, status, request, server }) => {
    if (limited(`forgot:${server?.requestIP(request)?.address}`, 10, 60 * 60_000)) return status(429, { error: 'ขอรหัสบ่อยเกินไป ลองใหม่ภายหลัง' })
    const u = await db.query.users.findFirst({ where: eq(users.email, body.email), columns: { id: true, name: true, email: true } })
    if (u) await sendCode(u, 'reset', u.email).catch(e => console.error('reset mail failed', e))
    return { ok: true }
  }, { body: t.Object({ email: t.String() }) })
  .post('/reset', async ({ body, status, request, server }) => {
    if (limited(`reset:${server?.requestIP(request)?.address}:${body.email.toLowerCase()}`, 10, WINDOW)) return status(429, { error: 'ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่' })
    const u = await db.query.users.findFirst({ where: eq(users.email, body.email), columns: { id: true, email: true } })
    if (!u || !(await checkCode(u.id, 'reset', u.email, body.code))) return status(400, { error: 'รหัสไม่ถูกต้องหรือหมดอายุ' })
    // the code came to their inbox, so this also proves the address; sign-in itself stays a separate step
    await db.update(users).set({ passwordHash: await Bun.password.hash(body.password), passwordChangedAt: sql`now()`, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` }).where(eq(users.id, u.id))
    return { ok: true }
  }, { body: t.Object({ email: t.String(), code: t.String({ minLength: 6, maxLength: 6 }), password: t.String({ minLength: 8 }) }) })
  .post('/logout', ({ cookie: { token } }) => { token.remove(); return { ok: true } })
  .get('/me', async ({ me }) => me && (await db.select(publicUser).from(users).where(eq(users.id, me.id)))[0] || null)

// Reader side: published only
const readerRoutes = new Elysia()
  // only names we generated are served, so there is no path to traverse
  .get('/uploads/:name', async ({ params, status, set }) => {
    const file = Bun.file(join(UPLOAD_DIR, params.name))
    if (!NAME_RE.test(params.name) || !(await file.exists())) return status(404, { error: 'ไม่พบไฟล์' })
    set.headers['content-type'] = MIME_BY_EXT[params.name.split('.').pop()!]
    set.headers['cache-control'] = 'public, max-age=31536000, immutable' // names are random per upload, so never stale
    set.headers['x-content-type-options'] = 'nosniff'
    return file
  })
  .get('/stories', () => db.select(listFields).from(stories).innerJoin(users, eq(users.id, stories.authorId)).where(eq(stories.published, true)).orderBy(desc(stories.id)))
  .get('/authors/:id', async ({ params, status }) => {
    const [a] = await db.select({ id: users.id, name: users.name, bio: users.bio, role: users.role }).from(users).where(eq(users.id, params.id))
    const list = a && await db.select(listFields).from(stories).innerJoin(users, eq(users.id, stories.authorId)).where(and(eq(stories.authorId, a.id), eq(stories.published, true))).orderBy(desc(stories.id))
    // readers have no author page; a former writer keeps theirs while stories of theirs are still published
    if (!a || (a.role === 'user' && !list.length)) return status(404, { error: 'ไม่พบข้อมูล' })
    return { id: a.id, name: a.name, bio: a.bio, stories: list }
  }, id)
  .get('/stories/:id', async ({ params, status }) => {
    const s = await db.query.stories.findFirst({ where: and(eq(stories.id, params.id), eq(stories.published, true)), columns: { id: true, title: true, synopsis: true, genre: true, mood: true, status: true, coverImage: true, createdAt: true, authorId: true } })
    if (!s) return status(404, { error: 'ไม่พบข้อมูล' })
    const [{ name: authorName }] = await db.select({ name: users.name }).from(users).where(eq(users.id, s.authorId))
    const list = await db.select({ no: chapters.no, title: chapters.title, createdAt: chapters.createdAt, commentCount: sql<number>`(select count(*)::int from comments where comments.chapter_id = chapters.id)` }).from(chapters)
      .where(and(eq(chapters.storyId, s.id), visible)).orderBy(asc(chapters.no))
    const cast = await db.select({ id: characters.id, name: characters.name, role: characters.role, profile: characters.profile, image: characters.image })
      .from(characters).where(and(eq(characters.storyId, s.id), eq(characters.visible, true))).orderBy(asc(characters.id))
    return { ...s, authorName, chapters: list, characters: cast }
  }, id)
  // built per request from published chapters only; cache by (story, newest chapter) if downloads ever get frequent
  .get('/stories/:id/epub', async ({ params, status, request, server }) => {
    if (limited(`epub:${server?.requestIP(request)?.address}`, 20, 60 * 60_000)) return status(429, { error: 'ดาวน์โหลดบ่อยเกินไป ลองใหม่ภายหลัง' })
    const s = await db.query.stories.findFirst({ where: and(eq(stories.id, params.id), eq(stories.published, true)), columns: { id: true, title: true, synopsis: true, genre: true, coverImage: true } })
    if (!s) return status(404, { error: 'ไม่พบข้อมูล' })
    const list = await db.select({ no: chapters.no, title: chapters.title, content: chapters.content }).from(chapters)
      .where(and(eq(chapters.storyId, s.id), visible)).orderBy(asc(chapters.no))
    if (!list.length) return status(404, { error: 'เรื่องนี้ยังไม่มีตอนที่เผยแพร่' })
    return new Response(await buildEpub(s, list), { headers: {
      'content-type': 'application/epub+zip',
      'content-disposition': `attachment; filename="story-${s.id}.epub"; filename*=UTF-8''${encodeURIComponent(s.title)}.epub`,
    } })
  }, id)
  // newest live chapters; PUBLIC_URL (e.g. https://novel.example.com) makes the links right behind a proxy
  .get('/stories/:id/feed.xml', async ({ params, status, request }) => {
    const s = await db.query.stories.findFirst({ where: and(eq(stories.id, params.id), eq(stories.published, true)), columns: { id: true, title: true, synopsis: true } })
    if (!s) return status(404, { error: 'ไม่พบข้อมูล' })
    const rows = await db.select({ no: chapters.no, title: chapters.title, excerpt: excerptSql(300), at: sql<string>`${liveAt}` }).from(chapters)
      .where(and(eq(chapters.storyId, s.id), visible)).orderBy(desc(liveAt)).limit(20)
    const base = (process.env.PUBLIC_URL || new URL(request.url).origin).replace(/\/$/, '')
    return new Response(atomFeed(s, rows.map(r => ({ ...r, at: new Date(r.at.replace(' ', 'T') + 'Z') })), base), { headers: { 'content-type': 'application/atom+xml; charset=utf-8' } })
  }, id)
  // Anonymous aggregate counters: how many times a chapter was opened / read to the end. Nothing about who is stored (the IP is only used for the in-memory rate limit).
  .post('/stories/:id/chapters/:no/view', async ({ params, body, status, request, server }) => {
    if (limited(`view:${server?.requestIP(request)?.address}`, 300, 60 * 60_000)) return status(429, { error: 'ส่งบ่อยเกินไป' })
    const rows = await db.update(chapters).set(body.done ? { finishes: sql`${chapters.finishes} + 1` } : { views: sql`${chapters.views} + 1` })
      .where(and(eq(chapters.storyId, params.id), eq(chapters.no, params.no), visible, sql`exists (select 1 from stories where stories.id = ${chapters.storyId} and stories.published)`)).returning({ id: chapters.id })
    return rows.length ? { ok: true } : status(404, { error: 'ไม่พบข้อมูล' })
  }, { params: t.Object({ id: t.Numeric(), no: t.Numeric() }), body: t.Object({ done: t.Optional(t.Boolean()) }) })
  .get('/stories/:id/chapters/:no', async ({ params, status }) => {
    const [c] = await db.select({ no: chapters.no, title: chapters.title, content: chapters.content }).from(chapters)
      .innerJoin(stories, eq(stories.id, chapters.storyId))
      .where(and(eq(chapters.storyId, params.id), eq(chapters.no, params.no), visible, eq(stories.published, true)))
    return c ?? status(404, { error: 'ไม่พบข้อมูล' })
  }, { params: t.Object({ id: t.Numeric(), no: t.Numeric() }) })

// Community: anyone reads, only signed-in users write.
// Chapter comments: replies one level deep, up/down votes, sortable (new / top / most replies). The story's author and admins may remove any comment on it.
const COMMENT_MAX = 1000
const REVIEW_MAX = 2000

/** The chapter a comment would go on, if readers can see it. */
async function liveChapterId(storyId: number, no: number) {
  const [c] = await db.select({ id: chapters.id }).from(chapters).innerJoin(stories, eq(stories.id, chapters.storyId))
    .where(and(eq(chapters.storyId, storyId), eq(chapters.no, no), visible, eq(stories.published, true)))
  return c?.id
}

type CommentSort = 'new' | 'top' | 'replies'
const scoreSql = sql<number>`coalesce((select sum(value) from comment_votes where comment_id = comments.id), 0)::int`
const replyCountSql = sql<number>`(select count(*)::int from comments r where r.parent_id = comments.id)`

async function listComments(storyId: number, no: number, query: { page?: number; size?: number; sort?: CommentSort }, me: { id: number; role: string } | null) {
  const chapterId = await liveChapterId(storyId, no)
  if (!chapterId) return status(404, { error: 'ไม่พบข้อมูล' })
  const inChapter = eq(comments.chapterId, chapterId)
  const topLevel = and(inChapter, isNull(comments.parentId))
  const [total, all] = await Promise.all([db.$count(comments, topLevel), db.$count(comments, inChapter)]) // total pages top-level threads; all includes replies
  const { page, size, offset } = paging(query, total, 'first', 20)
  const fields = {
    id: comments.id, parentId: comments.parentId, body: comments.body, createdAt: comments.createdAt, editedAt: comments.editedAt, userId: comments.userId, userName: users.name, storyAuthor: stories.authorId,
    score: scoreSql, myVote: me ? sql<number | null>`(select value from comment_votes where comment_id = comments.id and user_id = ${me.id})` : sql<number | null>`null`,
  }
  const base = () => db.select(fields).from(comments).innerJoin(users, eq(users.id, comments.userId)).innerJoin(stories, eq(stories.id, comments.storyId))
  const order = { new: [desc(comments.id)], top: [desc(scoreSql), desc(comments.id)], replies: [desc(replyCountSql), desc(comments.id)] }[query.sort ?? 'new']
  const tops = await base().where(topLevel).orderBy(...order).limit(size).offset(offset)
  // ponytail: every reply of the threads on this page, oldest first; paginate replies per thread if a thread ever gets huge
  const replies = tops.length ? await base().where(inArray(comments.parentId, tops.map(c => c.id))).orderBy(asc(comments.id)).limit(500) : []
  const shape = ({ storyAuthor, ...c }: (typeof tops)[number]) => ({ ...c, isAuthor: c.userId === storyAuthor, canDelete: !!me && (me.role === 'admin' || me.id === c.userId || me.id === storyAuthor) })
  const items = tops.map(c => ({ ...shape(c), replies: replies.filter(r => r.parentId === c.id).map(shape) }))
  return { items, total, all, page, size }
}

async function addComment(storyId: number, no: number, text: string, parentId: number | undefined, me: { id: number }) {
  const body = text.trim()
  if (!body) return status(422, { error: 'พิมพ์ข้อความก่อน' })
  if (limited(`comment:${me.id}`, 10, 10 * 60_000)) return status(429, { error: 'คอมเมนต์บ่อยเกินไป รอสักครู่แล้วลองใหม่' })
  const chapterId = await liveChapterId(storyId, no)
  if (!chapterId) return status(404, { error: 'ไม่พบข้อมูล' })
  let parent: number | null = null, answered: number | null = null
  if (parentId !== undefined) {
    const [p] = await db.select({ id: comments.id, parentId: comments.parentId, userId: comments.userId }).from(comments).where(and(eq(comments.id, parentId), eq(comments.chapterId, chapterId)))
    if (!p) return status(404, { error: 'ไม่พบความคิดเห็นที่จะตอบ' })
    parent = p.parentId ?? p.id // replies stay one level deep: answering a reply lands in the same thread
    answered = p.userId
  }
  const [c] = await db.insert(comments).values({ storyId, chapterId, userId: me.id, parentId: parent, body }).returning({ id: comments.id })
  if (answered !== null && answered !== me.id) await db.insert(notifications).values({ userId: answered, type: 'reply', actorId: me.id, commentId: c.id }) // whoever was answered hears about it
  return c
}

async function voteComment(commentId: number, value: -1 | 0 | 1, me: { id: number }) {
  const [c] = await db.select({ userId: comments.userId }).from(comments).where(eq(comments.id, commentId))
  if (!c) return status(404, { error: 'ไม่พบข้อมูล' })
  if (c.userId === me.id) return status(403, { error: 'โหวตความคิดเห็นของตัวเองไม่ได้' })
  if (limited(`vote:${me.id}`, 60, 10 * 60_000)) return status(429, { error: 'โหวตบ่อยเกินไป รอสักครู่แล้วลองใหม่' })
  const [before] = await db.select({ value: commentVotes.value }).from(commentVotes).where(and(eq(commentVotes.commentId, commentId), eq(commentVotes.userId, me.id)))
  if (value === 0) await db.delete(commentVotes).where(and(eq(commentVotes.commentId, commentId), eq(commentVotes.userId, me.id)))
  else await db.insert(commentVotes).values({ commentId, userId: me.id, value }).onConflictDoUpdate({ target: [commentVotes.commentId, commentVotes.userId], set: { value } })
  // a new upvote tells the author (one row per comment, shown again as unread); voters stay anonymous and downvotes are not announced
  if (value === 1 && before?.value !== 1) await db.insert(notifications).values({ userId: c.userId, type: 'vote', commentId })
    .onConflictDoUpdate({ target: [notifications.userId, notifications.type, notifications.commentId], set: { readAt: null, createdAt: sql`now()` } })
  const [{ score }] = await db.select({ score: sql<number>`coalesce(sum(${commentVotes.value}), 0)::int` }).from(commentVotes).where(eq(commentVotes.commentId, commentId))
  return { score, myVote: value || null }
}

// Reviews of a whole story (shown on its contents page): one per reader, 1-5 stars plus optional text. The author cannot review their own story.
async function listReviews(storyId: number, query: { page?: number; size?: number }, me: { id: number; role: string } | null) {
  if (!(await db.query.stories.findFirst({ where: and(eq(stories.id, storyId), eq(stories.published, true)), columns: { id: true } }))) return status(404, { error: 'ไม่พบข้อมูล' })
  const where = eq(reviews.storyId, storyId)
  const counts = await db.select({ rating: reviews.rating, n: sql<number>`count(*)::int` }).from(reviews).where(where).groupBy(reviews.rating)
  const dist = [1, 2, 3, 4, 5].map(r => counts.find(c => c.rating === r)?.n ?? 0) // index 0 = one star
  const total = dist.reduce((a, b) => a + b, 0)
  const { page, size, offset } = paging(query, total, 'first', 10)
  const rows = await db.select({ id: reviews.id, rating: reviews.rating, body: reviews.body, createdAt: reviews.createdAt, updatedAt: reviews.updatedAt, userId: reviews.userId, userName: users.name })
    .from(reviews).innerJoin(users, eq(users.id, reviews.userId)).where(where).orderBy(desc(reviews.updatedAt), desc(reviews.id)).limit(size).offset(offset)
  const mine = me ? (await db.select({ id: reviews.id, rating: reviews.rating, body: reviews.body }).from(reviews).where(and(where, eq(reviews.userId, me.id))))[0] ?? null : null
  return {
    average: total ? dist.reduce((a, n, i) => a + n * (i + 1), 0) / total : 0, dist, mine,
    items: rows.map(r => ({ ...r, canDelete: !!me && (me.role === 'admin' || me.id === r.userId) })), total, page, size,
  }
}

async function saveReview(storyId: number, rating: number, text: string, me: { id: number }) {
  const story = await db.query.stories.findFirst({ where: and(eq(stories.id, storyId), eq(stories.published, true)), columns: { authorId: true } })
  if (!story) return status(404, { error: 'ไม่พบข้อมูล' })
  if (story.authorId === me.id) return status(403, { error: 'รีวิวเรื่องของตัวเองไม่ได้' })
  if (limited(`review:${me.id}`, 10, 10 * 60_000)) return status(429, { error: 'ส่งบ่อยเกินไป รอสักครู่แล้วลองใหม่' })
  const body = text.trim()
  await db.insert(reviews).values({ storyId, userId: me.id, rating, body })
    .onConflictDoUpdate({ target: [reviews.storyId, reviews.userId], set: { rating, body, updatedAt: sql`now()` } })
  return { ok: true }
}

const commentRoutes = new Elysia()
  .use(auth)
  .get('/stories/:id/chapters/:no/comments', ({ params, query, me }) => listComments(params.id, params.no, query, me), { params: t.Object({ id: t.Numeric(), no: t.Numeric() }), query: t.Object({ ...pageQuery.properties, sort: t.Optional(t.Union([t.Literal('new'), t.Literal('top'), t.Literal('replies')])) }) })
  .post('/stories/:id/chapters/:no/comments', ({ params, body, me }) => addComment(params.id, params.no, body.body, body.parentId, me!), { params: t.Object({ id: t.Numeric(), no: t.Numeric() }), body: t.Object({ body: t.String({ maxLength: COMMENT_MAX }), parentId: t.Optional(t.Integer()) }), ...userOnly })
  .put('/comments/:id/vote', ({ params, body, me }) => voteComment(params.id, body.value, me!), { ...id, body: t.Object({ value: t.Union([t.Literal(-1), t.Literal(0), t.Literal(1)]) }), ...userOnly })
  .delete('/comments/:id', async ({ params, me }) => {
    const [c] = await db.select({ userId: comments.userId, body: comments.body, storyAuthor: stories.authorId }).from(comments).innerJoin(stories, eq(stories.id, comments.storyId)).where(eq(comments.id, params.id))
    if (!c) return status(404, { error: 'ไม่พบข้อมูล' })
    if (me!.role !== 'admin' && me!.id !== c.userId && me!.id !== c.storyAuthor) return status(403, { error: 'ลบได้เฉพาะความคิดเห็นของตัวเอง' })
    await db.transaction(async tx => {
      await tx.delete(comments).where(eq(comments.id, params.id))
      // removing somebody else's comment (admin or story author) is written down; deleting your own is not
      if (me!.id !== c.userId) await tx.insert(auditLog).values({ actorId: me!.id, action: 'comment_delete', targetId: c.userId, detail: c.body.replace(/\s+/g, ' ').slice(0, 120) })
    })
    return { ok: true }
  }, { ...id, ...userOnly })
  // only the author of a comment can change its text
  .patch('/comments/:id', async ({ params, body, me }) => {
    const text = body.body.trim()
    if (!text) return status(422, { error: 'พิมพ์ข้อความก่อน' })
    const [c] = await db.select({ userId: comments.userId }).from(comments).where(eq(comments.id, params.id))
    if (!c) return status(404, { error: 'ไม่พบข้อมูล' })
    if (c.userId !== me!.id) return status(403, { error: 'แก้ไขได้เฉพาะความคิดเห็นของตัวเอง' })
    if (limited(`comment:${me!.id}`, 10, 10 * 60_000)) return status(429, { error: 'ส่งบ่อยเกินไป รอสักครู่แล้วลองใหม่' })
    await db.update(comments).set({ body: text, editedAt: sql`now()` }).where(eq(comments.id, params.id))
    return { ok: true }
  }, { ...id, body: t.Object({ body: t.String({ maxLength: COMMENT_MAX }) }), ...userOnly })
  .post('/comments/:id/report', async ({ params, body, me }) => {
    const [c] = await db.select({ userId: comments.userId }).from(comments).where(eq(comments.id, params.id))
    if (!c) return status(404, { error: 'ไม่พบข้อมูล' })
    if (c.userId === me!.id) return status(403, { error: 'รายงานความคิดเห็นของตัวเองไม่ได้' })
    if (limited(`report:${me!.id}`, 10, 60 * 60_000)) return status(429, { error: 'รายงานบ่อยเกินไป รอสักครู่แล้วลองใหม่' })
    // reporting again (e.g. after a dismissal) re-opens it with the new reason
    await db.insert(commentReports).values({ commentId: params.id, reporterId: me!.id, reason: body.reason?.trim() ?? '' })
      .onConflictDoUpdate({ target: [commentReports.commentId, commentReports.reporterId], set: { reason: body.reason?.trim() ?? '', resolvedAt: null, createdAt: sql`now()` } })
    return { ok: true }
  }, { ...id, body: t.Object({ reason: t.Optional(t.String({ maxLength: 300 })) }), ...userOnly })
  .get('/stories/:id/reviews', ({ params, query, me }) => listReviews(params.id, query, me), { ...id, query: pageQuery })
  .put('/stories/:id/reviews', ({ params, body, me }) => saveReview(params.id, body.rating, body.body ?? '', me!), { ...id, body: t.Object({ rating: t.Integer({ minimum: 1, maximum: 5 }), body: t.Optional(t.String({ maxLength: REVIEW_MAX })) }), ...userOnly })
  // the story's author cannot remove reviews of their own story (that would hide criticism); the reviewer and admins can
  .delete('/reviews/:id', async ({ params, me }) => {
    const [r] = await db.select({ userId: reviews.userId }).from(reviews).where(eq(reviews.id, params.id))
    if (!r) return status(404, { error: 'ไม่พบข้อมูล' })
    if (me!.role !== 'admin' && me!.id !== r.userId) return status(403, { error: 'ลบได้เฉพาะรีวิวของตัวเอง' })
    await db.delete(reviews).where(eq(reviews.id, params.id))
    return { ok: true }
  }, { ...id, ...userOnly })

// Signed-in readers: where they stopped in each story
// only chapters readers can see may be recorded, which also keeps the story foreign key valid
const isLive = async (storyId: number, no: number) => !!(await db.select({ id: chapters.id }).from(chapters).innerJoin(stories, eq(stories.id, chapters.storyId))
  .where(and(eq(chapters.storyId, storyId), eq(chapters.no, no), visible, eq(stories.published, true))))[0]

// Followed stories with chapters that went live after the reader followed and that they have not read, one row per story.
// `fresh` = something was released since the reader last opened the notifications page (that is what the bell counts).
async function newChapterStories(userId: number) {
  return db.select({
    storyId: stories.id, storyTitle: stories.title, count: sql<number>`count(*)::int`, firstNo: sql<number>`min(${chapters.no})::int`,
    at: sql<string>`max(${chapters.releasedAt})`, fresh: sql<boolean>`bool_or(${chapters.releasedAt} > coalesce(${users.notificationsSeenAt}, 'epoch'::timestamp))`,
  }).from(bookmarks).innerJoin(users, eq(users.id, bookmarks.userId)).innerJoin(stories, and(eq(stories.id, bookmarks.storyId), eq(stories.published, true)))
    .innerJoin(chapters, eq(chapters.storyId, stories.id))
    .where(and(eq(bookmarks.userId, userId), visible, sql`${chapters.releasedAt} > ${bookmarks.createdAt}`,
      sql`not exists (select 1 from chapter_reads cr where cr.user_id = ${userId} and cr.story_id = chapters.story_id and cr.no = chapters.no)`))
    .groupBy(stories.id, stories.title, users.notificationsSeenAt)
}

/** What the settings page may know about a user's AI access: whether they have a usable key, and its last 4 characters. Admins can also use `local:` models without one. */
async function aiKeyState(me: { id: number; role: string }) {
  const usable = !!(await ownKey(me.id))
  const [row] = usable ? await db.select({ last4: userAiKeys.last4, updatedAt: userAiKeys.updatedAt }).from(userAiKeys).where(eq(userAiKeys.userId, me.id)) : []
  return { hasKey: usable, last4: row?.last4 ?? null, updatedAt: row?.updatedAt ?? null, admin: me.role === 'admin', canUseAi: usable }
}

// Signed-in readers: where they stopped in each story, and which chapters they have finished
const meRoutes = new Elysia({ prefix: '/me' })
  .use(auth)
  .guard(userOnly, app => app
    .patch('/profile', async ({ body, me, status, jwt, cookie: { token } }) => {
      const { currentPassword, newPassword, ...fields } = body
      const set: Partial<typeof users.$inferInsert> = { ...fields, ...(fields.name !== undefined && { name: fields.name.trim() }) }
      if (set.name === '') return status(422, { error: 'ต้องมีชื่อ' })
      if (newPassword) {
        if (limited(`password:${me!.id}`, 5, WINDOW)) return status(429, { error: 'ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่' })
        const [u] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, me!.id))
        if (!currentPassword || !(await Bun.password.verify(currentPassword, u.hash))) return status(403, { error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' })
        set.passwordHash = await Bun.password.hash(newPassword)
        set.passwordChangedAt = new Date()
      }
      if (!Object.keys(set).length) return status(422, { error: 'ไม่มีอะไรให้แก้ไข' })
      const [saved] = await db.update(users).set(set).where(eq(users.id, me!.id)).returning(publicUser)
      // the change signs every device out, this one included, so hand this one a fresh session
      if (newPassword) token.set({ value: await jwt.sign({ sub: String(saved.id), role: saved.role }), ...cookieOpts })
      return saved
    }, { body: t.Object({ name: t.Optional(t.String({ maxLength: 60 })), bio: t.Optional(t.String({ maxLength: 500 })), currentPassword: t.Optional(t.String()), newPassword: t.Optional(t.String({ minLength: 8 })) }) })
    // changing the address: a code goes to the NEW one; nothing changes until it is entered
    .post('/email', async ({ body, me, status }) => {
      if (limited(`email:${me!.id}`, 5, WINDOW)) return status(429, { error: 'ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่' })
      const [u] = await db.select({ id: users.id, name: users.name, email: users.email, hash: users.passwordHash }).from(users).where(eq(users.id, me!.id))
      if (!(await Bun.password.verify(body.password, u.hash))) return status(403, { error: 'รหัสผ่านไม่ถูกต้อง' })
      if (body.email === u.email) return status(422, { error: 'นี่คืออีเมลปัจจุบันของคุณ' })
      if (await db.query.users.findFirst({ where: eq(users.email, body.email), columns: { id: true } })) return status(409, { error: 'อีเมลนี้ถูกใช้แล้ว' })
      try { if (await sendCode(u, 'change', body.email) === 'wait') return status(429, { error: 'เพิ่งส่งรหัสไปแล้ว รอ 1 นาทีก่อนขอใหม่' }) }
      catch (e) { console.error('change mail failed', e); return status(503, { error: 'ส่งอีเมลไม่สำเร็จ ลองใหม่ภายหลัง' }) }
      return { ok: true }
    }, { body: t.Object({ email: t.String({ format: 'email' }), password: t.String() }) })
    .post('/email/confirm', async ({ body, me, status }) => {
      if (limited(`email-confirm:${me!.id}`, 10, WINDOW)) return status(429, { error: 'ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่' })
      if (!(await checkCode(me!.id, 'change', body.email, body.code))) return status(400, { error: 'รหัสไม่ถูกต้องหรือหมดอายุ' })
      try { return (await db.update(users).set({ email: body.email, emailVerifiedAt: sql`now()` }).where(eq(users.id, me!.id)).returning(publicUser))[0] }
      catch { return status(409, { error: 'อีเมลนี้ถูกใช้แล้ว' }) } // someone else confirmed it first
    }, { body: t.Object({ email: t.String({ format: 'email' }), code: t.String({ minLength: 6, maxLength: 6 }) }) })
    .get('/progress', ({ me }) => db.select({ storyId: readingProgress.storyId, no: readingProgress.no, pos: readingProgress.pos, updatedAt: readingProgress.updatedAt })
      .from(readingProgress).where(eq(readingProgress.userId, me!.id)).orderBy(desc(readingProgress.updatedAt)))
    .put('/progress/:id', async ({ params, body, me, status }) => {
      if (!(await isLive(params.id, body.no))) return status(404, { error: 'ไม่พบข้อมูล' })
      const pos = body.pos ?? null
      await db.insert(readingProgress).values({ userId: me!.id, storyId: params.id, no: body.no, pos })
        .onConflictDoUpdate({ target: [readingProgress.userId, readingProgress.storyId], set: { no: body.no, pos, updatedAt: sql`now()` } })
      return { ok: true }
    }, { ...id, body: t.Object({ no: t.Integer({ minimum: 1 }), pos: t.Optional(t.Number({ minimum: 0, maximum: 1 })) }) })
    .get('/bookmarks', async ({ me }) => (await db.select({ id: bookmarks.storyId }).from(bookmarks).where(eq(bookmarks.userId, me!.id)).orderBy(desc(bookmarks.createdAt))).map(r => r.id))
    // the "following" page: each followed story with this reader's progress (chapters read among the ones they can see, where they stopped)
    .get('/following', ({ me }) => db.select({
      ...listFields,
      followedAt: bookmarks.createdAt,
      lastNo: sql<number | null>`(select rp.no from reading_progress rp where rp.user_id = ${me!.id} and rp.story_id = stories.id)`,
      readCount: sql<number>`(select count(*)::int from chapter_reads cr join chapters on chapters.story_id = cr.story_id and chapters.no = cr.no where cr.user_id = ${me!.id} and cr.story_id = stories.id and ${visibleSql})`,
    }).from(bookmarks).innerJoin(stories, eq(stories.id, bookmarks.storyId)).innerJoin(users, eq(users.id, stories.authorId))
      .where(and(eq(bookmarks.userId, me!.id), eq(stories.published, true))).orderBy(desc(bookmarks.createdAt)))
    // The bell: replies and upvotes on the reader's comments (stored rows), plus followed stories that have chapters the reader has not read yet.
    // Those chapter items are worked out on the fly, not stored, so a scheduled (drip) chapter shows up exactly when it goes live and
    // disappears once it is read. Opening the page marks the rest read (POST /notifications/read).
    .get('/notifications', async ({ me }) => {
      const stored = (await db.select({
        id: notifications.id, type: notifications.type, readAt: notifications.readAt, createdAt: notifications.createdAt, actor: users.name,
        body: comments.body, storyId: comments.storyId, storyTitle: stories.title, no: chapters.no, score: scoreSql,
      }).from(notifications).innerJoin(comments, eq(comments.id, notifications.commentId)).innerJoin(stories, eq(stories.id, comments.storyId)).innerJoin(chapters, eq(chapters.id, comments.chapterId))
        .leftJoin(users, eq(users.id, notifications.actorId)).where(eq(notifications.userId, me!.id)).orderBy(desc(notifications.createdAt)).limit(50))
        .map(({ id, readAt, body, ...n }) => ({ ...n, key: `n${id}`, count: 1, unread: readAt === null, snippet: body.replace(/\s+/g, ' ').slice(0, 140) }))
      const chaptersDue = (await newChapterStories(me!.id))
        .map(c => ({ key: `c${c.storyId}`, type: 'chapter' as 'reply' | 'vote' | 'chapter', createdAt: new Date(c.at.replace(' ', 'T') + 'Z'), actor: null as string | null, storyId: c.storyId, storyTitle: c.storyTitle, no: c.firstNo, score: 0, count: c.count, unread: c.fresh, snippet: '' }))
      return [...stored.map(n => ({ ...n, type: n.type as 'reply' | 'vote' | 'chapter' })), ...chaptersDue].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 50)
    })
    // The user's own OpenRouter key. It is only ever stored encrypted (bound to their user id) and never sent back: the page learns "set" and the last 4 characters.
    .get('/ai-key', async ({ me }) => aiKeyState(me!))
    .put('/ai-key', async ({ body, me, status }) => {
      if (me!.role === 'user') return status(403, { error: 'ตั้งคีย์ AI ได้เฉพาะนักเขียนและผู้ดูแลระบบ' })
      if (limited(`aikey:${me!.id}`, 10, WINDOW)) return status(429, { error: 'ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่' })
      const key = body.key.trim()
      if (!/^\S{20,200}$/.test(key)) return status(422, { error: 'รูปแบบคีย์ไม่ถูกต้อง' })
      // ask OpenRouter whether the key works before keeping it
      let r: Response
      try { r = await fetch(`${API_BASE}/auth/key`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) }) }
      catch { return status(502, { error: 'ตรวจคีย์กับ OpenRouter ไม่ได้ในตอนนี้ ลองใหม่อีกครั้ง' }) }
      if (r.status === 401 || r.status === 403) return status(422, { error: 'OpenRouter ไม่รับคีย์นี้ ตรวจว่าคัดลอกครบและยังไม่ถูกลบ' })
      if (!r.ok) return status(502, { error: `OpenRouter ตอบกลับ ${r.status} ลองใหม่อีกครั้ง` })
      const values = { ciphertext: encryptSecret(key, String(me!.id)), last4: key.slice(-4), updatedAt: new Date() }
      await db.insert(userAiKeys).values({ userId: me!.id, ...values }).onConflictDoUpdate({ target: userAiKeys.userId, set: values })
      return aiKeyState(me!)
    }, { body: t.Object({ key: t.String({ maxLength: 300 }) }) })
    .delete('/ai-key', async ({ me }) => { await db.delete(userAiKeys).where(eq(userAiKeys.userId, me!.id)); return aiKeyState(me!) })
    .get('/notifications/count', async ({ me }) => {
      // polled every minute by the bell; a user follows few stories, so the chapter query stays small
      const stored = await db.$count(notifications, and(eq(notifications.userId, me!.id), isNull(notifications.readAt)))
      return { unread: stored + (await newChapterStories(me!.id)).filter(c => c.fresh).length }
    })
    .post('/notifications/read', async ({ me }) => {
      await db.update(notifications).set({ readAt: sql`now()` }).where(and(eq(notifications.userId, me!.id), isNull(notifications.readAt)))
      await db.update(users).set({ notificationsSeenAt: sql`now()` }).where(eq(users.id, me!.id))
      return { ok: true }
    })
    .put('/bookmarks/:id', async ({ params, me, status }) => {
      if (!(await db.query.stories.findFirst({ where: and(eq(stories.id, params.id), eq(stories.published, true)), columns: { id: true } }))) return status(404, { error: 'ไม่พบข้อมูล' })
      await db.insert(bookmarks).values({ userId: me!.id, storyId: params.id }).onConflictDoNothing()
      return { ok: true }
    }, id)
    .delete('/bookmarks/:id', async ({ params, me }) => { await db.delete(bookmarks).where(and(eq(bookmarks.userId, me!.id), eq(bookmarks.storyId, params.id))); return { ok: true } }, id)
    .get('/reads/:id', async ({ params, me }) => (await db.select({ no: chapterReads.no }).from(chapterReads)
      .where(and(eq(chapterReads.userId, me!.id), eq(chapterReads.storyId, params.id))).orderBy(asc(chapterReads.no))).map(r => r.no), id)
    .post('/reads/:id', async ({ params, body, me, status }) => {
      if (!(await isLive(params.id, body.no))) return status(404, { error: 'ไม่พบข้อมูล' })
      await db.insert(chapterReads).values({ userId: me!.id, storyId: params.id, no: body.no }).onConflictDoNothing()
      return { ok: true }
    }, { ...id, body: t.Object({ no: t.Integer({ minimum: 1 }) }) }))

const adminRoutes = new Elysia({ prefix: '/admin' })
  .use(auth)
  .guard(adminOnly, app => app
    // searchable by name or email, filterable by role, newest first; `counts` ignores the filter so the role chips always show the totals
    .get('/users', async ({ query }) => {
      const q = query.q?.trim()
      const like = q && `%${q.replace(/[\\%_]/g, '\\$&')}%`
      const where = and(like ? or(ilike(users.name, like), ilike(users.email, like)) : undefined, query.role ? eq(users.role, query.role) : undefined)
      const total = await db.$count(users, where)
      const { page, size, offset } = paging(query, total, 'first', 20)
      const items = await db.select({ ...publicUser, storyCount: sql<number>`(select count(*)::int from stories where stories.author_id = users.id)` })
        .from(users).where(where).orderBy(desc(users.id)).limit(size).offset(offset)
      const byRole = await db.select({ role: users.role, n: sql<number>`count(*)::int` }).from(users).groupBy(users.role)
      const n = (r: string) => byRole.find(x => x.role === r)?.n ?? 0
      return { items, total, page, size, counts: { all: n('admin') + n('writer') + n('user'), admin: n('admin'), writer: n('writer'), user: n('user') } }
    }, { query: t.Object({ ...pageQuery.properties, q: t.Optional(t.String()), role: t.Optional(t.Union([t.Literal('admin'), t.Literal('writer'), t.Literal('user')])) }) })
    // the role (user / writer / admin) is only ever changed here, and each change is written to audit_log
    .patch('/users/:id', async ({ params, body, me, status }) => {
      if (params.id === me!.id) return status(400, { error: 'เปลี่ยน role ของตัวเองไม่ได้' }) // avoid locking out the last admin
      return db.transaction(async tx => {
        const [before] = await tx.select({ role: users.role }).from(users).where(eq(users.id, params.id))
        if (!before) return status(404, { error: 'ไม่พบข้อมูล' })
        const [u] = await tx.update(users).set(body).where(eq(users.id, params.id)).returning(publicUser)
        if (body.role === 'user') await tx.delete(userAiKeys).where(eq(userAiKeys.userId, params.id)) // a reader has no use for a stored key
        if (before.role !== u.role) await tx.insert(auditLog).values({ actorId: me!.id, action: 'role', targetId: u.id, detail: `${before.role} → ${u.role}` })
        return u
      })
    }, { ...id, body: t.Object({ role: t.Union([t.Literal('admin'), t.Literal('writer'), t.Literal('user')]) }) })
    .get('/audit', () => {
      const actor = alias(users, 'actor'), target = alias(users, 'target')
      return db.select({ id: auditLog.id, action: auditLog.action, detail: auditLog.detail, createdAt: auditLog.createdAt, actor: actor.name, target: target.name })
        .from(auditLog).leftJoin(actor, eq(actor.id, auditLog.actorId)).leftJoin(target, eq(target.id, auditLog.targetId)).orderBy(desc(auditLog.id)).limit(50)
    })
    // open reports, one entry per reported comment (several readers may flag the same one), most recently reported first
    .get('/reports', async () => {
      const reporter = alias(users, 'reporter'), author = alias(users, 'author')
      const rows = await db.select({
        commentId: commentReports.commentId, reason: commentReports.reason, reportedAt: commentReports.createdAt, reporter: reporter.name,
        body: comments.body, authorId: comments.userId, author: author.name, storyId: comments.storyId, storyTitle: stories.title, no: chapters.no,
      }).from(commentReports).innerJoin(comments, eq(comments.id, commentReports.commentId)).innerJoin(stories, eq(stories.id, comments.storyId)).innerJoin(chapters, eq(chapters.id, comments.chapterId))
        .innerJoin(reporter, eq(reporter.id, commentReports.reporterId)).innerJoin(author, eq(author.id, comments.userId))
        .where(isNull(commentReports.resolvedAt)).orderBy(desc(commentReports.createdAt))
      const byComment = new Map<number, { commentId: number; body: string; authorId: number; author: string; storyId: number; storyTitle: string; no: number; reports: { reporter: string; reason: string; reportedAt: Date }[] }>()
      for (const { commentId, reason, reportedAt, reporter, ...c } of rows) {
        const e = byComment.get(commentId) ?? { commentId, ...c, reports: [] }
        e.reports.push({ reporter, reason, reportedAt }); byComment.set(commentId, e)
      }
      return [...byComment.values()]
    })
    // "no problem here": closes every open report of that comment (deleting the comment closes them too, by cascade)
    .post('/reports/:id/dismiss', async ({ params }) => { await db.update(commentReports).set({ resolvedAt: sql`now()` }).where(and(eq(commentReports.commentId, params.id), isNull(commentReports.resolvedAt))); return { ok: true } }, id)
  )

  // admins and writers; a writer only reaches their own stories (see ownStory in auth.ts)
  .guard(staffOnly, app => app
    // list rows only: the heavy text columns (premise, system prompt) are loaded by GET /stories/:id
    .get('/stories', async ({ query, me }) => {
      const q = query.q?.trim()
      const where = and(
        q ? ilike(stories.title, `%${q.replace(/[\\%_]/g, '\\$&')}%`) : undefined, // % and _ typed by the admin are literal
        me!.role === 'writer' ? eq(stories.authorId, me!.id) : undefined,
      )
      const total = await db.$count(stories, where)
      const { page, size, offset } = paging(query, total, 'first', 20)
      const items = await db.select({
        id: stories.id, title: stories.title, genre: stories.genre, coverImage: stories.coverImage, published: stories.published, status: stories.status,
        spent: sql<number>`coalesce((select sum(chapters.cost) from chapters where chapters.story_id = stories.id), 0)::float8`,
        chapterCount: sql<number>`(select count(*)::int from chapters where chapters.story_id = stories.id)`,
        draftCount: sql<number>`(select count(*)::int from chapters where chapters.story_id = stories.id and not chapters.published)`,
      }).from(stories).where(where).orderBy(desc(stories.id)).limit(size).offset(offset)
      return { items, total, page, size }
    }, { query: t.Object({ ...pageQuery.properties, q: t.Optional(t.String()) }) })
    .post('/stories', async ({ body, me }) => (await db.insert(stories).values({ ...body, authorId: me!.id }).returning())[0], { body: storyBody })
    .get('/stories/:id', async ({ params, status }) => {
      const s = await db.query.stories.findFirst({ where: eq(stories.id, params.id) })
      if (!s) return status(404, { error: 'ไม่พบข้อมูล' })
      const [{ last, spent, views, finishes }] = await db.select({ last: max(chapters.no), spent: sql<number>`coalesce(sum(${chapters.cost}), 0)::float8`, views: sql<number>`coalesce(sum(${chapters.views}), 0)::int`, finishes: sql<number>`coalesce(sum(${chapters.finishes}), 0)::int` }).from(chapters).where(eq(chapters.storyId, s.id))
      const noSummary = await db.select({ id: chapters.id }).from(chapters).where(and(eq(chapters.storyId, s.id), eq(chapters.summary, ''))).orderBy(asc(chapters.no))
      return { ...s, nextNo: (last ?? 0) + 1, spent, views, finishes, nextBeat: nextBeat(s.outline) ?? null, missingSummaryIds: noSummary.map(c => c.id) }
    }, id)
    // chapter rows without the text, newest page first when `page` is omitted; GET /chapters/:id loads one in full
    .get('/stories/:id/chapters', async ({ params, query }) => {
      const total = await db.$count(chapters, eq(chapters.storyId, params.id))
      const { page, size, offset } = paging(query, total, 'last')
      const items = await db.select({ id: chapters.id, no: chapters.no, title: chapters.title, published: chapters.published, publishAt: chapters.publishAt, createdAt: chapters.createdAt, hasSummary: sql<boolean>`${chapters.summary} <> ''`, tokens: chapters.tokens, cost: chapters.cost, views: chapters.views, finishes: chapters.finishes })
        .from(chapters).where(eq(chapters.storyId, params.id)).orderBy(asc(chapters.no)).limit(size).offset(offset)
      return { items, total, page, size }
    }, { ...id, query: pageQuery })
    .patch('/stories/:id', async ({ params, body }) => (await db.update(stories).set(body).where(eq(stories.id, params.id)).returning())[0], { ...id, body: t.Partial(storyBody) })
    .delete('/stories/:id', async ({ params }) => {
      const story = await db.query.stories.findFirst({ where: eq(stories.id, params.id) })
      const cast = await db.select({ image: characters.image }).from(characters).where(eq(characters.storyId, params.id))
      const texts = await db.select({ content: chapters.content }).from(chapters).where(eq(chapters.storyId, params.id))
      await db.delete(stories).where(eq(stories.id, params.id))
      await Promise.all([story?.coverImage, ...cast.map(c => c.image)].filter((n): n is string => !!n).map(removeUpload))
      await pruneUnused(texts.flatMap(t => imageNames(t.content)))
      return { ok: true }
    }, id)
    .post('/stories/:id/cover', async ({ params, body, status }) => {
      const story = await db.query.stories.findFirst({ where: eq(stories.id, params.id) })
      if (!story) return status(404, { error: 'ไม่พบข้อมูล' })
      let name: string
      try { name = await saveImage(body.file) } catch (e) { return status(422, { error: (e as Error).message }) }
      await db.update(stories).set({ coverImage: name }).where(eq(stories.id, story.id))
      await removeUpload(story.coverImage)
      return { coverImage: name }
    }, { ...id, body: imageBody })
    .delete('/stories/:id/cover', async ({ params }) => {
      const story = await db.query.stories.findFirst({ where: eq(stories.id, params.id) })
      await db.update(stories).set({ coverImage: '' }).where(eq(stories.id, params.id))
      if (story) await removeUpload(story.coverImage)
      return { coverImage: '' }
    }, id)

    .get('/stories/:id/characters', ({ params }) => db.select().from(characters).where(eq(characters.storyId, params.id)).orderBy(asc(characters.id)), id)
    .post('/stories/:id/characters', async ({ params, body, status }) => {
      if (!(await db.query.stories.findFirst({ where: eq(stories.id, params.id) }))) return status(404, { error: 'ไม่พบข้อมูล' })
      return (await db.insert(characters).values({ ...body, storyId: params.id }).returning())[0]
    }, { ...id, body: characterBody })
    // proposes characters found in the story; nothing is saved until the admin adds them
    .post('/stories/:id/characters/suggest', async ({ params, me, status }) => {
      const story = await db.query.stories.findFirst({ where: eq(stories.id, params.id) })
      if (!story) return status(404, { error: 'ไม่พบข้อมูล' })
      const gate = await aiGate(me!)
      if ('stop' in gate) return status(402, { error: gate.stop })
      try { return { suggestions: await suggestCharacters(story, gate.ctx) } }
      catch (e) { return status(502, { error: (e as Error).message }) }
    }, id)
    .patch('/characters/:id', async ({ params, body }) => (await db.update(characters).set(body).where(eq(characters.id, params.id)).returning())[0], { ...id, body: t.Partial(characterBody) })
    .delete('/characters/:id', async ({ params }) => {
      const [c] = await db.delete(characters).where(eq(characters.id, params.id)).returning({ image: characters.image })
      if (c) await removeUpload(c.image)
      return { ok: true }
    }, id)
    .post('/characters/:id/image', async ({ params, body, status }) => {
      const c = await db.query.characters.findFirst({ where: eq(characters.id, params.id) })
      if (!c) return status(404, { error: 'ไม่พบข้อมูล' })
      let name: string
      try { name = await saveImage(body.file) } catch (e) { return status(422, { error: (e as Error).message }) }
      await db.update(characters).set({ image: name }).where(eq(characters.id, c.id))
      await removeUpload(c.image)
      return { image: name }
    }, { ...id, body: imageBody })
    .delete('/characters/:id/image', async ({ params }) => {
      const c = await db.query.characters.findFirst({ where: eq(characters.id, params.id) })
      await db.update(characters).set({ image: '' }).where(eq(characters.id, params.id))
      if (c) await removeUpload(c.image)
      return { image: '' }
    }, id)

    .get('/chapters/:id', async ({ params, status }) => (await db.query.chapters.findFirst({ where: eq(chapters.id, params.id) })) ?? status(404, { error: 'ไม่พบข้อมูล' }), id)
    .patch('/chapters/:id', async ({ params, body, status }) => {
      // publishAt: ISO time = go live then, null = no schedule; publishing without one means "now"
      const { publishAt, ...rest } = body
      const at = publishAt ? new Date(publishAt) : null
      if (at && isNaN(at.getTime())) return status(422, { error: 'เวลาเผยแพร่ไม่ถูกต้อง' })
      const before = await db.query.chapters.findFirst({ where: eq(chapters.id, params.id) })
      // the text about to be overwritten is kept as a version, so this is never a one-way trip
      if (before && ((body.content !== undefined && body.content !== before.content) || (body.title !== undefined && body.title !== before.title))) await snapshot(before)
      const schedule = publishAt !== undefined ? { publishAt: at } : body.published ? { publishAt: null } : {}
      // releasedAt follows publish state and schedule (see release.ts); text-only edits leave it alone
      const touchesRelease = body.published !== undefined || publishAt !== undefined
      const releasedAt = before && touchesRelease ? releasedAtFor(before, { published: body.published ?? before.published, publishAt: 'publishAt' in schedule ? schedule.publishAt ?? null : before.publishAt }) : undefined
      const [row] = await db.update(chapters).set({ ...rest, ...schedule, ...(releasedAt !== undefined && { releasedAt }) }).where(eq(chapters.id, params.id)).returning()
      if (before && row && body.content !== undefined) { const keep = new Set(imageNames(row.content)); await pruneUnused(imageNames(before.content).filter(n => !keep.has(n))) }
      return row ?? status(404, { error: 'ไม่พบข้อมูล' })
    }, { ...id, body: t.Partial(t.Object({ title: t.String(), content: t.String(), summary: t.String(), published: t.Boolean(), publishAt: t.Union([t.String(), t.Null()]) })) })
    .get('/chapters/:id/versions', ({ params }) => db.select({ id: chapterVersions.id, title: chapterVersions.title, createdAt: chapterVersions.createdAt, length: sql<number>`char_length(${chapterVersions.content})`, excerpt: sql<string>`left(${chapterVersions.content}, 160)` })
      .from(chapterVersions).where(eq(chapterVersions.chapterId, params.id)).orderBy(desc(chapterVersions.id)), id)
    .post('/chapters/:id/restore/:version', async ({ params, status }) => (await restore(params.id, params.version)) ?? status(404, { error: 'ไม่พบข้อมูล' }), { params: t.Object({ id: t.Numeric(), version: t.Numeric() }) })
    // publish / hide several chapters of one story at once
    .patch('/stories/:id/chapters', async ({ params, body }) => {
      // releasedAt: hidden = none; live = now, unless it already was live right away (then it keeps its time). Right-hand `chapters.*` are the values before this update.
      const released = body.published
        ? sql`case when ${chapters.published} and ${chapters.publishAt} is null and ${chapters.releasedAt} is not null then ${chapters.releasedAt} else now() end`
        : null
      const rows = await db.update(chapters).set({ published: body.published, releasedAt: released, ...(body.published && { publishAt: null }) })
        .where(and(eq(chapters.storyId, params.id), inArray(chapters.id, body.ids))).returning({ id: chapters.id })
      return { updated: rows.length }
    }, { ...id, body: t.Object({ ids: t.Array(t.Integer(), { minItems: 1 }), published: t.Boolean() }) })
    // Streams a fresh version of an existing chapter written by `model`. Nothing is saved: the admin previews it and applies it in the editor.
    .post('/chapters/:id/rewrite', async function* ({ params, body, set, me }) {
      const c = await db.query.chapters.findFirst({ where: eq(chapters.id, params.id) })
      const story = c && await db.query.stories.findFirst({ where: eq(stories.id, c.storyId) })
      if (!c || !story) { set.status = 404; yield 'ไม่พบตอนนี้'; return }
      const gate = await aiGate(me!)
      if ('stop' in gate) { set.status = 402; yield gate.stop; return }
      const ai = gate.ctx

      const note = body.instruction?.trim()
      const ask = [
        `เขียนตอนที่ ${c.no} ใหม่ทั้งตอน คงเหตุการณ์ ตัวละคร และลำดับเรื่องตามฉบับเดิม แต่เรียบเรียงด้วยสำนวนของคุณ`,
        c.instruction && `คำสั่งเดิมของตอนนี้: ${c.instruction}`,
        note && `คำแนะนำเพิ่มเติม: ${note}`,
        `ฉบับเดิม:\n${stripImages(c.content).slice(0, 30_000)}`,
      ].filter(Boolean).join('\n\n')
      const ctx = await buildContext(story, ask, c.no)

      let acc = ''
      try {
        const model = body.model?.trim() || ctx.model
        for await (const d of streamChat(model, ctx.messages, u => ai.record('rewrite', model, u), ai.access)) {
          acc += d; yield d
          if (loopStart(acc) !== -1) { yield '\n\n⚠️ โมเดลเริ่มตอบวนซ้ำ จึงหยุดให้'; break }
        }
      } catch (e) {
        // before any text: a real HTTP error the client can show; after: a marker inside the preview
        if (!acc) set.status = 502
        yield `${acc ? '\n\n⚠️ ' : ''}${(e as Error).message}`
      }
    }, { ...id, body: t.Object({ model: t.Optional(t.String()), instruction: t.Optional(t.String()) }) })
    .post('/chapters/:id/summarize', async ({ params, me, status }) => {
      const gate = await aiGate(me!)
      if ('stop' in gate) return status(402, { error: gate.stop })
      try { return { summary: await summarizeChapter(params.id, undefined, gate.ctx) } }
      catch (e) { return status(502, { error: (e as Error).message }) }
    }, id)
    // continuity report for one chapter; on demand because each run costs a model call
    .post('/chapters/:id/check', async ({ params, me, status }) => {
      const gate = await aiGate(me!)
      if ('stop' in gate) return status(402, { error: gate.stop })
      try { return { report: await checkChapter(params.id, gate.ctx) } }
      catch (e) { return status(502, { error: (e as Error).message }) }
    }, id)
    .delete('/chapters/:id', async ({ params }) => {
      const c = await db.transaction(async tx => {
        const [c] = await tx.delete(chapters).where(eq(chapters.id, params.id)).returning({ content: chapters.content, storyId: chapters.storyId, no: chapters.no })
        if (!c) return
        // close the gap so the next chapter takes the deleted number. Two steps (negate, then shift) because the unique
        // (story_id, no) index is checked row by row and would trip on a one-step `no - 1`.
        const shift = async (t: typeof chapters | typeof chapterReads, storyId: ReturnType<typeof eq>) => {
          await tx.update(t).set({ no: sql`-${t.no}` }).where(and(storyId, sql`${t.no} > ${c.no}`))
          await tx.update(t).set({ no: sql`-${t.no} - 1` }).where(and(storyId, sql`${t.no} < 0`))
        }
        await shift(chapters, eq(chapters.storyId, c.storyId))
        await tx.delete(chapterReads).where(and(eq(chapterReads.storyId, c.storyId), eq(chapterReads.no, c.no)))
        await shift(chapterReads, eq(chapterReads.storyId, c.storyId))
        // readers who stopped in a later chapter keep their place; those who stopped in the deleted one restart the chapter now numbered the same
        await tx.update(readingProgress).set({ no: sql`${readingProgress.no} - 1` }).where(and(eq(readingProgress.storyId, c.storyId), sql`${readingProgress.no} > ${c.no}`))
        await tx.update(readingProgress).set({ pos: null }).where(and(eq(readingProgress.storyId, c.storyId), eq(readingProgress.no, c.no)))
        return c
      })
      if (c) await pruneUnused(imageNames(c.content))
      return { ok: true }
    }, id)
    // images inserted in the chapter editor; they stay unreferenced (and get swept) until the chapter is saved with them
    .post('/images', async ({ body, status }) => {
      try { const name = await saveImage(body.file); return { name, url: `/api/uploads/${name}` } }
      catch (e) { return status(422, { error: (e as Error).message }) }
    }, { body: imageBody })

    // Streams the new chapter as plain text, saves it as an unpublished draft when finished.
    .post('/stories/:id/generate', async function* ({ params, body, set, me }) {
      const story = await db.query.stories.findFirst({ where: eq(stories.id, params.id) })
      if (!story) { set.status = 404; yield 'ไม่พบเรื่องนี้'; return }

      const gate = await aiGate(me!)
      if ('stop' in gate) { set.status = 402; yield gate.stop; return }
      const ai = gate.ctx

      // fromOutline: the next unwritten line of the story's outline is this chapter's instruction (ticked off once the chapter is complete)
      const beat = body.fromOutline ? nextBeat(story.outline) : undefined
      const note = body.instruction?.trim()
      if (body.fromOutline && !beat) { set.status = 409; yield 'แผนเรื่องไม่มีตอนที่ยังไม่ได้เขียนแล้ว'; return }
      const instruction = beat ? `${beat}${note ? `\n(คำแนะนำเพิ่มเติม: ${note})` : ''}` : body.instruction
      const { messages, model } = await buildContext(story, instruction)

      // Save in `finally`: it also runs when the client drops mid-stream (refresh, stop button),
      // so what was already generated (and paid for) is kept as a draft instead of being lost.
      let acc = '', complete = false, looped = false, usage = undefined as Usage | undefined
      try {
        for await (const d of streamChat(model, messages, u => { usage = u; ai.record('generate', model, u) }, ai.access)) {
          acc += d; yield d
          const at = loopStart(acc)
          if (at !== -1) {
            looped = true
            acc = acc.slice(0, at) // keep the usable part, drop the repeated tail
            yield '\n\n⚠️ โมเดลเริ่มตอบวนซ้ำ จึงหยุดให้ และเก็บเฉพาะส่วนที่ใช้ได้เป็นฉบับร่าง'
            break
          }
        }
        complete = !looped
      } catch (e) {
        yield `\n\n⚠️ ${(e as Error).message}`
      } finally {
        const content = acc.trim()
        if (content) {
          const title = content.split('\n')[0].replace(/^#+\s*/, '').slice(0, 110) + (complete ? '' : ' (ไม่ครบ)')
          try {
            const row = await addChapter(story.id, { title, content, instruction: instruction ?? '', model, tokens: usage?.tokens, cost: usage?.cost })
            if (beat && complete) {
              const cur = await db.query.stories.findFirst({ where: eq(stories.id, story.id), columns: { outline: true } }) // re-read: it may have been edited while writing
              if (cur) await db.update(stories).set({ outline: markDone(cur.outline, beat) }).where(eq(stories.id, story.id))
            }
            // recap runs in the background so the stream can close; skipped for cut-off chapters
            if (complete) summarizeChapter(row.id, model, ai).catch(e => console.error('summary failed', e))
          } catch (e) { console.error('failed to save generated chapter', e) }
        }
      }
    }, { ...id, body: t.Object({ instruction: t.Optional(t.String()), fromOutline: t.Optional(t.Boolean()) }) }))

export const app = new Elysia({ prefix: '/api' })
  // dev: any origin (Vite proxy). prod: same-origin only unless CORS_ORIGIN lists the web origin(s), comma separated
  .use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : prod ? [] : true, credentials: true }))
  .get('/health', () => 'ok')
  .use(authRoutes)
  .use(readerRoutes)
  .use(commentRoutes)
  .use(siteRoutes)
  .use(meRoutes)
  .use(adminRoutes)

export type App = typeof app

if (import.meta.main) {
  // a client dropping mid-stream rejects the aborted upstream read; that is expected, not fatal
  process.on('unhandledRejection', e => { if ((e as Error)?.name !== 'AbortError') throw e })
  assertConfig()
  await seedAdmin()
  const sweep = () => sweepOrphans().catch(e => console.error('upload sweep failed', e))
  sweep(); setInterval(sweep, 6 * 60 * 60 * 1000).unref()
  // idleTimeout is Bun's per-connection silence limit (max 255 s). Non-streaming AI calls (summary, suggest, check) stay silent until the model answers,
  // and a slow local model easily takes longer than the default, which drops the connection (the browser then sees a 500 from the Vite proxy).
  app.listen({ port: Number(process.env.PORT) || 3000, idleTimeout: 255 })
  console.log(`🦊 http://localhost:${process.env.PORT || 3000}`)
}
