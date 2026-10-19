---
title: Management list pages mirror HistoryPage
category: ui
updated: 2026-10-19
---

## Problem / context

A page where a signed-in reader manages their own saved rows (bookmarks, likes, history, shelf).
The first draft of `BookmarksPage.vue` had a per-row delete button that removed on one click; the
owner asked for the same behaviour as the reading-history page.

## Solution

Start from `web/src/pages/HistoryPage.vue` (use `FollowingPage.vue` when filters/sorts are needed).
Required parts:

1. Header: title, count line, "เลือกหลายรายการ" (toggle select mode) and "ล้างทั้งหมด".
2. Select mode: a checkbox on every row (`accent-primary`, `aria-label` names the row), a sticky bar with
   select all / none, "เลือกแล้ว N" and a bulk-remove button.
3. Every removal (one row, selected rows, clear all) goes through a `Modal size="sm"` confirm with a danger button. Never delete on first click.
4. A `confirm` ref holds the rows or `'all'`; `busy` drives the button `loading`. After success: clear `picked`,
   leave select mode when the list empties, `toast(...)`.
5. Empty-state card with a call-to-action, `Bar` while loading, `role="alert"` banner when loading fails.

Reference: `web/src/pages/BookmarksPage.vue`.

## Gotchas

- Bulk delete fires one DELETE per row with `Promise.all`; add a bulk endpoint only if asked.
- Key rows by something unique across stories (`${storyId}-${no}`), not `no` alone.

## Related

- [[chapter-user-data]]
