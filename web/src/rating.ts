import { ref } from 'vue'
import { lsGet, lsSet } from './ls'

// Content rating of a story. The gate is a courtesy, not access control: the reader says they are old enough (nothing about age is stored on the
// server), and the answer is remembered on this device. Writers and admins never see it.
export type ContentRating = 'general' | 'teen' | 'adult'

export const RATING_OPTIONS = [{ k: 'general', n: 'ทั่วไป' }, { k: 'teen', n: '15+' }, { k: 'adult', n: '18+' }] as const
const AGE: Record<ContentRating, number> = { general: 0, teen: 15, adult: 18 }

/** "15+" / "18+", or '' for a story anyone may read. */
export const ratingBadge = (r: ContentRating | undefined) => r && AGE[r] ? `${AGE[r]}+` : ''
export const ratingAge = (r: ContentRating) => AGE[r]

/** The writer's warnings as separate tags. */
export const warningTags = (warnings = '') => warnings.split(/[,،、]/).map(t => t.trim()).filter(Boolean)

/** Must the reader confirm their age first? `age` is the highest age they confirmed on this device (0 = none). */
export const needsGate = (r: ContentRating | undefined, age: number, canWrite: boolean) => !canWrite && !!r && AGE[r] > age

/** Highest age confirmed on this device; reactive so every gate opens at once. */
export const confirmedAge = ref(Number(lsGet('ageOk')) || 0)
export function confirmAge(r: ContentRating) {
  confirmedAge.value = Math.max(confirmedAge.value, AGE[r])
  lsSet('ageOk', String(confirmedAge.value))
}
