import { expect, test } from 'bun:test'
import { issuedBeforeChange } from '../src/auth'

test('issuedBeforeChange: tokens older than the last password change are refused, newer or same-second ones are not', () => {
  expect(issuedBeforeChange(1000, 0)).toBe(false) // password never changed
  expect(issuedBeforeChange(999, 1000.4)).toBe(true) // issued before
  expect(issuedBeforeChange(1000, 1000.4)).toBe(false) // signed in within the same second as the reset
  expect(issuedBeforeChange(1001, 1000.4)).toBe(false)
  expect(issuedBeforeChange(undefined, 1000)).toBe(true) // no iat at all cannot prove it is newer
})
