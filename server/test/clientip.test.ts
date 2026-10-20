import { afterEach, expect, test } from 'bun:test'
import { clientIp } from '../src/clientip'

afterEach(() => { delete process.env.TRUST_CLOUDFLARE })
const req = (ip?: string) => new Request('http://x/', { headers: ip ? { 'cf-connecting-ip': ip } : {} })
const sock = { requestIP: () => ({ address: '127.0.0.1' }) }

test('clientIp: the socket address by default, a CF-Connecting-IP header is ignored', () => {
  expect(clientIp(req('203.0.113.9'), sock)).toBe('127.0.0.1')
})

test('clientIp: with TRUST_CLOUDFLARE the header wins; without one it falls back to the socket', () => {
  process.env.TRUST_CLOUDFLARE = 'true'
  expect(clientIp(req('203.0.113.9'), sock)).toBe('203.0.113.9')
  expect(clientIp(req(), sock)).toBe('127.0.0.1')
  expect(clientIp(req(), null)).toBeUndefined()
})
