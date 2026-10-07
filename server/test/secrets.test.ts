import { expect, test } from 'bun:test'
import { decryptSecret, encryptSecret } from '../src/secrets'

const S = 'a-long-test-secret-of-at-least-32-chars!'

test('secrets: round-trips, never stores the plain text, and differs every time', () => {
  const key = 'sk-or-v1-abcdef1234567890'
  const a = encryptSecret(key, '7', S), b = encryptSecret(key, '7', S)
  expect(decryptSecret(a, '7', S)).toBe(key)
  expect(a).not.toContain('abcdef')
  expect(a).not.toBe(b) // random IV
  expect(decryptSecret(encryptSecret('ไทย 🔑', '7', S), '7', S)).toBe('ไทย 🔑')
})

test('secrets: bound to its owner, so a copy in someone else\'s row does not decrypt', () => {
  const a = encryptSecret('sk-or-secret', '7', S)
  expect(() => decryptSecret(a, '8', S)).toThrow()
  expect(decryptSecret(a, '7', S)).toBe('sk-or-secret')
})

test('secrets: a wrong secret, a tampered value and junk are rejected', () => {
  const a = encryptSecret('sk-or-secret', '7', S)
  expect(() => decryptSecret(a, '7', 'another-secret-another-secret-123456')).toThrow()
  const [v, iv, tag, ct] = a.split('.')
  const flipped = Buffer.from(ct, 'base64'); flipped[0] ^= 1
  expect(() => decryptSecret([v, iv, tag, flipped.toString('base64')].join('.'), '7', S)).toThrow()
  for (const junk of ['', 'plain', 'v2.a.b.c', 'v1.a.b']) expect(() => decryptSecret(junk, '7', S)).toThrow()
})
