import { expect, test } from 'bun:test'
import { fillPlaceholders, isEmail, NO_EMAIL } from '../src/placeholders'

test('fillPlaceholders: fills every occurrence, says so when there is no email, and leaves $ in names alone', () => {
  const s = { operator: 'บริษัท $& จำกัด', contactEmail: 'hi@example.com' }
  expect(fillPlaceholders('{{operator}} · {{contactEmail}} · {{operator}}', s)).toBe('บริษัท $& จำกัด · hi@example.com · บริษัท $& จำกัด')
  expect(fillPlaceholders('ถึง {{contactEmail}}', { operator: 'x', contactEmail: '' })).toBe(`ถึง ${NO_EMAIL}`)
  expect(fillPlaceholders('ไม่มีตัวแทน', s)).toBe('ไม่มีตัวแทน')
})

test('isEmail: plain addresses pass, obvious junk does not', () => {
  expect(isEmail('a@b.co')).toBe(true)
  for (const bad of ['', 'a', 'a@b', '@b.co', 'a b@c.de', 'a@b@c.de']) expect(isEmail(bad)).toBe(false)
})
