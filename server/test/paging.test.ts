import { expect, test } from 'bun:test'
import { pageOf, paging } from '../src/paging'

test('pageOf', () => {
  expect(pageOf(0, 20)).toBe(1) // newest item is on page 1
  expect(pageOf(19, 20)).toBe(1)
  expect(pageOf(20, 20)).toBe(2)
  expect(pageOf(45, 10)).toBe(5)
})

test('paging', () => {
  expect(paging({}, 120, 'first')).toEqual({ page: 1, size: 50, offset: 0 })
  expect(paging({}, 120, 'last')).toEqual({ page: 3, size: 50, offset: 100 })
  expect(paging({ page: 9 }, 120, 'first')).toEqual({ page: 3, size: 50, offset: 100 }) // past the end is clamped
  expect(paging({ page: 2, size: 20 }, 120, 'last')).toEqual({ page: 2, size: 20, offset: 20 })
  expect(paging({}, 0, 'last')).toEqual({ page: 1, size: 50, offset: 0 }) // empty list still has page 1
})
