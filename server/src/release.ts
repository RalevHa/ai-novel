/**
 * When a chapter went (or goes) live for readers: what "new chapter" notifications are measured against.
 * Not `createdAt` (a draft can sit for days before it is published) and not "when the admin pressed publish"
 * (a scheduled chapter is not new to readers until its time arrives), so it is kept on the chapter as `releasedAt`.
 */
type State = { published: boolean; publishAt: Date | null }

export function releasedAtFor(before: State & { releasedAt: Date | null }, after: State, now = new Date()): Date | null {
  if (!after.published) return null
  if (after.publishAt) return after.publishAt // scheduled: live at that time (changing the schedule moves it)
  // live right away: keep the original moment if it already was live, so saving a published chapter again does not make it "new" again
  return before.published && !before.publishAt && before.releasedAt ? before.releasedAt : now
}
