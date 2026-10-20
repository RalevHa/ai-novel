import { afterEach, expect, test } from 'bun:test'
import { chat, streamChat, type Usage } from '../src/openrouter'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })
// there is no site key: every call brings the caller's own (see ai.ts / aiGate)
const own = { apiKey: 'test-key' }
const reply = (body: BodyInit) => { globalThis.fetch = (async () => new Response(body)) as unknown as typeof fetch }

test('streamChat: yields text and reports usage from the final chunk', async () => {
  const sse = [
    { choices: [{ delta: { content: 'สวัส' } }] },
    { choices: [{ delta: { content: 'ดี' } }] },
    { choices: [], usage: { total_tokens: 120, cost: 0.0042 } },
  ].map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n'
  reply(sse)
  let usage: Usage | undefined
  let text = ''
  for await (const d of streamChat('m', [], u => { usage = u }, own)) text += d
  expect(text).toBe('สวัสดี')
  expect(usage).toEqual({ tokens: 120, cost: 0.0042 })
})

test('chat: returns the text and reports usage; a response without usage is fine', async () => {
  reply(JSON.stringify({ choices: [{ message: { content: ' hi ' } }], usage: { total_tokens: 7, cost: 0.001 } }))
  let usage: Usage | undefined
  expect(await chat('m', [], u => { usage = u }, own)).toBe('hi')
  expect(usage).toEqual({ tokens: 7, cost: 0.001 })

  reply(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
  usage = undefined
  expect(await chat('m', [], u => { usage = u }, own)).toBe('ok')
  expect(usage).toBeUndefined()
})

test('chat: without the caller\'s own key a non-local model is refused before any request', async () => {
  let called = false
  globalThis.fetch = (async () => { called = true; return new Response('') }) as unknown as typeof fetch
  await expect(chat('m', [])).rejects.toThrow('คีย์ OpenRouter')
  expect(called).toBe(false)
})
