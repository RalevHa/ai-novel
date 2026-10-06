import { expect, test } from 'bun:test'
import { loopStart } from '../src/guard'

// the server checks after every streamed delta, so feed the text in small chunks and stop at the first hit
function firstHit(text: string, step = 10) {
  for (let n = step; n <= text.length; n += step) {
    const at = loopStart(text.slice(0, n))
    if (at !== -1) return at
  }
  return -1
}

test('loopStart: normal prose is not a loop', () => {
  expect(loopStart('สั้นๆ')).toBe(-1)
  expect(firstHit(Array.from({ length: 400 }, (_, i) => `คำที่${i} `).join(''))).toBe(-1)
})

test('loopStart: a repeating token is caught right where it starts', () => {
  const intro = Array.from({ length: 30 }, (_, i) => `ประโยคที่${i}ของเนื้อเรื่อง `).join('')
  const at = firstHit(intro + 'ยง่ '.repeat(300))
  expect(at).toBeGreaterThanOrEqual(intro.length)
  expect(at).toBeLessThan(intro.length + 20)
})

test('loopStart: a repeating sentence is caught and the intro is kept', () => {
  const intro = Array.from({ length: 40 }, (_, i) => `ประโยคที่${i}ของเนื้อเรื่อง `).join('')
  const at = firstHit(intro + 'ฉันเดินไปที่ตลาดเพื่อซื้อผลไม้สดๆ มาฝากแม่ '.repeat(40))
  expect(at).toBeGreaterThanOrEqual(intro.length)
  expect(at).toBeLessThan(intro.length + 100)
})
