import { expect, test } from 'bun:test'
import { atomFeed } from '../src/feed'

test('atomFeed: escapes text, links to the reader, newest entry sets <updated>', () => {
  const xml = atomFeed(
    { id: 4, title: 'A & <B>', synopsis: '' },
    [{ no: 9, title: '', excerpt: 'บรรทัด\n\nสอง  <x>', at: new Date('2026-10-01T10:00:00Z') }, { no: 8, title: 'ตอนแปด', excerpt: 'x', at: new Date('2026-09-01T00:00:00Z') }],
    'https://novel.example.com',
  )
  expect(xml).toContain('<title>A &amp; &lt;B&gt;</title>')
  expect(xml).toContain('<updated>2026-10-01T10:00:00.000Z</updated>\n<link rel="alternate" href="https://novel.example.com/story/4"/>')
  expect(xml).toContain('<link rel="alternate" href="https://novel.example.com/story/4/read/9"/>')
  expect(xml).toContain('<title>ตอนที่ 9</title>') // untitled chapter falls back to its number
  expect(xml).toContain('<summary>บรรทัด สอง &lt;x&gt;…</summary>')
  expect(xml).not.toContain('<subtitle>')
})
