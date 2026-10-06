import { expect, test } from 'bun:test'
import { NAME_RE, sniffImage } from '../src/uploads'

const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
const ascii = (s: string) => [...s].map(c => c.charCodeAt(0))

test('sniffImage: trusts magic bytes only', () => {
  expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47))).toBe('png')
  expect(sniffImage(bytes(0xff, 0xd8, 0xff))).toBe('jpg')
  expect(sniffImage(bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')))).toBe('webp')
  expect(sniffImage(bytes(...ascii('GIF89a')))).toBeNull()
  expect(sniffImage(bytes(...ascii('<svg xmlns=')))).toBeNull() // SVG is deliberately refused
  expect(sniffImage(new Uint8Array())).toBeNull()
})

test('NAME_RE: only generated names are served (no traversal)', () => {
  expect(NAME_RE.test(`${crypto.randomUUID()}.png`)).toBe(true)
  expect(NAME_RE.test('../.env')).toBe(false)
  expect(NAME_RE.test(`${crypto.randomUUID()}.svg`)).toBe(false)
  expect(NAME_RE.test(`x/${crypto.randomUUID()}.png`)).toBe(false)
})
