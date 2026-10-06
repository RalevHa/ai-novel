import { and, eq, isNull, lte, or, sql } from 'drizzle-orm'
import { chapters } from './schema'

/** What readers may see: published, and not scheduled for later. Use this everywhere the reader side lists or opens chapters. */
export const visible = and(eq(chapters.published, true), or(isNull(chapters.publishAt), lte(chapters.publishAt, sql`now()`)))!

/** Same rule for hand-written correlated subqueries that refer to `chapters` by name. */
export const visibleSql = sql.raw('chapters.published and (chapters.publish_at is null or chapters.publish_at <= now())')

/** When a chapter went (or goes) live. */
export const liveAt = sql`coalesce(${chapters.publishAt}, ${chapters.createdAt})`
