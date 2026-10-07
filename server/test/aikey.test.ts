import { expect, test } from 'bun:test'
import { parseAiKey } from '../src/aikey'

test('parseAiKey: takes a plausible key (trimmed) and treats anything else as "no key"', () => {
  expect(parseAiKey('  sk-or-v1-abcdefghijklmnopqrstuvwxyz  ')).toBe('sk-or-v1-abcdefghijklmnopqrstuvwxyz')
  for (const bad of [undefined, null, '', '   ', 'short', 'has a space in the middle of it 123', 'x'.repeat(201)]) expect(parseAiKey(bad)).toBeUndefined()
})
