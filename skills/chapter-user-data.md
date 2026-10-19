---
title: Per-chapter user data (likes, bookmarks) and the reader's bottom bar
category: api
updated: 2026-10-19
---

## Problem / context

Adding something a reader stores per chapter (chapter likes, chapter bookmarks), and the UI that goes with it
in `web/src/pages/ReadPage.vue`.

## Solution

- **Key by `chapters.id`, not `(storyId, no)`.** `chapterLikes` / `chapterBookmarks` use `chapter_id` with
  `ON DELETE CASCADE`. `chapterReads` and `readingProgress` are keyed by `no`, so `DELETE /chapters/:id` has to
  shift them by hand (negate, then shift, because of the unique index); id-keyed tables need none of that.
- Resolve the id with `liveChapterId(storyId, no)` (published story + visible chapter) and answer 404 otherwise.
- Public count + own state in one GET (`/stories/:id/chapters/:no/likes` returns `{ count, liked }`); writes are PUT/DELETE
  behind `userOnly`, rate-limited with `limited(...)`, idempotent (`onConflictDoNothing`).
- Per-user lists live under the `me` guard: `GET /me/chapter-bookmarks` (list page), `GET /me/chapter-bookmarks/:id`
  (chapter numbers marked in one story, loaded once per story), `PUT/DELETE /me/chapter-bookmarks/:id/:no`.
- Migration: edit `server/src/schema.ts`, run `cd server && bunx drizzle-kit generate --name <slug>`, then `bun run db:migrate`.
- Buttons flip optimistically and roll back (with a toast) when the server refuses; logged-out taps go to
  `/login?next=<route.fullPath>`.

Reader bottom bar (`.reader-foot`, three groups): left ♥ and 💬, centre `< ตอนที่ N >`, right 🔖. It slides away with
the header via `html[data-chrome='hidden']`.

## Gotchas

- Comments open in a `Modal` sheet over the page, not by scrolling to the inline section: scrolling lost the reader's place.
  The inline section stays for `?comments=1` (notification links). Arrow-key chapter changes are ignored while the sheet is open.
- Tapping the middle 60% of the screen (touch only, movement under 10px, not on links/buttons/bars) toggles the bars (`isCenterTap` in `web/src/reader.ts`).
- Story-level "follow" (`bookmarks` table, `/following`) is separate from chapter bookmarks; the follow button lives on the story page.

## Related

- [[management-list-pages]]
