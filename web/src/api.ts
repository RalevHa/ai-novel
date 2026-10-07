import { treaty } from '@elysiajs/eden'
import type { App } from '../../server/src/index'

export const client = treaty<App>(location.origin, { fetch: { credentials: 'include' } })

/** Unwrap an Eden response: return data, or throw an Error carrying the server's message. */
export async function ok<T>(p: Promise<{ data: T; error: { status: unknown; value: unknown } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await p
  if (error) {
    const v = error.value as any
    throw Object.assign(new Error(typeof v === 'string' ? v : v?.error || v?.message || `HTTP ${error.status}`), { data: v })
  }
  return data as NonNullable<T>
}
