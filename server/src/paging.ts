import { t } from 'elysia'

export const pageQuery = t.Object({ page: t.Optional(t.Numeric({ minimum: 1 })), size: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })) })

/** page/size from a query, clamped to the real range. `page` omitted: `start` picks the first or the last page. */
export function paging(q: { page?: number; size?: number }, total: number, start: 'first' | 'last', defaultSize = 50) {
  const size = q.size ?? defaultSize
  const pages = Math.max(1, Math.ceil(total / size))
  const page = Math.min(q.page ?? (start === 'last' ? pages : 1), pages)
  return { page, size, offset: (page - 1) * size }
}
