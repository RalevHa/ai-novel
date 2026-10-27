import { expect, test } from 'bun:test'
import { allTags, shelf } from '../src/shelf'
import { needsGate, ratingBadge, warningTags } from '../src/rating'

test('needsGate: confirming 18+ also covers 15+, writers skip it, general never asks', () => {
  expect(needsGate('general', 0, false)).toBe(false)
  expect(needsGate('teen', 0, false)).toBe(true)
  expect(needsGate('teen', 15, false)).toBe(false)
  expect(needsGate('adult', 15, false)).toBe(true)
  expect(needsGate('adult', 18, false)).toBe(false)
  expect(needsGate('adult', 0, true)).toBe(false)
  expect(needsGate(undefined, 0, false)).toBe(false) // an old response without the field
})

test('ratingBadge and warningTags', () => {
  expect([ratingBadge('general'), ratingBadge('teen'), ratingBadge('adult'), ratingBadge(undefined)]).toEqual(['', '15+', '18+', ''])
  expect(warningTags(' ความรุนแรง,, ภาษารุนแรง ')).toEqual(['ความรุนแรง', 'ภาษารุนแรง'])
  expect(warningTags()).toEqual([])
})

test('shelf: hideAdult drops 18+ stories only', () => {
  const s = (id: number, contentRating: 'general' | 'teen' | 'adult') => ({ id, title: `t${id}`, chapterCount: 1, createdAt: null, updatedAt: null, contentRating })
  const all = [s(1, 'general'), s(2, 'teen'), s(3, 'adult')]
  const o = { q: '', genre: null, sort: 'newest' as const }
  expect(shelf(all, o).map(x => x.id).sort()).toEqual([1, 2, 3])
  expect(shelf(all, { ...o, hideAdult: true }).map(x => x.id).sort()).toEqual([1, 2])
  expect(allTags(all)).toEqual([])
})
