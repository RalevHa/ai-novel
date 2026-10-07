# project_rules.md — AI Novel

> Single source of truth for how the AI engineer works on this project.
> Read this first on every task (see `/project-os`). Keep it accurate; edit the `TODO`s.

## Project

- **Name:** AI Novel
- **Stack:** Bun workspace monorepo — `server/` (Elysia + Drizzle ORM + PostgreSQL, port 3000) and `web/` (Vue 3 + Vite + Pinia + Tailwind CSS + Tiptap, port 5173). Web imports API types directly from `server/src` via Eden Treaty, so both must stay in the same repo.
- **Purpose:** Web novel site where AI (via OpenRouter, with each user's own key) writes chapters. Readers browse and read with a themeable view and take part in a small community (reviews, chapter comments with replies and votes, notifications for replies/upvotes/new chapters, a follow list). `/` is a landing page, the shelf is `/story`, and the terms/privacy/guide/about/contact pages are editable by an admin at `/admin/site`.
- **Entry points / how to run:** `docker compose up -d` (Postgres) → `bun install` at repo root → `cd server && bun run db:migrate` → `cd server && bun run dev` (API) and `cd web && bun run dev` (web, http://localhost:5173). Config via `server/.env` (copy from `server/.env.example`).
- **Test / lint command:** `cd server && bun test` and `cd web && bun test` (tests live in `server/test/` and `web/test/`). Type-check with `cd web && bunx vue-tsc --noEmit -p tsconfig.app.json` and `cd server && bunx tsc --noEmit`. Build check: `cd web && bunx vite build`.

## Conventions

- **Naming:** follow existing code; `server/src` is flat, one file per domain (auth, ai, secrets, chapters, characters, release, site, placeholders, pageDefaults, openrouter, uploads, schema, db, index, markdown, context, …). Routes mostly live in `index.ts` (reader, comments/reviews, `/me`, `/admin`); `site.ts` holds the info-pages API.
- **API contract / response format:** server routes are Elysia handlers consumed by web via Eden Treaty (`@elysiajs/eden`) — route/type signatures in `server/src` must stay accurate since web infers types from them directly, not from a separate schema.
- **Branching / commits:** no direct commits to the main branch; Conventional Commits; one feature branch per piece of work, opened as a PR with `gh`. The repo owner merges (the AI assistant is not allowed to). A PR that is based on another PR's branch is closed by GitHub when that branch is deleted on merge, so base new PRs on `main` unless told otherwise.
- **Roles / permissions:** JWT in an httpOnly cookie (`@elysiajs/jwt`, 30 days from login, not renewed), decoded in `server/src/auth.ts`. Three roles: `admin`, `writer`, `user` (reader). Guards in `auth.ts`: `adminOnly`, `staffOnly` (admin or writer; a writer only reaches stories they created, enforced server-side by `ownStory` from the id in the URL) and `userOnly`. Only an admin grants/removes `writer`/`admin`, and every change goes to `audit_log` (so does removing someone else's comment). The admin account is seeded from `ADMIN_EMAIL`/`ADMIN_PASSWORD` on first boot; readers self-register and must tick the terms (`acceptTerms`, stored as `users.terms_accepted_at`).
- **AI and money:** the site has **no OpenRouter key**: everyone who uses AI (admins included) saves their own in their profile; it is stored encrypted in `user_ai_keys` (AES-256-GCM bound to the user id, secret `KEY_ENCRYPTION_SECRET`, default `JWT_SECRET`), never sent back to the browser, and `aiGate` in `ai.ts` decides per call who pays. `local:` models need no key and are admin-only. Every call is recorded in `ai_usage`. Never log or return a key.

## Domain notes (things that are easy to get wrong)

- **New-chapter timing:** `chapters.released_at` is when a chapter went (or goes) live, kept in sync by `releasedAtFor` (`server/src/release.ts`) wherever publish state changes; never use `created_at` for "new" (drafts wait days, and scheduled/drip chapters are not new until their time). "New chapter" notifications are computed on the fly from it, not stored.
- **Info pages:** default Markdown in `server/src/pageDefaults.ts`; an edit creates a row in `info_pages` that overrides it (deleting the row restores the default). Raw HTML and images are never rendered. If system behaviour changes (data kept, cookies, AI use), update the default text of `/privacy` and `/terms`.
- **Times:** database timestamps are naive UTC; Eden turns them into `Date` objects on the web, so compare with `+new Date(x)`, never `!==` on two dates; use `parseDb` for strings from raw SQL.
- **Reading progress** is measured against where the comments section starts (`readHeight` in `ReadPage.vue`), so opening comments must not change the percentage.

## Iron rules

- Reuse existing code; prefer modification over duplication.
- Keep architecture consistent and modules independent; follow SOLID, DRY, KISS.
- Never hardcode secrets — use config/environment variables.
- Never `SELECT *`; always parameterize SQL. Any DB change ships an idempotent migration.
- Do not break backward compatibility without explaining it.
- Report outcomes faithfully — if tests fail or a step was skipped, say so.

## Knowledge structure

- `rules/` — cross-cutting rules in 6 categories (general, code-quality, error-handling, security, performance, database)
- `skills/` — reusable how-tos and gotchas discovered while working
- `agents/` — the specialist roles and when to use each
- `hooks/` — checklists to run BeforeTask / BeforeCommit / AfterTask / BeforeRelease / AfterRelease
