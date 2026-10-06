import { gte, sql } from 'drizzle-orm'
import { db } from './db'
import { chapters } from './schema'

/** Monthly spending cap in USD from MONTHLY_BUDGET_USD; 0 = no cap. */
export const budget = () => Number(process.env.MONTHLY_BUDGET_USD) || 0

/** Cost of the chapters written this month (what OpenRouter reported; chapters without a figure count as 0). */
export async function monthSpent() {
  const [r] = await db.select({ n: sql<number>`coalesce(sum(${chapters.cost}), 0)::float8` }).from(chapters).where(gte(chapters.createdAt, sql`date_trunc('month', now())`))
  return r.n
}

/** A message when this month's spending has reached the cap, otherwise null. Call before anything that costs money. */
export async function overBudget() {
  const cap = budget()
  if (!cap) return null
  const spent = await monthSpent()
  return spent >= cap ? `ใช้เกินงบประจำเดือนแล้ว ($${spent.toFixed(2)} จาก $${cap.toFixed(2)}) ปรับ MONTHLY_BUDGET_USD หรือรอเดือนหน้า` : null
}
