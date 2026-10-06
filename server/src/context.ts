import { and, asc, desc, eq, lt, sql } from 'drizzle-orm'
import { db } from './db'
import { stripImages } from './markdown'
import { DEFAULT_MODEL } from './openrouter'
import { DEFAULT_SYSTEM_PROMPT } from './prompt'
import { chapters, characters, type stories } from './schema'

// The AI sees: story brief + a recap of every older chapter + the last FULL_CHAPTERS chapters in full.
// Cost stays flat as the story grows (a recap is ~150 tokens vs ~7k for a full chapter).
export const FULL_CHAPTERS = 2

type Story = typeof stories.$inferSelect

/** One line per chapter before `beforeNo` (all chapters if omitted): its recap, or its opening when no recap exists yet. */
export async function loadRecap(storyId: number, beforeNo?: number) {
  const rows = await db.select({ no: chapters.no, summary: chapters.summary, excerpt: sql<string>`left(regexp_replace(${chapters.content}, '!\\[[^\\]]*\\]\\(([^)"]|"[^"]*")*\\)', '', 'g'), 400)` }).from(chapters)
    .where(and(eq(chapters.storyId, storyId), beforeNo === undefined ? undefined : lt(chapters.no, beforeNo))).orderBy(asc(chapters.no))
  return rows.map(c => ({ no: c.no, hasSummary: !!c.summary, text: c.summary || c.excerpt.replace(/\s+/g, ' ').trim() + '…' }))
}

export async function loadCast(storyId: number) {
  return db.select().from(characters).where(eq(characters.storyId, storyId)).orderBy(asc(characters.id))
}

export async function buildContext(story: Story, instruction?: string) {
  const full = (await db.select().from(chapters).where(eq(chapters.storyId, story.id)).orderBy(desc(chapters.no)).limit(FULL_CHAPTERS)).reverse()
  // chapters without a summary fall back to their opening, so nothing silently drops out of context
  const older = full.length ? await loadRecap(story.id, full[0].no) : []
  const cast = await loadCast(story.id)
  const no = (full[full.length - 1]?.no ?? 0) + 1

  const recap = older.map(c => `ตอนที่ ${c.no}: ${c.text}`).join('\n')
  const castText = cast.map(c => `- ${c.name}${c.role ? ` (${c.role})` : ''}${c.profile ? `: ${c.profile.replace(/\s+/g, ' ').trim()}` : ''}`).join('\n')
  const sys = [
    story.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    story.genre && `แนว: ${story.genre}`,
    story.mood && `ความรู้สึกที่ต้องการ: ${story.mood}`,
    story.premise && `พล็อต/ตัวละครตั้งต้น:\n${story.premise}`,
    castText && `ตัวละคร (ใช้ชื่อ บุคลิก และน้ำเสียงพูดให้ตรงตามนี้เสมอ ถ้าต้องมีตัวละครใหม่ให้ตั้งชื่อที่ไม่ซ้ำกับรายการนี้):\n${castText}`,
    recap && `เรื่องย่อของตอนก่อนหน้า (ใช้รักษาความต่อเนื่องของเนื้อเรื่อง ตัวละคร และชื่อเฉพาะ ห้ามเขียนซ้ำเหตุการณ์เดิม):\n${recap}`,
  ].filter(Boolean).join('\n\n')

  const messages = [
    { role: 'system' as const, content: sys },
    ...full.flatMap(c => [
      { role: 'user' as const, content: c.instruction || `เขียนตอนที่ ${c.no}` },
      { role: 'assistant' as const, content: stripImages(c.content) },
    ]),
    { role: 'user' as const, content: instruction || `เขียนตอนที่ ${no} ต่อจากตอนก่อนหน้า` },
  ]
  return { messages, model: story.model || DEFAULT_MODEL, no, recapCount: older.length, missingSummaries: older.filter(c => !c.hasSummary).length, castCount: cast.length }
}
