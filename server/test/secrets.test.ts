import { expect, test } from 'bun:test'
import { decryptSecret, encryptSecret } from '../src/secrets'

const S = 'a-long-test-secret-of-at-least-32-chars!'

test('secrets: round-trips, never stores the plain text, and differs every time', () => {
  const key = 'sk-or-v1-abcdef1234567890'
  const a = encryptSecret(key, S), b = encryptSecret(key, S)
  expect(decryptSecret(a, S)).toBe(key)
  expect(a).not.toContain('abcdef')
  expect(a).not.toBe(b) // random IV
  expect(decryptSecret(encryptSecret('ไทย 🔑', S), S)).toBe('ไทย 🔑')
})

test('secrets: a wrong secret, a tampered value and junk are rejected', () => {
  const a = encryptSecret('sk-or-secret', S)
  expect(() => decryptSecret(a, 'another-secret-another-secret-123456')).toThrow()
  const [v, iv, tag, ct] = a.split('.')
  const flipped = Buffer.from(ct, 'base64'); flipped[0] ^= 1
  expect(() => decryptSecret([v, iv, tag, flipped.toString('base64')].join('.'), S)).toThrow()
  for (const junk of ['', 'plain', 'v2.a.b.c', 'v1.a.b']) expect(() => decryptSecret(junk, S)).toThrow()
})
