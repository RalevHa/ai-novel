// [window, block, min]: does the last `block` chars show up `min`+ times inside the last `window` chars?
// Prose does not do that; a stuck model does. Two scales: a short token loop ("ยง่ ยง่ ยง่ ...")
// and a whole sentence repeated again and again.
const SCALES = [[240, 24, 8], [900, 40, 5]] as const

/** Index where a degenerate loop begins at the end of `text`, or -1 when the text is not looping. */
export function loopStart(text: string) {
  for (const [window, block, min] of SCALES) {
    if (text.length < window) continue
    const tail = text.slice(-window)
    const probe = tail.slice(-block)
    let n = 0
    for (let i = tail.indexOf(probe); i !== -1; i = tail.indexOf(probe, i + 1)) n++
    // the first occurrence of the repeating block is (about) where the loop starts
    if (n >= min) return text.length - window + tail.indexOf(probe)
  }
  return -1
}
