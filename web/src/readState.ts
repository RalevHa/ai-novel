import { client, ok } from './api'
import { lsGet, lsSet } from './ls'
import { touch } from './readPos'
import { useAuth } from './stores/auth'

// Where a reader stopped (scroll position in a chapter) and which chapters they finished.
// Signed in: kept on the account so it follows them between devices. Always mirrored in localStorage, which is all an anonymous reader has.

const POS_KEY = 'readPos'
const readKey = (storyId: number) => `read:${storyId}`
const SAVE_EVERY = 5000 // ms between server saves while scrolling

const posMap = (): Record<string, number> => { try { return JSON.parse(lsGet(POS_KEY) || '{}') } catch { return {} } }
const localReads = (storyId: number): number[] => { try { return JSON.parse(lsGet(readKey(storyId)) || '[]') } catch { return [] } }
const signedIn = () => !!useAuth().user

const server: Map<number, { no: number; pos: number | null }> = new Map() // the account's place per story, filled on first use
let loaded = false
async function loadServer() {
  if (loaded || !signedIn()) return
  loaded = true
  try { for (const p of await ok(client.api.me.progress.get())) server.set(p.storyId, { no: p.no, pos: p.pos }) } catch { loaded = false }
}

const send = (path: string, method: string, body: unknown) =>
  fetch(`/api/me/${path}`, { method, credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {})

let pending: { storyId: number; no: number; pos: number } | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let last = 0

function push() {
  if (timer) { clearTimeout(timer); timer = null }
  if (!pending) return
  const p = pending; pending = null; last = Date.now()
  send(`progress/${p.storyId}`, 'PUT', { no: p.no, pos: p.pos })
}

/** Where to resume chapter `no` of a story, 0-1 (0 = from the top). */
export async function getPos(storyId: number, no: number) {
  await loadServer()
  const s = server.get(storyId)
  if (s && s.no === no) return s.pos ?? 0
  return posMap()[`${storyId}:${no}`] ?? 0
}

/** Remember the position. Cheap to call on every scroll event: storage is immediate, the server save is throttled. `now` skips the throttle. */
export function savePos(storyId: number, no: number, pos: number, now = false) {
  lsSet(POS_KEY, JSON.stringify(touch(posMap(), `${storyId}:${no}`, Math.round(pos * 1000) / 1000)))
  if (!signedIn()) return
  server.set(storyId, { no, pos })
  pending = { storyId, no, pos }
  if (now || Date.now() - last >= SAVE_EVERY) push()
  else if (!timer) timer = setTimeout(push, SAVE_EVERY - (Date.now() - last))
}

/** Send anything still waiting (call when the page is hidden or closed). */
export const flush = push

/** Chapter numbers the reader has finished in this story. */
export async function reads(storyId: number) {
  const set = new Set(localReads(storyId))
  if (signedIn()) { try { for (const n of await ok(client.api.me.reads({ id: storyId }).get())) set.add(n) } catch { /* local list still works */ } }
  return set
}

export function markRead(storyId: number, no: number) {
  const have = localReads(storyId)
  if (!have.includes(no)) lsSet(readKey(storyId), JSON.stringify([...have, no]))
  if (signedIn()) send(`reads/${storyId}`, 'POST', { no })
}
