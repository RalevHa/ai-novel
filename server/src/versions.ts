import { desc, eq, inArray } from 'drizzle-orm'
import { db } from './db'
import { imageNames } from './markdown'
import { pruneUnused } from './media'
import { chapters, chapterVersions } from './schema'

const KEEP = 10

/** Save the chapter's current title + text as a version, keeping the newest KEEP. Call before overwriting it. */
export async function snapshot(c: { id: number; title: string; content: string }) {
  await db.insert(chapterVersions).values({ chapterId: c.id, title: c.title, content: c.content })
  const old = await db.select({ id: chapterVersions.id, content: chapterVersions.content }).from(chapterVersions)
    .where(eq(chapterVersions.chapterId, c.id)).orderBy(desc(chapterVersions.id)).offset(KEEP)
  if (!old.length) return
  await db.delete(chapterVersions).where(inArray(chapterVersions.id, old.map(o => o.id)))
  await pruneUnused(old.flatMap(o => imageNames(o.content))) // images only those versions used
}

/** Put a saved version back. The text being replaced is saved first, so a restore can be undone too. Null if either row is gone. */
export async function restore(chapterId: number, versionId: number) {
  const [v] = await db.select().from(chapterVersions).where(eq(chapterVersions.id, versionId))
  const cur = await db.query.chapters.findFirst({ where: eq(chapters.id, chapterId) })
  if (!v || v.chapterId !== chapterId || !cur) return null
  await snapshot(cur)
  return (await db.update(chapters).set({ title: v.title, content: v.content }).where(eq(chapters.id, chapterId)).returning())[0]
}
