import { afterAll, expect, test } from 'bun:test'
import { chat, streamChat, type Usage } from '../src/openrouter'

// a stand-in for Ollama: a real HTTP server on localhost speaking the OpenAI chat-completions format
const seen: { url: string; auth: string | null; body: any }[] = []
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const body = await req.json() as any
    seen.push({ url: new URL(req.url).pathname, auth: req.headers.get('authorization'), body })
    if (!body.stream) return Response.json({ choices: [{ message: { content: ' สรุป ' } }], usage: { total_tokens: 42 } })
    const sse = [{ choices: [{ delta: { content: 'สวัส' } }] }, { choices: [{ delta: { content: 'ดี' } }] }, { choices: [], usage: { total_tokens: 99 } }]
    return new Response(sse.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n')
  },
})
afterAll(() => server.stop(true))
process.env.LOCAL_BASE_URL = `http://localhost:${server.port}/v1/`

test('local: models go to the local server with the prefix stripped, no OpenRouter key, usage has tokens but no cost', async () => {
  let usage: Usage | undefined
  expect(await chat('local:scb10x/typhoon2.1-gemma3-12b', [{ role: 'user', content: 'x' }], u => { usage = u })).toBe('สรุป')
  expect(seen[0]).toMatchObject({ url: '/v1/chat/completions', auth: null })
  expect(seen[0].body.model).toBe('scb10x/typhoon2.1-gemma3-12b')
  expect(usage).toEqual({ tokens: 42, cost: 0 })
})

test('local: streaming asks the server for usage and yields the text', async () => {
  let usage: Usage | undefined, text = ''
  for await (const d of streamChat('local:gemma4:12b', [{ role: 'user', content: 'x' }], u => { usage = u })) text += d
  const req = seen.at(-1)!
  expect(req.body).toMatchObject({ model: 'gemma4:12b', stream: true, stream_options: { include_usage: true } })
  expect(text).toBe('สวัสดี')
  expect(usage).toEqual({ tokens: 99, cost: 0 })
})

test('local: a key is sent only when LOCAL_API_KEY is set', async () => {
  process.env.LOCAL_API_KEY = 'secret'
  await chat('local:m', [])
  delete process.env.LOCAL_API_KEY
  expect(seen.at(-1)!.auth).toBe('Bearer secret')
})

test('local: a server that is not running gives a clear message', async () => {
  process.env.LOCAL_BASE_URL = 'http://localhost:1/v1'
  await expect(chat('local:m', [])).rejects.toThrow('เปิด Ollama อยู่หรือเปล่า')
  process.env.LOCAL_BASE_URL = `http://localhost:${server.port}/v1/`
})
