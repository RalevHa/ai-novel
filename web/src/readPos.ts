// Pure helpers for remembering where a reader stopped (kept apart from storage/network so they can be tested).

/** How far down a page the viewport is, 0-1. A page that fits the window counts as 0. */
export function scrollFraction(top: number, scrollHeight: number, clientHeight: number) {
  const room = scrollHeight - clientHeight
  return room <= 0 ? 0 : Math.min(1, Math.max(0, top / room))
}

/** The scrollTop that puts the viewport at `fraction` of the page. */
export const scrollTarget = (fraction: number, scrollHeight: number, clientHeight: number) =>
  Math.round(Math.min(1, Math.max(0, fraction)) * Math.max(0, scrollHeight - clientHeight))

/** Put `key` last (most recent) in an insertion-ordered map and keep only the newest `max` entries. Returns a new object. */
export function touch<T>(map: Record<string, T>, key: string, value: T, max = 50): Record<string, T> {
  const { [key]: _old, ...rest } = map
  const entries = Object.entries({ ...rest, [key]: value })
  return Object.fromEntries(entries.slice(Math.max(0, entries.length - max)))
}

/** Close enough to the end to count as "finished" (the saved position is then reset so the chapter reopens at the top). */
export const FINISHED = 0.97
/** Far enough down to count as "read" for the table of contents. */
export const READ_AT = 0.9
/** Not worth restoring: the reader barely moved. */
export const RESTORE_MIN = 0.02
