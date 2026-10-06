import { expect, test } from 'bun:test'
import { imageNames, normalizeParagraphs, stripImages } from '../src/markdown'

const A = '11111111-1111-1111-1111-111111111111.png'
const B = '22222222-2222-2222-2222-222222222222.webp'

test('normalizeParagraphs: one blank line between paragraphs, CRLF and trailing spaces gone', () => {
  expect(normalizeParagraphs('a  \r\nb\r\n\r\n\r\nc\n')).toBe('a\n\nb\n\nc')
})

test('imageNames: unique uploaded names only', () => {
  const md = `![x](/api/uploads/${A})\ntext ![y](/api/uploads/${B} "cap") ![z](/api/uploads/${A}) ![e](https://e.com/a.png)`
  expect(imageNames(md)).toEqual([A, B])
})

test('stripImages: drops images (even with parentheses in the caption) and tidies blank lines', () => {
  expect(stripImages(`ก่อน\n\n![a](/api/uploads/${A} "รูป (หนึ่ง)")\n\nหลัง`)).toBe('ก่อน\n\nหลัง')
})
