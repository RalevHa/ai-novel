import { expect, test } from 'bun:test'
import { markDone, nextBeat } from '../src/outline'

const outline = '✓ พระเอกตื่นในต่างโลก\nพบเพื่อนร่วมทางคนแรก\n\n  ต่อสู้กับมังกร  '

test('nextBeat: first line that is not ticked, trimmed; undefined when all done', () => {
  expect(nextBeat(outline)).toBe('พบเพื่อนร่วมทางคนแรก')
  expect(nextBeat('✓ a\n✓ b\n')).toBeUndefined()
  expect(nextBeat('')).toBeUndefined()
})

test('markDone: ticks only the first matching line and keeps the rest', () => {
  const next = markDone(outline, 'พบเพื่อนร่วมทางคนแรก')
  expect(next).toBe('✓ พระเอกตื่นในต่างโลก\n✓ พบเพื่อนร่วมทางคนแรก\n\n  ต่อสู้กับมังกร  ')
  expect(nextBeat(next)).toBe('ต่อสู้กับมังกร')
  expect(markDone('ก\nก', 'ก')).toBe('✓ ก\nก')
  expect(markDone('ก', 'ไม่มี')).toBe('ก') // beat edited away meanwhile: nothing changes
})
