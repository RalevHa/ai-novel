import { eq, max, sql } from 'drizzle-orm'
import { db } from './db'
import { normalizeParagraphs, stripImages } from './markdown'
import { chat, DEFAULT_MODEL, type Usage } from './openrouter'
import { chapters, stories } from './schema'

const nextNo = async (storyId: number) =>
  ((await db.select({ n: max(chapters.no) }).from(chapters).where(eq(chapters.storyId, storyId)))[0]?.n ?? 0) + 1

// drizzle may wrap the driver error, keeping the Postgres code on `cause`
const isUniqueViolation = (e: unknown) => ((e as any)?.code ?? (e as any)?.cause?.code) === '23505'

/**
 * Insert as the story's next chapter. The unique (story_id, no) index guarantees no duplicates;
 * if another writer took the number first, recompute and retry.
 */
export async function addChapter(storyId: number, v: Omit<typeof chapters.$inferInsert, 'storyId' | 'no'>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return (await db.insert(chapters).values({ ...v, content: normalizeParagraphs(v.content), storyId, no: await nextNo(storyId) }).returning())[0]
    } catch (e) {
      if (!isUniqueViolation(e) || attempt >= 5) throw e
    }
  }
}

const SHORT_CHAPTER = 400
const SUMMARY_PROMPT = `คุณเป็นบรรณาธิการนิยาย สรุปตอนที่ให้เป็นภาษาไทย 3-5 ประโยค (ไม่เกิน 600 ตัวอักษร) โดยเน้น:
- เหตุการณ์สำคัญตามลำดับ
- ตัวละครที่ปรากฏ และความสัมพันธ์หรือความรู้สึกที่เปลี่ยนไป
- ชื่อเฉพาะ สถานที่ กฎของโลก หรือข้อมูลใหม่ที่ตั้งขึ้นในตอนนี้
- ปมที่ยังค้างอยู่
ตอบเฉพาะบทสรุป ไม่ต้องมีคำนำหรือหัวข้อ`

/** Write (or rewrite) a chapter's recap with the story's model. Throws if the model returns nothing. */
export async function summarizeChapter(id: number, model?: string) {
  const c = await db.query.chapters.findFirst({ where: eq(chapters.id, id) })
  if (!c) throw new Error('ไม่พบตอนนี้')
  // too short to summarise: asking the model gives an apology ("no content provided"), which would pollute the recap
  const text = stripImages(c.content)
  const short = text.length < SHORT_CHAPTER
  const m = model || (await db.query.stories.findFirst({ where: eq(stories.id, c.storyId) }))?.model || DEFAULT_MODEL
  let spent = undefined as Usage | undefined
  const summary = short ? text.replace(/\s+/g, ' ') : await chat(m, [
    { role: 'system', content: SUMMARY_PROMPT },
    { role: 'user', content: `ชื่อตอน: ${c.title}\n\n${text.slice(0, 30_000)}` },
  ], u => { spent = u })
  if (!summary) throw new Error('โมเดลไม่ส่งสรุปกลับมา ลองใหม่อีกครั้ง')
  // the recap is paid for too, so it counts toward the chapter's cost
  await db.update(chapters).set({ summary, ...(spent && { tokens: sql`coalesce(${chapters.tokens}, 0) + ${spent.tokens}`, cost: sql`coalesce(${chapters.cost}, 0) + ${spent.cost}` }) }).where(eq(chapters.id, id))
  return summary
}
