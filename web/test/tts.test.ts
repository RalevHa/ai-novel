import { expect, test } from 'bun:test'
import { chunks } from '../src/tts'

test('chunks: paragraphs stay apart, pieces stay under the limit, nothing is lost', () => {
  const text = `${'คำสั้น '.repeat(60)}\n\nย่อหน้าสอง`
  const out = chunks(text, 50)
  expect(out.every(c => c.length <= 50)).toBe(true)
  expect(out.at(-1)).toBe('ย่อหน้าสอง')
  expect(out.join(' ').replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''))
})

test('chunks: a long run without spaces is cut hard, short text is untouched, blanks vanish', () => {
  expect(chunks('ก'.repeat(25), 10)).toEqual(['ก'.repeat(10), 'ก'.repeat(10), 'ก'.repeat(5)])
  expect(chunks('สวัสดี')).toEqual(['สวัสดี'])
  expect(chunks('\n\n  \n')).toEqual([])
})
