// A story's outline is plain text, one planned chapter per line. Written beats get a "✓ " prefix.
const DONE = '✓'

/** The first planned chapter that has not been written yet. */
export const nextBeat = (outline: string) => outline.split('\n').map(l => l.trim()).find(l => l && !l.startsWith(DONE))

/** Tick off `beat` (the first line that matches it). */
export function markDone(outline: string, beat: string) {
  const lines = outline.split('\n')
  const i = lines.findIndex(l => l.trim() === beat)
  if (i !== -1) lines[i] = `${DONE} ${beat}`
  return lines.join('\n')
}
