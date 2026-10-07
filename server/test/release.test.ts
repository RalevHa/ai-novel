import { expect, test } from 'bun:test'
import { releasedAtFor } from '../src/release'

const d = (s: string) => new Date(s), now = d('2026-10-07T10:00:00Z')
const state = (published: boolean, publishAt: string | null = null, releasedAt: string | null = null) => ({ published, publishAt: publishAt ? d(publishAt) : null, releasedAt: releasedAt ? d(releasedAt) : null })

test('releasedAtFor: a draft published now is released now, however old the draft is', () => {
  expect(releasedAtFor(state(false), { published: true, publishAt: null }, now)).toEqual(now)
})

test('releasedAtFor: a scheduled chapter is released at its time, and moves when rescheduled', () => {
  expect(releasedAtFor(state(false), { published: true, publishAt: d('2026-10-09T08:00:00Z') }, now)).toEqual(d('2026-10-09T08:00:00Z'))
  expect(releasedAtFor(state(true, '2026-10-09T08:00:00Z', '2026-10-09T08:00:00Z'), { published: true, publishAt: d('2026-10-10T08:00:00Z') }, now)).toEqual(d('2026-10-10T08:00:00Z'))
})

test('releasedAtFor: "publish now" on a scheduled chapter releases it now; saving an already-live chapter keeps its time', () => {
  expect(releasedAtFor(state(true, '2026-10-09T08:00:00Z', '2026-10-09T08:00:00Z'), { published: true, publishAt: null }, now)).toEqual(now)
  expect(releasedAtFor(state(true, null, '2026-10-01T00:00:00Z'), { published: true, publishAt: null }, now)).toEqual(d('2026-10-01T00:00:00Z'))
})

test('releasedAtFor: hiding clears it, so showing it again counts as new', () => {
  expect(releasedAtFor(state(true, null, '2026-10-01T00:00:00Z'), { published: false, publishAt: null }, now)).toBeNull()
})
