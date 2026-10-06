// Covers are generated from the title + genre: no image upload needed, and the same story always looks the same.
const KANJI: [RegExp, string][] = [
  [/isekai|ต่างโลก/i, '異世界'],
  [/slice|ชีวิต|โรงเรียน|school/i, '日常'],
  [/horror|สยอง|ผี/i, '怪談'],
  [/romance|รัก/i, '恋'],
  [/fantasy|แฟนตาซี/i, '幻想'],
  [/mystery|สืบสวน|ลึกลับ/i, '謎'],
  [/sci|ไซไฟ/i, '星'],
  [/drama|ดราม่า|seinen/i, '人生'],
]
export const kanjiFor = (genre = '') => KANJI.find(([re]) => re.test(genre))?.[1] ?? '物語'

// Traditional-colour pairs (藍, 青磁, 葡萄, 黄土, 紅梅, 紺) so every cover stays harmonious.
const PAIRS: [string, string][] = [
  ['#1F3A66', '#4C7DB8'], ['#2F6F69', '#7BB8AC'], ['#4A2E5C', '#9A6FA6'],
  ['#7A4A12', '#C98A1B'], ['#5C3047', '#C27A8E'], ['#141C33', '#3A4A7A'],
]

export function coverVars(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  const [a, b] = PAIRS[h % PAIRS.length]
  return { '--a': a, '--b': b, '--sx': `${10 + (h >> 3) % 40}%`, '--sy': `${12 + (h >> 7) % 22}%` }
}

/** Postgres timestamps come back as "2026-10-06 09:14:02.156" (UTC, no zone marker). */
export const parseDb = (v: string | Date | null | undefined) =>
  v ? (v instanceof Date ? v : new Date(v.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? '' : 'Z'))) : null

export const fmtDate = (v: string | Date | null | undefined) =>
  parseDb(v)?.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) ?? ''

export const fmtDateTime = (v: string | Date | null | undefined) =>
  parseDb(v)?.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) ?? ''

/** DB time (UTC) to the value a <input type="datetime-local"> wants (local time); '' when unset. */
export function toLocalInput(v: string | Date | null | undefined) {
  const d = parseDb(v)
  if (!d) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
/** A datetime-local value (local time) to an ISO string the API accepts; null when empty. */
export const fromLocalInput = (s: string) => (s ? new Date(s).toISOString() : null)

/** OpenRouter credits are USD; chapters cost cents, so keep enough digits to tell them apart. */
export const fmtCost = (usd: number) => `$${usd.toFixed(usd < 0.1 ? 4 : 2)}`

/** The model often starts titles with "ตอนที่ N:"; the UI already shows the number. */
export const stripChapterPrefix = (title: string) => title.replace(/^(ตอนที่|บทที่|ตอนท่|ตอน)\s*\d+\s*[:：·\-–]?\s*/, '').trim()
