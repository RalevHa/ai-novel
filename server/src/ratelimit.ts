const hits = new Map<string, { n: number; reset: number }>()

/** Counts one hit on `key`; true when it is over `max` within `windowMs`. */
// ponytail: in-memory, per process; use a shared store (Redis) if the API ever runs on several instances
export function limited(key: string, max: number, windowMs: number) {
  const now = Date.now()
  if (hits.size > 10_000) for (const [k, h] of hits) if (h.reset <= now) hits.delete(k)
  let h = hits.get(key)
  if (!h || h.reset <= now) hits.set(key, h = { n: 0, reset: now + windowMs })
  return ++h.n > max
}

export const forgive = (key: string) => hits.delete(key)
