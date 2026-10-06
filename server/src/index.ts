import { cors } from '@elysiajs/cors'
import { and, asc, desc, eq, inArray, max, sql } from 'drizzle-orm'
import { join } from 'node:path'
import { Elysia, t } from 'elysia'
import { budget, monthSpent, overBudget } from './budget'
import { adminOnly, assertConfig, auth, prod, seedAdmin, userOnly } from './auth'
import { addChapter, checkChapter, summarizeChapter } from './chapters'
import { suggestCharacters } from './characters'
import { buildContext, excerptSql } from './context'
import { buildEpub } from './epub'
import { atomFeed } from './feed'
import { loopStart } from './guard'
import { imageNames, stripImages } from './markdown'
import { markDone, nextBeat } from './outline'
import { pageQuery, paging } from './paging'
import { forgive, limited } from './ratelimit'
import { pruneUnused, sweepOrphans } from './media'
import { MIME_BY_EXT, NAME_RE, removeUpload, saveImage, UPLOAD_DIR } from './uploads'
import { db } from './db'
import { streamChat, type Usage } from './openrouter'
import { chapterReads, chapters, chapterVersions, characters, readingProgress, stories, users } from './schema'
import { restore, snapshot } from './versions'
import { liveAt, visible, visibleSql } from './visibility'

const id = { params: t.Object({ id: t.Numeric() }) }
const characterBody = t.Object({ name: t.String({ minLength: 1 }), role: t.Optional(t.String()), profile: t.Optional(t.String()), visible: t.Optional(t.Boolean()) })
// type/size are checked by saveImage (magic bytes), so the error message can be shown to the admin as-is
const imageBody = t.Object({ file: t.File() })
const cookieOpts = { httpOnly: true, secure: prod, sameSite: 'lax' as const, path: '/', maxAge: 30 * 86400 }
const WINDOW = 15 * 60_000
const publicUser = { id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt }

const storyBody = t.Object({
  title: t.String({ minLength: 1 }),
  synopsis: t.Optional(t.String()),
  genre: t.Optional(t.String()),
  mood: t.Optional(t.String()),
  premise: t.Optional(t.String()),
  systemPrompt: t.Optional(t.String()),
  outline: t.Optional(t.String()),
  model: t.Optional(t.String()),
  published: t.Optional(t.Boolean()),
})

const authRoutes = new Elysia({ prefix: '/auth' })
  .use(auth)
  .post('/register', async ({ body, jwt, cookie: { token }, status, request, server }) => {
    if (process.env.ALLOW_REGISTRATION === 'false') return status(403, { error: 'ปิดรับสมัครสมาชิก' })
    if (limited(`register:${server?.requestIP(request)?.address}`, 5, 60 * 60_000)) return status(429, { error: 'สมัครบ่อยเกินไป ลองใหม่ภายหลัง' })
    if (await db.query.users.findFirst({ where: eq(users.email, body.email) })) return status(409, { error: 'อีเมลนี้ถูกใช้แล้ว' })
    const [u] = await db.insert(users).values({ ...body, passwordHash: await Bun.password.hash(body.password) }).returning(publicUser)
    token.set({ value: await jwt.sign({ sub: String(u.id), role: u.role }), ...cookieOpts })
    return u
  }, { body: t.Object({ email: t.String({ format: 'email' }), name: t.String({ minLength: 1 }), password: t.String({ minLength: 8 }) }) })
  .post('/login', async ({ body, jwt, cookie: { token }, status, request, server }) => {
    // per IP + email: guessing one account from one address is capped, without letting a stranger lock the admin out from elsewhere
    const key = `login:${server?.requestIP(request)?.address}:${body.email.toLowerCase()}`
    if (limited(key, 10, WINDOW)) return status(429, { error: 'ลองเข้าสู่ระบบบ่อยเกินไป รอสักครู่แล้วลองใหม่' })
    const u = await db.query.users.findFirst({ where: eq(users.email, body.email) })
    if (!u || !(await Bun.password.verify(body.password, u.passwordHash))) return status(401, { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })
    forgive(key)
    token.set({ value: await jwt.sign({ sub: String(u.id), role: u.role }), ...cookieOpts })
    return { id: u.id, email: u.email, name: u.name, role: u.role }
  }, { body: t.Object({ email: t.String(), password: t.String() }) })
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
  .get('/stories', () => db.select({
    id: stories.id, title: stories.title, synopsis: stories.synopsis, genre: stories.genre, mood: stories.mood, createdAt: stories.createdAt, coverImage: stories.coverImage,
    chapterCount: sql<number>`(select count(*)::int from chapters where chapters.story_id = stories.id and ${visibleSql})`,
    updatedAt: sql<string | null>`(select max(coalesce(chapters.publish_at, chapters.created_at)) from chapters where chapters.story_id = stories.id and ${visibleSql})`,
  }).from(stories).where(eq(stories.published, true)).orderBy(desc(stories.id)))
  .get('/stories/:id', async ({ params, status }) => {
    const s = await db.query.stories.findFirst({ where: and(eq(stories.id, params.id), eq(stories.published, true)), columns: { systemPrompt: false, premise: false, model: false } })
    if (!s) return status(404, { error: 'ไม่พบข้อมูล' })
    const list = await db.select({ no: chapters.no, title: chapters.title, createdAt: chapters.createdAt }).from(chapters)
      .where(and(eq(chapters.storyId, s.id), visible)).orderBy(asc(chapters.no))
    const cast = await db.select({ id: characters.id, name: characters.name, role: characters.role, profile: characters.profile, image: characters.image })
      .from(characters).where(and(eq(characters.storyId, s.id), eq(characters.visible, true))).orderBy(asc(characters.id))
    return { ...s, chapters: list, characters: cast }
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
  .get('/stories/:id/chapters/:no', async ({ params, status }) => {
    const [c] = await db.select({ no: chapters.no, title: chapters.title, content: chapters.content }).from(chapters)
      .innerJoin(stories, eq(stories.id, chapters.storyId))
      .where(and(eq(chapters.storyId, params.id), eq(chapters.no, params.no), visible, eq(stories.published, true)))
    return c ?? status(404, { error: 'ไม่พบข้อมูล' })
  }, { params: t.Object({ id: t.Numeric(), no: t.Numeric() }) })

// Signed-in readers: where they stopped in each story
// only chapters readers can see may be recorded, which also keeps the story foreign key valid
const isLive = async (storyId: number, no: number) => !!(await db.select({ id: chapters.id }).from(chapters).innerJoin(stories, eq(stories.id, chapters.storyId))
  .where(and(eq(chapters.storyId, storyId), eq(chapters.no, no), visible, eq(stories.published, true))))[0]

// Signed-in readers: where they stopped in each story, and which chapters they have finished
const meRoutes = new Elysia({ prefix: '/me' })
  .use(auth)
  .guard(userOnly, app => app
    .get('/progress', ({ me }) => db.select({ storyId: readingProgress.storyId, no: readingProgress.no, pos: readingProgress.pos, updatedAt: readingProgress.updatedAt })
      .from(readingProgress).where(eq(readingProgress.userId, me!.id)).orderBy(desc(readingProgress.updatedAt)))
    .put('/progress/:id', async ({ params, body, me, status }) => {
      if (!(await isLive(params.id, body.no))) return status(404, { error: 'ไม่พบข้อมูล' })
      const pos = body.pos ?? null
      await db.insert(readingProgress).values({ userId: me!.id, storyId: params.id, no: body.no, pos })
        .onConflictDoUpdate({ target: [readingProgress.userId, readingProgress.storyId], set: { no: body.no, pos, updatedAt: sql`now()` } })
      return { ok: true }
    }, { ...id, body: t.Object({ no: t.Integer({ minimum: 1 }), pos: t.Optional(t.Number({ minimum: 0, maximum: 1 })) }) })
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
    .get('/users', () => db.select(publicUser).from(users).orderBy(users.id))
    .patch('/users/:id', async ({ params, body, me, status }) => {
      if (params.id === me!.id) return status(400, { error: 'เปลี่ยน role ของตัวเองไม่ได้' }) // avoid locking out the last admin
      return (await db.update(users).set(body).where(eq(users.id, params.id)).returning(publicUser))[0]
    }, { ...id, body: t.Object({ role: t.Union([t.Literal('admin'), t.Literal('user')]) }) })

    .get('/usage', async () => ({ spent: await monthSpent(), budget: budget() }))

    // list rows only: the heavy text columns (premise, system prompt) are loaded by GET /stories/:id
    .get('/stories', async ({ query }) => {
      const total = await db.$count(stories)
      const { page, size, offset } = paging(query, total, 'first', 20)
      const items = await db.select({
        id: stories.id, title: stories.title, genre: stories.genre, coverImage: stories.coverImage, published: stories.published,
        chapterCount: sql<number>`(select count(*)::int from chapters where chapters.story_id = stories.id)`,
        draftCount: sql<number>`(select count(*)::int from chapters where chapters.story_id = stories.id and not chapters.published)`,
      }).from(stories).orderBy(desc(stories.id)).limit(size).offset(offset)
      return { items, total, page, size }
    }, { query: pageQuery })
    .post('/stories', async ({ body, me }) => (await db.insert(stories).values({ ...body, authorId: me!.id }).returning())[0], { body: storyBody })
    .get('/stories/:id', async ({ params, status }) => {
      const s = await db.query.stories.findFirst({ where: eq(stories.id, params.id) })
      if (!s) return status(404, { error: 'ไม่พบข้อมูล' })
      const [{ last, spent }] = await db.select({ last: max(chapters.no), spent: sql<number>`coalesce(sum(${chapters.cost}), 0)::float8` }).from(chapters).where(eq(chapters.storyId, s.id))
      const noSummary = await db.select({ id: chapters.id }).from(chapters).where(and(eq(chapters.storyId, s.id), eq(chapters.summary, ''))).orderBy(asc(chapters.no))
      return { ...s, nextNo: (last ?? 0) + 1, spent, nextBeat: nextBeat(s.outline) ?? null, missingSummaryIds: noSummary.map(c => c.id) }
    }, id)
    // chapter rows without the text, newest page first when `page` is omitted; GET /chapters/:id loads one in full
    .get('/stories/:id/chapters', async ({ params, query }) => {
      const total = await db.$count(chapters, eq(chapters.storyId, params.id))
      const { page, size, offset } = paging(query, total, 'last')
      const items = await db.select({ id: chapters.id, no: chapters.no, title: chapters.title, published: chapters.published, publishAt: chapters.publishAt, createdAt: chapters.createdAt, hasSummary: sql<boolean>`${chapters.summary} <> ''`, tokens: chapters.tokens, cost: chapters.cost })
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
    .post('/stories/:id/characters/suggest', async ({ params, status }) => {
      const story = await db.query.stories.findFirst({ where: eq(stories.id, params.id) })
      if (!story) return status(404, { error: 'ไม่พบข้อมูล' })
      try { return { suggestions: await suggestCharacters(story) } }
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
      const before = body.content === undefined && body.title === undefined ? null : await db.query.chapters.findFirst({ where: eq(chapters.id, params.id) })
      // the text about to be overwritten is kept as a version, so this is never a one-way trip
      if (before && ((body.content !== undefined && body.content !== before.content) || (body.title !== undefined && body.title !== before.title))) await snapshot(before)
      const [row] = await db.update(chapters).set({ ...rest, ...(publishAt !== undefined ? { publishAt: at } : body.published ? { publishAt: null } : {}) }).where(eq(chapters.id, params.id)).returning()
      if (before && row && body.content !== undefined) { const keep = new Set(imageNames(row.content)); await pruneUnused(imageNames(before.content).filter(n => !keep.has(n))) }
      return row ?? status(404, { error: 'ไม่พบข้อมูล' })
    }, { ...id, body: t.Partial(t.Object({ title: t.String(), content: t.String(), summary: t.String(), published: t.Boolean(), publishAt: t.Union([t.String(), t.Null()]) })) })
    .get('/chapters/:id/versions', ({ params }) => db.select({ id: chapterVersions.id, title: chapterVersions.title, createdAt: chapterVersions.createdAt, length: sql<number>`char_length(${chapterVersions.content})`, excerpt: sql<string>`left(${chapterVersions.content}, 160)` })
      .from(chapterVersions).where(eq(chapterVersions.chapterId, params.id)).orderBy(desc(chapterVersions.id)), id)
    .post('/chapters/:id/restore/:version', async ({ params, status }) => (await restore(params.id, params.version)) ?? status(404, { error: 'ไม่พบข้อมูล' }), { params: t.Object({ id: t.Numeric(), version: t.Numeric() }) })
    // publish / hide several chapters of one story at once
    .patch('/stories/:id/chapters', async ({ params, body }) => {
      const rows = await db.update(chapters).set({ published: body.published, ...(body.published && { publishAt: null }) })
        .where(and(eq(chapters.storyId, params.id), inArray(chapters.id, body.ids))).returning({ id: chapters.id })
      return { updated: rows.length }
    }, { ...id, body: t.Object({ ids: t.Array(t.Integer(), { minItems: 1 }), published: t.Boolean() }) })
    // Streams a fresh version of an existing chapter written by `model`. Nothing is saved: the admin previews it and applies it in the editor.
    .post('/chapters/:id/rewrite', async function* ({ params, body, set }) {
      const c = await db.query.chapters.findFirst({ where: eq(chapters.id, params.id) })
      const story = c && await db.query.stories.findFirst({ where: eq(stories.id, c.storyId) })
      if (!c || !story) { set.status = 404; yield 'ไม่พบตอนนี้'; return }
      const stop = await overBudget()
      if (stop) { set.status = 402; yield stop; return }

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
        for await (const d of streamChat(body.model?.trim() || ctx.model, ctx.messages)) {
          acc += d; yield d
          if (loopStart(acc) !== -1) { yield '\n\n⚠️ โมเดลเริ่มตอบวนซ้ำ จึงหยุดให้'; break }
        }
      } catch (e) {
        // before any text: a real HTTP error the client can show; after: a marker inside the preview
        if (!acc) set.status = 502
        yield `${acc ? '\n\n⚠️ ' : ''}${(e as Error).message}`
      }
    }, { ...id, body: t.Object({ model: t.Optional(t.String()), instruction: t.Optional(t.String()) }) })
    .post('/chapters/:id/summarize', async ({ params, status }) => {
      try { return { summary: await summarizeChapter(params.id) } }
      catch (e) { return status(502, { error: (e as Error).message }) }
    }, id)
    // continuity report for one chapter; on demand because each run costs a model call
    .post('/chapters/:id/check', async ({ params, status }) => {
      const stop = await overBudget()
      if (stop) return status(402, { error: stop })
      try { return { report: await checkChapter(params.id) } }
      catch (e) { return status(502, { error: (e as Error).message }) }
    }, id)
    .delete('/chapters/:id', async ({ params }) => {
      const [c] = await db.delete(chapters).where(eq(chapters.id, params.id)).returning({ content: chapters.content })
      if (c) await pruneUnused(imageNames(c.content))
      return { ok: true }
    }, id)
    // images inserted in the chapter editor; they stay unreferenced (and get swept) until the chapter is saved with them
    .post('/images', async ({ body, status }) => {
      try { const name = await saveImage(body.file); return { name, url: `/api/uploads/${name}` } }
      catch (e) { return status(422, { error: (e as Error).message }) }
    }, { body: imageBody })

    // Streams the new chapter as plain text, saves it as an unpublished draft when finished.
    .post('/stories/:id/generate', async function* ({ params, body, set }) {
      const story = await db.query.stories.findFirst({ where: eq(stories.id, params.id) })
      if (!story) { set.status = 404; yield 'ไม่พบเรื่องนี้'; return }

      const stop = await overBudget()
      if (stop) { set.status = 402; yield stop; return }

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
        for await (const d of streamChat(model, messages, u => { usage = u })) {
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
            if (complete) summarizeChapter(row.id, model).catch(e => console.error('summary failed', e))
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
