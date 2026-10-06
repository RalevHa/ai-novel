import { eq, max, sql } from 'drizzle-orm'
import { db } from './db'
import { normalizeParagraphs, stripImages } from './markdown'
import { castLines, loadCast, loadRecap } from './context'
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
  // SUMMARY_MODEL (e.g. a free local model) wins: a recap needs accuracy, not prose style
  const m = process.env.SUMMARY_MODEL || model || (await db.query.stories.findFirst({ where: eq(stories.id, c.storyId) }))?.model || DEFAULT_MODEL
  let spent = undefined as Usage | undefined
  const summary = short ? text.replace(/\s+/g, ' ') : await chat(m, [
    { role: 'system', content: SUMMARY_PROMPT },
    { role: 'user', content: `ชื่อตอน: ${c.title}\n\n${text.slice(0, 30_000)}` },
  ], u => { spent = u })
  if (!summary) throw new Error('โมเดลไม่ส่งสรุปกลับมา ลองใหม่อีกครั้ง')
  await db.update(chapters).set({ summary }).where(eq(chapters.id, id))
  await addCost(id, spent) // the recap is paid for too
  return summary
}

/** Add money spent on a chapter after it was written (recap, continuity check) to its running cost. */
const addCost = async (id: number, u: Usage | undefined) => {
  if (u) await db.update(chapters).set({ tokens: sql`coalesce(${chapters.tokens}, 0) + ${u.tokens}`, cost: sql`coalesce(${chapters.cost}, 0) + ${u.cost}` }).where(eq(chapters.id, id))
}

const CHECK_PROMPT = `คุณเป็นบรรณาธิการตรวจความต่อเนื่องของนิยาย จะได้รับรายชื่อตัวละคร เรื่องย่อของตอนก่อนหน้า และตอนที่ต้องตรวจ
หาเฉพาะจุดที่ตอนนี้ขัดแย้งกับข้อมูลที่ให้มา เช่น
- ชื่อ รูปลักษณ์ นิสัย หรือน้ำเสียงพูดของตัวละครไม่ตรงกับโปรไฟล์
- เหตุการณ์ สถานที่ หรือกฎของโลกที่ขัดกับตอนก่อนหน้า
- ตัวละครที่ตายหรือจากไปแล้วกลับมาโดยไม่มีคำอธิบาย
ตอบเป็นรายการสั้นๆ บรรทัดละหนึ่งข้อ ขึ้นต้นด้วย "- " ระบุว่าขัดกับอะไร อย่าเสนอการแก้ไขสำนวนหรือวิจารณ์เรื่องอื่น
ถ้าไม่พบความขัดแย้ง ให้ตอบว่า "ไม่พบความขัดแย้ง" เท่านั้น`

/** Ask a model to flag contradictions between a chapter and the cast / earlier recaps. Nothing is saved except the cost. */
export async function checkChapter(id: number) {
  const c = await db.query.chapters.findFirst({ where: eq(chapters.id, id) })
  if (!c) throw new Error('ไม่พบตอนนี้')
  const story = await db.query.stories.findFirst({ where: eq(stories.id, c.storyId) })
  const [cast, recap] = await Promise.all([loadCast(c.storyId), loadRecap(c.storyId, c.no)])
  let spent = undefined as Usage | undefined
  const report = await chat(process.env.CHECK_MODEL || story?.model || DEFAULT_MODEL, [
    { role: 'system', content: CHECK_PROMPT },
    { role: 'user', content: [
      `ตัวละคร:\n${castLines(cast) || '(ไม่มี)'}`,
      `เรื่องย่อตอนก่อนหน้า:\n${recap.map(r => `ตอนที่ ${r.no}: ${r.text}`).join('\n') || '(ยังไม่มี)'}`,
      `ตอนที่ ${c.no}: ${c.title}\n\n${stripImages(c.content).slice(0, 30_000)}`,
    ].join('\n\n') },
  ], u => { spent = u })
  if (!report) throw new Error('โมเดลไม่ส่งผลการตรวจกลับมา ลองใหม่อีกครั้ง')
  await addCost(id, spent)
  return report
}
