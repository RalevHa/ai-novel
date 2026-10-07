import { and, desc, eq } from 'drizzle-orm'
import { Elysia, status, t } from 'elysia'
import { adminOnly, auth } from './auth'
import { db } from './db'
import { DEFAULT_PAGES, DEFAULTS_UPDATED, PAGE_SLUGS, type PageSlug } from './pageDefaults'
import { fillPlaceholders, isEmail } from './placeholders'
import { infoPageRevisions, infoPages, siteSettings, users } from './schema'

// The site's own information pages (terms, privacy, guide, about, contact) and the two settings they quote.
// Readers get the pages through GET /pages/:slug; admins edit them under /admin/site and /admin/pages.

const DEFAULT_OPERATOR = 'ผู้ดูแลเว็บไซต์ AI Novel'
const slug = t.Union(PAGE_SLUGS.map(s => t.Literal(s)) as [ReturnType<typeof t.Literal<string>>, ...ReturnType<typeof t.Literal<string>>[]])
const params = t.Object({ slug })

/** Stored value, else the server env (OPERATOR_NAME / CONTACT_EMAIL), else a default. */
export async function readSettings() {
  const rows = await db.select({ key: siteSettings.key, value: siteSettings.value }).from(siteSettings)
  const stored = (k: string) => rows.find(r => r.key === k)?.value
  return {
    operator: stored('operatorName') ?? (process.env.OPERATOR_NAME?.trim() || DEFAULT_OPERATOR),
    contactEmail: stored('contactEmail') ?? (process.env.CONTACT_EMAIL?.trim() || ''),
  }
}

async function setSetting(key: string, value: string) {
  // an empty value means "not set": drop the row so the env / default applies again
  if (!value) return void (await db.delete(siteSettings).where(eq(siteSettings.key, key)))
  await db.insert(siteSettings).values({ key, value }).onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: new Date() } })
}

async function pageOf(s: PageSlug) {
  const [row] = await db.select().from(infoPages).where(eq(infoPages.slug, s))
  return row ? { title: row.title, body: row.body, updatedAt: row.updatedAt, isDefault: false } : { ...DEFAULT_PAGES[s], updatedAt: DEFAULTS_UPDATED, isDefault: true }
}

export const siteRoutes = new Elysia()
  .use(auth)
  .get('/site', () => readSettings())
  .get('/pages/:slug', async ({ params: { slug: s } }) => {
    const [p, settings] = await Promise.all([pageOf(s as PageSlug), readSettings()])
    return { slug: s, title: p.title, body: fillPlaceholders(p.body, settings), updatedAt: p.updatedAt, isDefault: p.isDefault }
  }, { params })
  .guard(adminOnly, app => app
    .get('/admin/site', () => readSettings())
    .put('/admin/site', async ({ body }) => {
      const operator = body.operator.trim(), email = body.contactEmail.trim()
      if (email && !isEmail(email)) return status(422, { error: 'อีเมลไม่ถูกต้อง' })
      await setSetting('operatorName', operator)
      await setSetting('contactEmail', email)
      return readSettings()
    }, { body: t.Object({ operator: t.String({ maxLength: 120 }), contactEmail: t.String({ maxLength: 200 }) }) })

    .get('/admin/pages', async () => {
      const rows = await db.select({ slug: infoPages.slug, title: infoPages.title, updatedAt: infoPages.updatedAt, editor: users.name })
        .from(infoPages).leftJoin(users, eq(users.id, infoPages.updatedBy))
      return PAGE_SLUGS.map(s => {
        const r = rows.find(x => x.slug === s)
        return { slug: s, title: r?.title ?? DEFAULT_PAGES[s].title, isDefault: !r, updatedAt: r?.updatedAt ?? DEFAULTS_UPDATED, editor: r?.editor ?? null }
      })
    })
    // the raw text (with {{placeholders}}), plus the shipped default so the editor can show or restore it
    .get('/admin/pages/:slug', async ({ params: { slug: s } }) => ({ slug: s, ...(await pageOf(s as PageSlug)), default: DEFAULT_PAGES[s as PageSlug] }), { params })
    .put('/admin/pages/:slug', async ({ params: { slug: s }, body, me }) => {
      const title = body.title.trim(), text = body.body.trim()
      if (!title || !text) return status(422, { error: 'ต้องมีทั้งหัวข้อและเนื้อหา' })
      await db.transaction(async tx => {
        await tx.insert(infoPages).values({ slug: s, title, body: text, updatedBy: me!.id })
          .onConflictDoUpdate({ target: infoPages.slug, set: { title, body: text, updatedAt: new Date(), updatedBy: me!.id } })
        await tx.insert(infoPageRevisions).values({ slug: s, title, body: text, editorId: me!.id })
      })
      return { ok: true }
    }, { params, body: t.Object({ title: t.String({ maxLength: 200 }), body: t.String({ maxLength: 60_000 }) }) })
    // back to the shipped text; the reset itself is kept in the history too
    .delete('/admin/pages/:slug', async ({ params: { slug: s }, me }) => {
      await db.transaction(async tx => {
        await tx.delete(infoPages).where(eq(infoPages.slug, s))
        await tx.insert(infoPageRevisions).values({ slug: s, title: DEFAULT_PAGES[s as PageSlug].title, body: DEFAULT_PAGES[s as PageSlug].body, editorId: me!.id })
      })
      return { ok: true }
    }, { params })
    .get('/admin/pages/:slug/revisions', ({ params: { slug: s } }) =>
      db.select({ id: infoPageRevisions.id, title: infoPageRevisions.title, createdAt: infoPageRevisions.createdAt, editor: users.name })
        .from(infoPageRevisions).leftJoin(users, eq(users.id, infoPageRevisions.editorId)).where(eq(infoPageRevisions.slug, s)).orderBy(desc(infoPageRevisions.id)).limit(30), { params })
    .get('/admin/pages/:slug/revisions/:id', async ({ params: { slug: s, id } }) => {
      const [r] = await db.select({ id: infoPageRevisions.id, title: infoPageRevisions.title, body: infoPageRevisions.body, createdAt: infoPageRevisions.createdAt })
        .from(infoPageRevisions).where(and(eq(infoPageRevisions.slug, s), eq(infoPageRevisions.id, id)))
      return r ?? status(404, { error: 'ไม่พบข้อมูล' })
    }, { params: t.Object({ slug, id: t.Numeric() }) }))
