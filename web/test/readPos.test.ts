import { expect, test } from 'bun:test'
import { scrollFraction, scrollTarget, touch } from '../src/readPos'

test('scrollFraction: 0-1 of the scrollable range, clamped, short pages are 0', () => {
  expect(scrollFraction(0, 3000, 800)).toBe(0)
  expect(scrollFraction(1100, 3000, 800)).toBe(0.5)
  expect(scrollFraction(5000, 3000, 800)).toBe(1) // overscroll
  expect(scrollFraction(-20, 3000, 800)).toBe(0)
  expect(scrollFraction(0, 700, 800)).toBe(0) // page shorter than the window
})

test('scrollTarget is the inverse of scrollFraction', () => {
  expect(scrollTarget(0.5, 3000, 800)).toBe(1100)
  expect(scrollTarget(2, 3000, 800)).toBe(2200) // clamped to the end
  expect(scrollTarget(0.4, 700, 800)).toBe(0)
  const f = scrollFraction(731, 4000, 900)
  expect(Math.abs(scrollTarget(f, 4000, 900) - 731)).toBeLessThanOrEqual(1)
})

test('touch: moves the key to the end, keeps only the newest `max`, does not mutate', () => {
  const a = { 'x:1': 0.1, 'x:2': 0.2 }
  const b = touch(a, 'x:1', 0.9, 5)
  expect(Object.keys(b)).toEqual(['x:2', 'x:1'])
  expect(b['x:1']).toBe(0.9)
  expect(a).toEqual({ 'x:1': 0.1, 'x:2': 0.2 })
  const c = touch({ a: 1, b: 2, c: 3 }, 'd', 4, 3)
  expect(Object.keys(c)).toEqual(['b', 'c', 'd'])
})
