import { expect, test } from 'bun:test'
import { atomFeed } from '../src/feed'
import { cardFor } from '../src/og'
import { ratingNote, showsText } from '../src/rating'

test('ratingNote: nothing for general, age plus tidy warnings otherwise', () => {
  expect(ratingNote('general', 'ความรุนแรง')).toBe('')
  expect(ratingNote('teen', '')).toBe('เนื้อหาสำหรับผู้อ่านอายุ 15 ปีขึ้นไป')
  expect(ratingNote('adult', ' ความรุนแรง,, ภาษารุนแรง ')).toBe('เนื้อหาสำหรับผู้อ่านอายุ 18 ปีขึ้นไป · คำเตือน: ความรุนแรง, ภาษารุนแรง')
})

test('showsText: only 18+ hides its text from previews and feeds', () => {
  expect([showsText('general'), showsText('teen'), showsText('adult')]).toEqual([true, true, false])
})

const story = { title: 'เรื่อง', synopsis: 'เรื่องย่อ', coverImage: 'c.png', warnings: 'ความรุนแรง' }
const chapter = { title: 'ตอนหนึ่ง', excerpt: 'ข้อความต้นตอน' }

test('cardFor: an open story shows its excerpt and cover, an 18+ one only the age note', () => {
  const open = cardFor({ ...story, contentRating: 'teen' }, chapter, 1, 7, 'https://x')
  expect(open).toEqual({ title: 'เรื่อง · ตอนหนึ่ง', description: 'ข้อความต้นตอน', url: 'https://x/story/7/read/1', image: 'https://x/api/uploads/c.png' })
  const adult = cardFor({ ...story, contentRating: 'adult' }, chapter, 1, 7, 'https://x')
  expect(adult.description).toBe('เนื้อหาสำหรับผู้อ่านอายุ 18 ปีขึ้นไป · คำเตือน: ความรุนแรง')
  expect(adult.image).toBeUndefined()
  expect(JSON.stringify(adult)).not.toContain('ข้อความต้นตอน')
  expect(cardFor({ ...story, contentRating: 'adult' }, undefined, undefined, 7, 'https://x').description).not.toContain('เรื่องย่อ') // the story card hides the synopsis too
})

test('atomFeed: an 18+ story lists chapter titles without excerpts or synopsis', () => {
  const items = [{ no: 1, title: 'ตอนหนึ่ง', excerpt: 'ข้อความลับ', at: new Date('2026-10-01T10:00:00Z') }]
  const xml = atomFeed({ id: 4, title: 'ก', synopsis: 'เรื่องย่อ', contentRating: 'adult' }, items, 'https://x')
  expect(xml).toContain('<title>ตอนหนึ่ง</title>')
  expect(xml).not.toMatch(/ข้อความลับ|เรื่องย่อ|<summary>|<subtitle>/)
  expect(atomFeed({ id: 4, title: 'ก', synopsis: 'เรื่องย่อ', contentRating: 'general' }, items, 'https://x')).toContain('<summary>ข้อความลับ…</summary>')
})
