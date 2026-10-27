export type ContentRating = 'general' | 'teen' | 'adult'

const AGE: Record<ContentRating, number> = { general: 0, teen: 15, adult: 18 }

/** "สำหรับผู้อ่านอายุ 18 ปีขึ้นไป" plus the writer's warnings, or '' for a story anyone may read. */
export function ratingNote(rating: ContentRating, warnings: string) {
  if (rating === 'general') return ''
  const w = warnings.split(',').map(x => x.trim()).filter(Boolean).join(', ')
  return `เนื้อหาสำหรับผู้อ่านอายุ ${AGE[rating]} ปีขึ้นไป${w ? ` · คำเตือน: ${w}` : ''}`
}

/** Previews, feeds and the like must not carry the text or cover of an 18+ story out to places that never showed the gate. */
export const showsText = (rating: ContentRating) => rating !== 'adult'
