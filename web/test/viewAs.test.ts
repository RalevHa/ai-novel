import { afterEach, expect, test } from 'bun:test'
import { guardedFetch, setViewAs } from '../src/viewAs'

const real = globalThis.fetch
afterEach(() => { globalThis.fetch = real; setViewAs(null) })

test('guardedFetch: a preview only reads (and may log out)', async () => {
  const seen: string[] = []
  globalThis.fetch = (async (u: RequestInfo | URL) => { seen.push(String(u)); return new Response('ok') }) as typeof fetch

  await guardedFetch('/api/x', { method: 'DELETE' }) // not previewing: goes through
  setViewAs('user')
  const blocked = await guardedFetch('/api/x', { method: 'POST' })
  await guardedFetch('/api/y') // GET
  await guardedFetch('/api/auth/logout', { method: 'POST' })

  expect(blocked.status).toBe(403)
  expect(seen).toEqual(['/api/x', '/api/y', '/api/auth/logout'])
})
