import { onBeforeUnmount, ref } from 'vue'
import { lsGet, lsSet } from './ls'

/** Browsers cut long utterances short (Chrome stops after ~15 s), so the text is read in pieces. Breaks fall on whitespace where possible. */
export function chunks(text: string, max = 180) {
  const out: string[] = []
  for (const para of text.split(/\n+/)) {
    let cur = ''
    for (let w of para.split(/(?<=\s)/)) {
      while (w.length > max) { // Thai without spaces: no better place to cut
        if (cur) { out.push(cur.trim()); cur = '' }
        out.push(w.slice(0, max)); w = w.slice(max)
      }
      if (cur && (cur + w).length > max) { out.push(cur.trim()); cur = '' }
      cur += w
    }
    if (cur.trim()) out.push(cur.trim())
  }
  return out.filter(Boolean)
}

export const RATES = [{ k: '0.8', n: 'ช้า' }, { k: '1', n: 'ปกติ' }, { k: '1.25', n: 'เร็ว' }, { k: '1.5', n: 'เร็วมาก' }] as const

/** Read-aloud with the browser's built-in speech synthesis (no server, no cost). Quality depends on the Thai voice the device has. */
export function useSpeech() {
  const synth = typeof speechSynthesis === 'undefined' ? null : speechSynthesis
  const supported = !!synth
  const speaking = ref(false), paused = ref(false)
  const rate = ref(RATES.some(r => r.k === lsGet('ttsRate')) ? lsGet('ttsRate')! : '1')
  let queue: string[] = [], run = 0, done: (() => void) | undefined

  /** false when voices are loaded and none of them is Thai (reading Thai with another voice is gibberish). */
  const hasThaiVoice = () => { const v = synth!.getVoices(); return !v.length || v.some(x => x.lang.toLowerCase().startsWith('th')) }

  function next(id: number) {
    if (id !== run) return
    const text = queue.shift()
    if (!text) { speaking.value = false; const cb = done; done = undefined; cb?.(); return }
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'th-TH'
    u.voice = synth!.getVoices().find(v => v.lang.toLowerCase().startsWith('th')) ?? null
    u.rate = Number(rate.value)
    u.onend = () => next(id)
    u.onerror = () => { if (id === run) stop() }
    synth!.speak(u)
  }

  /** Start reading `text`; `onDone` runs when it finishes by itself (not when stopped). Returns false if this device cannot read Thai. */
  function play(text: string, onDone?: () => void) {
    if (!synth || !hasThaiVoice()) return false
    stop()
    queue = chunks(text); done = onDone; speaking.value = true
    next(run)
    return true
  }
  function stop() { run++; queue = []; done = undefined; synth?.cancel(); speaking.value = paused.value = false }
  function toggle() { if (!synth) return; if (paused.value) synth.resume(); else synth.pause(); paused.value = !paused.value }
  const setRate = (k: string) => { rate.value = k; lsSet('ttsRate', k) } // applies from the next piece

  onBeforeUnmount(stop)
  return { supported, speaking, paused, rate, play, stop, toggle, setRate }
}
