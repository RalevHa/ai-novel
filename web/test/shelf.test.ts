import { expect, test } from 'bun:test'
import { isRecent, shelf, type ShelfStory } from '../src/shelf'

const s = (id: number, title: string, o: Partial<ShelfStory> = {}): ShelfStory => ({ id, title, chapterCount: 1, createdAt: `2026-09-0${id} 10:00:00`, updatedAt: `2026-09-0${id} 10:00:00`, ...o })
const all = [
  s(1, 'ราชันย์แห่งเมฆา', { genre: 'Isekai', mood: 'ผจญภัย', chapterCount: 40, updatedAt: '2026-09-09 10:00:00' }),
  s(2, 'จดหมายถึงเธอ', { genre: 'Romance', synopsis: 'ฤดูฝนที่เหมือนกัน', chapterCount: 3 }),
  s(3, 'คดีลับ', { genre: 'Mystery', chapterCount: 12, updatedAt: null }),
]
const ids = (r: ShelfStory[]) => r.map(x => x.id)

test('shelf: sorts by recent update (falling back to creation), newest, or chapter count', () => {
  expect(ids(shelf(all, { q: '', genre: null, sort: 'updated' }))).toEqual([1, 3, 2]) // 1 updated 9th; 3 has no chapters yet: created 3rd; 2 updated 2nd
  expect(ids(shelf(all, { q: '', genre: null, sort: 'newest' }))).toEqual([3, 2, 1])
  expect(ids(shelf(all, { q: '', genre: null, sort: 'chapters' }))).toEqual([1, 3, 2])
})

test('shelf: search is case-insensitive over title, genre, mood and synopsis; blank query matches all', () => {
  expect(ids(shelf(all, { q: 'MYSTERY', genre: null, sort: 'newest' }))).toEqual([3])
  expect(ids(shelf(all, { q: 'ผจญ', genre: null, sort: 'newest' }))).toEqual([1])
  expect(ids(shelf(all, { q: 'ฤดูฝน', genre: null, sort: 'newest' }))).toEqual([2])
  expect(ids(shelf(all, { q: '   ', genre: null, sort: 'newest' }))).toEqual([3, 2, 1])
  expect(shelf(all, { q: 'ไม่มีแน่นอน', genre: null, sort: 'newest' })).toEqual([])
})

test('shelf: combines genre and id filters, and leaves the input untouched', () => {
  const copy = [...all]
  expect(ids(shelf(all, { q: '', genre: 'Romance', sort: 'newest' }))).toEqual([2])
  expect(ids(shelf(all, { q: '', genre: null, sort: 'newest', ids: new Set([1, 3]) }))).toEqual([3, 1])
  expect(ids(shelf(all, { q: 'เมฆา', genre: 'Romance', sort: 'newest' }))).toEqual([])
  expect(all).toEqual(copy)
})

test('isRecent: within 24 h, not older, not far in the future, never for null', () => {
  const now = Date.parse('2026-10-06T12:00:00Z')
  expect(isRecent('2026-10-06 03:00:00', now)).toBe(true) // 9 h ago (DB times are UTC)
  expect(isRecent('2026-10-05 11:00:00', now)).toBe(false) // 25 h ago
  expect(isRecent('2026-10-07 12:00:00', now)).toBe(false)
  expect(isRecent(null, now)).toBe(false)
})
