import { parseDb } from './genre'

// Search / filter / sort for the home shelf (and the rating used for its "top rated" order). The shelf endpoint is not paginated, so this runs in the browser.

export type ShelfStory = {
  id: number; title: string; synopsis?: string; genre?: string; mood?: string
  chapterCount: number; createdAt: string | Date | null; updatedAt: string | Date | null
  rating?: number | null; ratingCount?: number // average stars (null = no reviews) and how many reviews
}

export const SORTS = [{ k: 'updated', n: 'ล่าสุด' }, { k: 'newest', n: 'ใหม่สุด' }, { k: 'chapters', n: 'ตอนมาก' }, { k: 'rating', n: 'คะแนน' }] as const
export type Sort = (typeof SORTS)[number]['k']

const time = (v: string | Date | null | undefined) => parseDb(v)?.getTime() ?? 0

/** Average stars pulled toward 3.5 until a story has a few reviews, so one 5-star review does not outrank a well-reviewed 4.6. Unrated = 0 (last). */
export const ratingScore = (s: { rating?: number | null; ratingCount?: number }) => {
  const n = s.ratingCount ?? 0
  return n && s.rating ? (s.rating * n + 3.5 * 2) / (n + 2) : 0
}

/** A story's genre field holds one or more tags separated by commas ("Isekai, Slice of Life"). */
export const genreTags = (genre = '') => genre.split(/[,،、]/).map(t => t.trim()).filter(Boolean)

/** Distinct tags across stories, case-insensitive ("isekai" and "Isekai" are one chip), first spelling wins. */
export const allTags = (stories: { genre?: string }[]) => {
  const seen = new Map<string, string>()
  for (const t of stories.flatMap(s => genreTags(s.genre))) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t)
  return [...seen.values()]
}

/** Stories matching the text, genre and (optionally) an id whitelist, in the chosen order. Does not touch the input. */
export function shelf<T extends ShelfStory>(all: T[], o: { q: string; genre: string | null; sort: Sort; ids?: Set<number> | null }): T[] {
  const q = o.q.trim().toLowerCase()
  const hit = (s: T) => !q || [s.title, s.genre, s.mood, s.synopsis].some(f => f?.toLowerCase().includes(q))
  const updated = (s: T) => time(s.updatedAt) || time(s.createdAt)
  const order: Record<Sort, (a: T, b: T) => number> = {
    updated: (a, b) => updated(b) - updated(a) || b.id - a.id,
    newest: (a, b) => time(b.createdAt) - time(a.createdAt) || b.id - a.id,
    chapters: (a, b) => b.chapterCount - a.chapterCount || updated(b) - updated(a),
    rating: (a, b) => ratingScore(b) - ratingScore(a) || (b.ratingCount ?? 0) - (a.ratingCount ?? 0) || updated(b) - updated(a),
  }
  return all.filter(s => (!o.genre || genreTags(s.genre).some(t => t.toLowerCase() === o.genre!.toLowerCase())) && (!o.ids || o.ids.has(s.id)) && hit(s)).sort(order[o.sort])
}

/** Updated within the last `hours` (the "new chapter" badge). */
export const isRecent = (updatedAt: string | Date | null | undefined, now = Date.now(), hours = 24) => {
  const t = time(updatedAt)
  return t > 0 && now - t < hours * 3600_000 && now - t >= -60_000
}
