import { cors } from '@elysiajs/cors'
import { and, asc, desc, eq, getTableColumns, sql } from 'drizzle-orm'
import { join } from 'node:path'
import { Elysia, t } from 'elysia'
import { adminOnly, auth, seedAdmin } from './auth'
import { addChapter, summarizeChapter } from './chapters'
import { suggestCharacters } from './characters'
import { buildContext } from './context'
import { loopStart } from './guard'
import { imageNames } from './markdown'
import { pruneUnused, sweepOrphans } from './media'
import { MIME_BY_EXT, NAME_RE, removeUpload, saveImage, UPLOAD_DIR } from './uploads'
import { db } from './db'
import { streamChat } from './openrouter'
import { chapters, characters, stories, users } from './schema'

const id = { params: t.Object({ id: t.Numeric() }) }
const characterBody = t.Object({ name: t.String({ minLength: 1 }), role: t.Optional(t.String()), profile: t.Optional(t.String()), visible: t.Optional(t.Boolean()) })
// type/size are checked by saveImage (magic bytes), so the error message can be shown to the admin as-is
const imageBody = t.Object({ file: t.File() })
const cookieOpts = { httpOnly: true, sameSite: 'lax' as const, path: '/', maxAge: 30 * 86400 }
const publicUser = { id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt }

const storyBody = t.Object({
  title: t.String({ minLength: 1 }),
  synopsis: t.Optional(t.String()),
  genre: t.Optional(t.String()),
  mood: t.Optional(t.String()),
  premise: t.Optional(t.String()),
  systemPrompt: t.Optional(t.String()),
  model: t.Optional(t.String()),
  published: t.Optional(t.Boolean()),
})

const authRoutes = new Elysia({ prefix: '/auth' })
  .use(auth)
  .post('/register', async ({ body, jwt, cookie: { token }, status }) => {
    if (await db.query.users.findFirst({ where: eq(users.email, body.email) })) return status(409, { error: 'อีเมลนี้ถูกใช้แล้ว' })
    const [u] = await db.insert(users).values({ ...body, passwordHash: await Bun.password.hash(body.password) }).returning(publicUser)
    token.set({ value: await jwt.sign({ sub: String(u.id), role: u.role }), ...cookieOpts })
    return u
  }, { body: t.Object({ email: t.String({ format: 'email' }), name: t.String({ minLength: 1 }), password: t.String({ minLength: 8 }) }) })
  .post('/login', async ({ body, jwt, cookie: { token }, status }) => {
    const u = await db.query.users.findFirst({ where: eq(users.email, body.email) })
    if (!u || !(await Bun.password.verify(body.password, u.passwordHash))) return status(401, { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })
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
    chapterCount: sql<number>`(select count(*)::int from chapters where chapters.story_id = stories.id and chapters.published)`,
    updatedAt: sql<string | null>`(select max(chapters.created_at) from chapters where chapters.story_id = stories.id and chapters.published)`,
  }).from(stories).where(eq(stories.published, true)).orderBy(desc(stories.id)))
  .get('/stories/:id', async ({ params, status }) => {
    const s = await db.query.stories.findFirst({ where: and(eq(stories.id, params.id), eq(stories.published, true)), columns: { systemPrompt: false, premise: false, model: false } })
    if (!s) return status(404, { error: 'ไม่พบข้อมูล' })
    const list = await db.select({ no: chapters.no, title: chapters.title, createdAt: chapters.createdAt }).from(chapters)
      .where(and(eq(chapters.storyId, s.id), eq(chapters.published, true))).orderBy(asc(chapters.no))
    const cast = await db.select({ id: characters.id, name: characters.name, role: characters.role, profile: characters.profile, image: characters.image })
      .from(characters).where(and(eq(characters.storyId, s.id), eq(characters.visible, true))).orderBy(asc(characters.id))
    return { ...s, chapters: list, characters: cast }
  }, id)
  .get('/stories/:id/chapters/:no', async ({ params, status }) => {
    const [c] = await db.select({ no: chapters.no, title: chapters.title, content: chapters.content }).from(chapters)
      .innerJoin(stories, eq(stories.id, chapters.storyId))
      .where(and(eq(chapters.storyId, params.id), eq(chapters.no, params.no), eq(chapters.published, true), eq(stories.published, true)))
    return c ?? status(404, { error: 'ไม่พบข้อมูล' })
  }, { params: t.Object({ id: t.Numeric(), no: t.Numeric() }) })

const adminRoutes = new Elysia({ prefix: '/admin' })
  .use(auth)
  .guard(adminOnly, app => app
    .get('/users', () => db.select(publicUser).from(users).orderBy(users.id))
    .patch('/users/:id', async ({ params, body, me, status }) => {
      if (params.id === me!.id) return status(400, { error: 'เปลี่ยน role ของตัวเองไม่ได้' }) // avoid locking out the last admin
      return (await db.update(users).set(body).where(eq(users.id, params.id)).returning(publicUser))[0]
    }, { ...id, body: t.Object({ role: t.Union([t.Literal('admin'), t.Literal('user')]) }) })

    .get('/stories', () => db.select({
      ...getTableColumns(stories),
      chapterCount: sql<number>`(select count(*)::int from chapters where chapters.story_id = stories.id)`,
      draftCount: sql<number>`(select count(*)::int from chapters where chapters.story_id = stories.id and not chapters.published)`,
    }).from(stories).orderBy(desc(stories.id)))
    .post('/stories', async ({ body, me }) => (await db.insert(stories).values({ ...body, authorId: me!.id }).returning())[0], { body: storyBody })
    .get('/stories/:id', async ({ params, status }) => {
      const s = await db.query.stories.findFirst({ where: eq(stories.id, params.id) })
      if (!s) return status(404, { error: 'ไม่พบข้อมูล' })
      return { ...s, chapters: await db.select().from(chapters).where(eq(chapters.storyId, s.id)).orderBy(asc(chapters.no)) }
    }, id)
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

    .patch('/chapters/:id', async ({ params, body }) => {
      const before = body.content === undefined ? null : await db.query.chapters.findFirst({ where: eq(chapters.id, params.id) })
      const [row] = await db.update(chapters).set(body).where(eq(chapters.id, params.id)).returning()
      if (before && row) { const keep = new Set(imageNames(row.content)); await pruneUnused(imageNames(before.content).filter(n => !keep.has(n))) }
      return row
    }, { ...id, body: t.Partial(t.Object({ title: t.String(), content: t.String(), summary: t.String(), published: t.Boolean() })) })
    .post('/chapters/:id/summarize', async ({ params, status }) => {
      try { return { summary: await summarizeChapter(params.id) } }
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

      const { messages, model } = await buildContext(story, body.instruction)

      // Save in `finally`: it also runs when the client drops mid-stream (refresh, stop button),
      // so what was already generated (and paid for) is kept as a draft instead of being lost.
      let acc = '', complete = false, looped = false
      try {
        for await (const d of streamChat(model, messages)) {
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
            const row = await addChapter(story.id, { title, content, instruction: body.instruction ?? '', model })
            // recap runs in the background so the stream can close; skipped for cut-off chapters
            if (complete) summarizeChapter(row.id, model).catch(e => console.error('summary failed', e))
          } catch (e) { console.error('failed to save generated chapter', e) }
        }
      }
    }, { ...id, body: t.Object({ instruction: t.Optional(t.String()) }) }))

export const app = new Elysia({ prefix: '/api' })
  .use(cors({ origin: true, credentials: true }))
  .get('/health', () => 'ok')
  .use(authRoutes)
  .use(readerRoutes)
  .use(adminRoutes)

export type App = typeof app

if (import.meta.main) {
  // a client dropping mid-stream rejects the aborted upstream read; that is expected, not fatal
  process.on('unhandledRejection', e => { if ((e as Error)?.name !== 'AbortError') throw e })
  await seedAdmin()
  const sweep = () => sweepOrphans().catch(e => console.error('upload sweep failed', e))
  sweep(); setInterval(sweep, 6 * 60 * 60 * 1000).unref()
  app.listen(Number(process.env.PORT) || 3000)
  console.log(`🦊 http://localhost:${process.env.PORT || 3000}`)
}
