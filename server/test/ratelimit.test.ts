import { expect, test } from 'bun:test'
import { forgive, limited } from '../src/ratelimit'

test('limited: allows `max` hits, then blocks; keys are independent; forgive resets', () => {
  expect([1, 2, 3].map(() => limited('a', 2, 60_000))).toEqual([false, false, true])
  expect(limited('b', 2, 60_000)).toBe(false)
  forgive('a')
  expect(limited('a', 2, 60_000)).toBe(false)
})

test('limited: an expired window starts over', () => {
  expect([1, 2, 3].map(() => limited('c', 1, 0))).toEqual([false, false, false])
})
