import { watch } from 'vue'
import { client, ok } from './api'
import { lsGet, lsSet } from './ls'
import { setTheme, theme, THEMES, type ThemeName } from './theme'

// Reading settings follow the account. localStorage stays the copy the pages read; this file moves it to and from the server.
type Prefs = Awaited<ReturnType<typeof load>>
const load = () => ok(client.api.me.prefs.get())

const KEYS = { theme: 'theme', fontSize: 'fontSize', fontFace: 'fontFace', measure: 'readerWidth', leading: 'readerLeading', para: 'readerPara', indent: 'readerIndent' } as const
const MEASURES = ['narrow', 'normal', 'wide'], LEADINGS = ['tight', 'normal', 'loose']

/** This device's settings, only the ones the reader has actually chosen (so defaults are never uploaded as choices). */
export function localPrefs(): Prefs {
  const get = (k: keyof typeof KEYS) => lsGet(KEYS[k])
  const p: Prefs = {}
  const th = get('theme'), size = Number(get('fontSize')), face = get('fontFace'), measure = get('measure'), leading = get('leading')
  if (th && THEMES.some(t => t.k === th)) p.theme = th as ThemeName
  if (size >= 15 && size <= 30) p.fontSize = size
  if (face === 'serif' || face === 'sans') p.fontFace = face
  if (measure && MEASURES.includes(measure)) p.measure = measure as Prefs['measure']
  if (leading && LEADINGS.includes(leading)) p.leading = leading as Prefs['leading']
  const para = get('para'), indent = get('indent')
  if (para && LEADINGS.includes(para)) p.para = para as Prefs['para']
  if (indent === 'off' || indent === 'on') p.indent = indent
  return p
}

function apply(p: Prefs) {
  if (p.fontSize) lsSet(KEYS.fontSize, String(p.fontSize))
  if (p.fontFace) lsSet(KEYS.fontFace, p.fontFace)
  if (p.measure) lsSet(KEYS.measure, p.measure)
  if (p.leading) lsSet(KEYS.leading, p.leading)
  if (p.para) lsSet(KEYS.para, p.para)
  if (p.indent) lsSet(KEYS.indent, p.indent)
  if (p.theme) setTheme(p.theme) // last: it also repaints the page
}

let signedIn = false, timer: ReturnType<typeof setTimeout> | undefined
export const prefsSignedIn = (v: boolean) => { signedIn = v }

const push = () => client.api.me.prefs.put(localPrefs()).catch(() => {}) // a missed save is not worth interrupting reading

/** Call once the user is known: the account's settings win on this device; a first device with nothing saved yet uploads its own. */
export async function syncPrefs() {
  signedIn = true
  const server = await load().catch(() => null)
  if (!server) return
  if (Object.keys(server).length) apply(server); else if (Object.keys(localPrefs()).length) await push()
}

/** Debounced upload after a setting changed; does nothing for anonymous readers. */
export function savePrefs() {
  if (!signedIn) return
  clearTimeout(timer)
  timer = setTimeout(push, 800)
}

watch(theme, savePrefs)
