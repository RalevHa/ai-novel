import { parseDb } from './genre'

// Search / filter / sort for the home shelf. The shelf endpoint is not paginated, so this runs in the browser.

export type ShelfStory = {
  id: number; title: string; synopsis?: string; genre?: string; mood?: string
  chapterCount: number; createdAt: string | Date | null; updatedAt: string | Date | null
}

export const SORTS = [{ k: 'updated', n: 'ล่าสุด' }, { k: 'newest', n: 'ใหม่สุด' }, { k: 'chapters', n: 'ตอนมาก' }] as const
export type Sort = (typeof SORTS)[number]['k']

const time = (v: string | Date | null | undefined) => parseDb(v)?.getTime() ?? 0

/** Stories matching the text, genre and (optionally) an id whitelist, in the chosen order. Does not touch the input. */
export function shelf<T extends ShelfStory>(all: T[], o: { q: string; genre: string | null; sort: Sort; ids?: Set<number> | null }): T[] {
  const q = o.q.trim().toLowerCase()
  const hit = (s: T) => !q || [s.title, s.genre, s.mood, s.synopsis].some(f => f?.toLowerCase().includes(q))
  const updated = (s: T) => time(s.updatedAt) || time(s.createdAt)
  const order: Record<Sort, (a: T, b: T) => number> = {
    updated: (a, b) => updated(b) - updated(a) || b.id - a.id,
    newest: (a, b) => time(b.createdAt) - time(a.createdAt) || b.id - a.id,
    chapters: (a, b) => b.chapterCount - a.chapterCount || updated(b) - updated(a),
  }
  return all.filter(s => (!o.genre || s.genre === o.genre) && (!o.ids || o.ids.has(s.id)) && hit(s)).sort(order[o.sort])
}

/** Updated within the last `hours` (the "new chapter" badge). */
export const isRecent = (updatedAt: string | Date | null | undefined, now = Date.now(), hours = 24) => {
  const t = time(updatedAt)
  return t > 0 && now - t < hours * 3600_000 && now - t >= -60_000
}
