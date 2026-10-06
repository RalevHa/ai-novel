// Pure helpers for the reading page (kept apart from the component so they can be tested).

export const MEASURES = { narrow: 560, normal: 680, wide: 820 } as const // text column width, px
export type Measure = keyof typeof MEASURES
export const MEASURE_OPTIONS = [{ k: 'narrow', n: 'แคบ' }, { k: 'normal', n: 'ปกติ' }, { k: 'wide', n: 'กว้าง' }] as const

export type Leading = 'tight' | 'normal' | 'loose'
export const LEADING_OPTIONS = [{ k: 'tight', n: 'กระชับ' }, { k: 'normal', n: 'ปกติ' }, { k: 'loose', n: 'โปร่ง' }] as const
/** Line height: "normal" keeps the typeface's own default (serif reads looser than sans). */
export const leadingValue = (leading: Leading, face: 'serif' | 'sans') => ({ tight: 1.8, loose: 2.3, normal: face === 'sans' ? 1.95 : 2.05 })[leading]

/** Roughly how long a chapter takes to read. Thai has no spaces, so count characters: about 1,000 a minute. */
export function readingMinutes(markdown: string) {
  const chars = markdown.replace(/!\[[^\]]*\]\((?:[^)"]|"[^"]*")*\)/g, '').replace(/[\s#*_>`~-]/g, '').length
  return Math.max(1, Math.round(chars / 1000))
}

/**
 * A horizontal swipe on a touch screen: 1 = to the left (next chapter), -1 = to the right (previous), 0 = not a swipe.
 * Must be mostly horizontal and long enough, and must not start at the screen edges (the browser's own back gesture lives there).
 */
export function swipeDir(dx: number, dy: number, startX: number, width: number, min = 70, edge = 24) {
  if (startX < edge || startX > width - edge) return 0
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.8) return 0
  return dx < 0 ? 1 : -1
}

/** Header visibility while reading: gone when scrolling down, back when scrolling up or near the top. `dy` = scroll change since last event. */
export function chromeHidden(hidden: boolean, y: number, dy: number) {
  if (y < 80) return false
  if (dy > 6) return true
  if (dy < -6) return false
  return hidden
}
