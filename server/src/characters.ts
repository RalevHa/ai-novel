import { loadCast, loadRecap } from './context'
import type { AiCtx } from './ai'
import { chat, DEFAULT_MODEL } from './openrouter'
import type { stories } from './schema'

const PROMPT = `คุณเป็นบรรณาธิการนิยาย อ่านข้อมูลเรื่องแล้วสกัดรายชื่อตัวละครที่ปรากฏจริงในเรื่อง
สำหรับแต่ละตัวละครให้เขียน:
- name: ชื่อตัวละคร (ใช้การสะกดที่พบบ่อยที่สุดในเรื่อง)
- role: บทบาทสั้นๆ เช่น พระเอก ตัวร้าย เพื่อนร่วมทาง
- profile: 2-3 ประโยค ลักษณะ นิสัย ความสัมพันธ์กับตัวละครอื่น และน้ำเสียงพูด เฉพาะที่ระบุไว้ในเรื่อง ห้ามแต่งเพิ่ม
ตอบเป็น JSON array เท่านั้น ไม่มีข้อความอื่นและไม่ต้องใส่ code fence เช่น [{"name":"...","role":"...","profile":"..."}]
ไม่ต้องรวมตัวละครที่อยู่ในรายการที่มีแล้ว ถ้าไม่มีตัวละครใหม่ให้ตอบ []`

export type Suggestion = { name: string; role: string; profile: string }

/** Ask the model for characters it finds in the story that are not in the cast yet. Nothing is saved: the admin reviews first. */
export async function suggestCharacters(story: typeof stories.$inferSelect, ai?: AiCtx): Promise<Suggestion[]> {
  const [cast, recap] = await Promise.all([loadCast(story.id), loadRecap(story.id)])
  if (!story.premise.trim() && !recap.length) throw new Error('ยังไม่มีข้อมูลให้ดึงตัวละคร ใส่พล็อตตั้งต้นหรือให้ AI เขียนตอนก่อน')

  const model = story.model || DEFAULT_MODEL
  const text = await chat(model, [
    { role: 'system', content: PROMPT },
    { role: 'user', content: [
      story.premise && `พล็อต/ตัวละครตั้งต้น:\n${story.premise}`,
      recap.length && `เรื่องย่อแต่ละตอน:\n${recap.map(c => `ตอนที่ ${c.no}: ${c.text}`).join('\n')}`,
      `ตัวละครที่มีในรายการแล้ว (ห้ามเสนอซ้ำ): ${cast.map(c => c.name).join(', ') || '(ไม่มี)'}`,
    ].filter(Boolean).join('\n\n') },
  ], u => ai?.record('suggest', model, u), ai?.access)

  // models sometimes wrap the array in prose or a code fence; take the outermost [...]
  const raw = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
  let list: unknown
  try { list = JSON.parse(raw) } catch { console.error('[suggestCharacters] unparsable model output:', JSON.stringify(text)); throw new Error('โมเดลตอบไม่อยู่ในรูปแบบที่อ่านได้ ลองกดอีกครั้ง') }
  if (!Array.isArray(list)) throw new Error('โมเดลตอบไม่อยู่ในรูปแบบที่อ่านได้ ลองกดอีกครั้ง')

  const have = new Set(cast.map(c => c.name.trim().toLowerCase()))
  return list
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null && typeof x.name === 'string' && x.name.trim() !== '')
    .map(x => ({ name: String(x.name).trim(), role: String(x.role ?? '').trim(), profile: String(x.profile ?? '').trim() }))
    .filter(x => !have.has(x.name.toLowerCase()))
    .slice(0, 15)
}
