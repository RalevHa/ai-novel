# 07 — UI / UX

Applies to everything under `web/src`. Check the existing component in `web/src/components/ui/` before writing markup by hand.

## Identity (the feel to keep)
- Calm, paper-and-ink, Japanese-inspired reading site, not a flashy app. Quiet surfaces, thin `line` borders, one `primary` accent, generous line height. Decoration is sparse and always behind content: the 物 seal (`.seal`), kanji and sun disc on covers, sakura petals on the landing page.
- The three themes are named after porcelain and ink: 白磁 `paper` (default light), 青磁 `sepia` (warm, for long reading), 紺 `ink` (dark). First visit follows the OS (`prefers-color-scheme: dark` gives `ink`); after that the choice is stored per device and, for signed-in readers, in `users.prefs`. Every new screen must look right in all three.
- Headings use `font-serif`, body and controls `font-sans`, the reader body uses the reader settings (`--reader-size`, `--reader-lh`, `--reader-para`, `--reader-indent`), so never hard-code a size inside `.reader-body`.
- Motion is small (150–200ms, `translate`/opacity). Big motion (GSAP pinning, petals) is landing-page, desktop-only and switched off for reduced motion.
- Book covers are `BookCover.vue` (2:3, uploaded image or generated from the genre), never a raw `<img>` for a cover.

## Layout and shells
- Two shells in `App.vue`: the public shell (sticky header, `.wrap` content, footer) and the admin/writer shell (side rail on desktop; top bar plus bottom nav under `md`, content max 1000px). A new admin page goes in that shell's `nav` list; a reader page does not get admin chrome.
- Mobile first: breakpoints are Tailwind defaults (`sm` 640, `md` 768). Content width is `.wrap` (max 1120px); long text (reader, info pages) stays in a narrow column.
- The reader hides its header/toolbar while scrolling down and brings it back on the way up (`data-chrome`); anything fixed that you add to the reader must follow `.reader-bar` / `.reader-foot` so it does not fight that.

## Words used on the site (keep them consistent)
| Thai | Means |
|---|---|
| ติดตาม / ชั้นหนังสือของฉัน | follow a story; the shelf of followed stories |
| บุ๊กมาร์ก | a bookmarked chapter (not a followed story) |
| ประวัติการอ่าน | reading history |
| ผู้อ่าน / นักเขียน / ผู้ดูแล | `user` / `writer` / `admin` |
| เผยแพร่ / ซ่อน / ฉบับร่าง | published / hidden / draft chapter |

## Look and tokens
- Colours come only from the Tailwind tokens (`bg`, `surface`, `fg`, `line`, `primary`, `on-primary`, `secondary`, `success`, `warning`, `danger`), which are CSS variables per theme in `styles.css`. No hex values, no `dark:` variants: the three themes (`paper`, `sepia`, `ink`) swap by variable. A new colour means a new variable in all three themes plus `BAR` in `theme.ts`.
- Secondary text uses `.muted` (never lower than `text-fg/75`, for contrast). Fonts are self-hosted (IBM Plex Sans Thai for UI, Noto Serif Thai / Shippori Mincho for headings and the reader); never load Google Fonts.
- Icons are `lucide-vue-next`, decorative ones get `aria-hidden="true"`. Layout width is `.wrap`.
- Animation must respect `prefers-reduced-motion` (`motion-reduce:` or the media query already in `styles.css`).

## Language
- All user-facing text is Thai, short and neutral. Buttons are verbs ("ลบ", "บันทึก", "ยกเลิก"), not sentences. Errors say what happened and what to do, never an exception message.

## Type and spacing scale
Taken from how the pages are actually written (Tailwind defaults, no custom scale). Pick from this table; do not invent a new size.

| Role | Classes |
|---|---|
| Page title, admin/account pages | `font-serif text-[26px] font-bold` (+ `mb-1`, then the subtitle) |
| Page title, reader-facing pages | `font-serif text-[clamp(26px,4vw,38px)] font-bold leading-snug` |
| Landing hero only | `text-[clamp(28px,4.5vw,44px)] leading-tight`, `text-3xl`+ stays on the landing page |
| Section heading | `font-serif text-xl font-bold` (`text-2xl` for a main section on a reader page) |
| Form-section heading (profile, settings) | `font-medium` (no serif), `mb-1`, danger zone adds `text-danger` |
| Card / item title | `font-serif font-bold leading-snug` (`text-lg` when it stands alone) |
| Body | default 16px; long prose adds `leading-relaxed` |
| Secondary line under a title | `muted mt-1 text-sm` |
| Meta, hints, counters, timestamps | `muted text-xs` (never smaller for readable text; `text-[11px]` for pill badges like "ผู้แต่ง", `text-[10px]` for count dots on icons) |
| Buttons and form text | `text-sm` for `size="sm"`, base size otherwise |

| Spacing | Use |
|---|---|
| Between controls in a row | `gap-2` (tight), `gap-3` (default), `gap-4` (loose) |
| Between stacked list items | `space-y-3`; divided lists use `divide-y divide-line` and `py-3` rows |
| Between page sections | `mt-6` or `mb-6` inside a page, `mt-10`/`mt-12` between major sections |
| Card | `rounded-xl border border-line bg-surface p-4` (list rows `p-3`); inner chips/banners `rounded-lg` |
| Empty state | the card above with `px-6 py-10 text-center`: serif title, one `muted text-sm` line, one button |
| Error / warning banner | `rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger` |
| Form field | `Input` already carries `mb-4`; do not add margin around it |
| Page gutter | `.wrap` (`px-5`) on the public shell, `px-4 md:px-8` in the admin shell |

Known drift (fix when you touch the file, do not copy it): a few admin titles use `text-[28px]` or `text-3xl`, and some `h2`s use `font-medium` where a section heading should be `font-serif text-xl font-bold`.

## Components to reuse
| Need | Use |
|---|---|
| Button / link-as-button | `ui/Button.vue` (`variant`: solid, outline, ghost, danger; `size`; `loading` shows a spinner and disables) |
| Form fields | `ui/Input`, `ui/Textarea`, `ui/Switch`, `ui/Segmented`, `ui/Tabs`, `ui/ComboInput`, `ui/DateTimeInput`; each has a visible `label` |
| Dialog | `ui/Modal.vue`: `size="sm"` centred card (short questions), `size="lg"` full-screen on phones (long forms), `wide` for editors |
| Row/overflow actions | `ui/DropMenu.vue` (`danger: true` for destructive entries) |
| Lists | `ui/Pager.vue`, `ui/Bar.vue` for loading |
| Feedback | `toast(text)` for success, `toastError(e)` for failure (`toast.ts`); never `alert()` |

## Destructive and irreversible actions
- Always confirm in a dialog. Never inline "ยืนยัน/ยกเลิก" buttons that swap in place, and never `window.confirm`/`confirm()`/`alert()`/`prompt()` for confirmations.
- Use `ask()` from `web/src/confirm.ts` (one `ConfirmHost` is mounted in `App.vue`):
  `if (!await ask({ title: 'ลบความคิดเห็นนี้?', body: 'ลบแล้วกู้คืนไม่ได้', confirmLabel: 'ลบ' })) return`
  Title is the question, body says the consequence (and whether it can be undone), `confirmLabel` names the action ("ลบ", not "ตกลง"). It is `danger` red by default; pass `danger: false` for non-destructive questions.
- Ask for: deletes, removing someone from a list (unfollow, clear history), replacing content (restore, reset to default), discarding unsaved edits, leaving while AI is writing. Do not ask for cheap, reversible toggles (like, bookmark a chapter, follow).
- Bulk actions: one dialog for the whole selection, and the count is in the title.
- Account deletion keeps its password + emailed-code flow; do not replace it with a dialog.

## Interaction patterns
- Touch targets are at least 44px on phones (`size-11 sm:size-8`, `Button size="sm"` does this); use `.hit` to enlarge a small link.
- Toggles that the server can refuse update the UI first and roll back on error (see `stores/bookmarks.ts`).
- Show a loading state (`Bar`, or `loading` on the button) for anything over a moment, an empty state with a next action (`ยังไม่ได้ติดตามเรื่องไหน` + button), and disable a submit button while it runs so it cannot be double-sent.
- Forms: validate what the browser can (`required`, `type`), show the character counter next to limited text (`ReviewSection`), and keep the user's text on error.
- A page works at 360px width first; check the mobile bottom bars and `z-index` before adding a fixed element (toasts are `z-[60]`, modals `z-50`).

## Accessibility
- Every control has an accessible name (`aria-label` for icon-only buttons), toggles use `aria-pressed`, tabs/segments use the existing components' roles, focus ring comes from the global `:focus-visible` (do not remove outlines).
- Dialogs trap focus and close on Escape through `Modal` (headlessui); do not hand-roll overlays.
- Status changes announce through the toast `aria-live` region, not colour alone.

## Before you finish a UI change
1. Looked at it in all three themes and at phone width.
2. Reused an existing `ui/` component, or said why not.
3. Any destructive path goes through `ask()`.
4. `cd web && bunx vue-tsc -b` passes.
