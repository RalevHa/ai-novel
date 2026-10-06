import { expect, test } from 'bun:test'
import { chromeHidden, leadingValue, readingMinutes, swipeDir } from '../src/reader'

test('swipeDir: needs a long, mostly horizontal move that does not start at the screen edge', () => {
  expect(swipeDir(-120, 10, 200, 390)).toBe(1) // left = next
  expect(swipeDir(120, -10, 200, 390)).toBe(-1) // right = previous
  expect(swipeDir(-40, 0, 200, 390)).toBe(0) // too short
  expect(swipeDir(-120, 100, 200, 390)).toBe(0) // diagonal: the reader is scrolling
  expect(swipeDir(120, 0, 8, 390)).toBe(0) // starts at the edge (browser back gesture)
  expect(swipeDir(-120, 0, 380, 390)).toBe(0)
})

test('chromeHidden: hides on scroll down, returns on scroll up, always shown near the top, ignores jitter', () => {
  expect(chromeHidden(false, 500, 40)).toBe(true)
  expect(chromeHidden(true, 460, -40)).toBe(false)
  expect(chromeHidden(true, 40, 10)).toBe(false) // near the top
  expect(chromeHidden(true, 500, 3)).toBe(true) // tiny moves keep the state
  expect(chromeHidden(false, 500, -3)).toBe(false)
})

test('readingMinutes: about 1,000 Thai characters per minute, images and markup do not count, at least 1', () => {
  expect(readingMinutes('สั้น')).toBe(1)
  expect(readingMinutes('ก'.repeat(3000))).toBe(3)
  expect(readingMinutes(`${'ก'.repeat(2000)}\n\n![รูป ที่ยาวมาก](/api/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png "${'ข'.repeat(5000)}")`)).toBe(2)
  expect(readingMinutes(`## ${'ก '.repeat(1500)}`)).toBe(2) // spaces and heading marks are skipped
})

test('leadingValue: tight/loose are fixed, normal depends on the typeface', () => {
  expect([leadingValue('tight', 'serif'), leadingValue('loose', 'sans')]).toEqual([1.8, 2.3])
  expect([leadingValue('normal', 'serif'), leadingValue('normal', 'sans')]).toEqual([2.05, 1.95])
})
