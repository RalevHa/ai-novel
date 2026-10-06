# project_rules.md — AI Novel

> Single source of truth for how the AI engineer works on this project.
> Read this first on every task (see `/project-os`). Keep it accurate; edit the `TODO`s.

## Project

- **Name:** AI Novel
- **Stack:** Bun workspace monorepo — `server/` (Elysia + Drizzle ORM + PostgreSQL, port 3000) and `web/` (Vue 3 + Vite + Pinia + Tailwind CSS + Tiptap, port 5173). Web imports API types directly from `server/src` via Eden Treaty, so both must stay in the same repo.
- **Purpose:** Web novel reader where an admin has AI (via OpenRouter) write chapters; readers browse stories, chapters, and characters with a themeable reading view.
- **Entry points / how to run:** `docker compose up -d` (Postgres) → `bun install` at repo root → `cd server && bun run db:push` → `cd server && bun run dev` (API) and `cd web && bun run dev` (web, http://localhost:5173). Config via `server/.env` (copy from `server/.env.example`).
- **Test / lint command:** no test runner configured. Type-check with `cd web && bunx vue-tsc --noEmit -p tsconfig.app.json` and `cd server && bunx tsc --noEmit`. Build check: `cd web && bunx vite build`.

## Conventions

- **Naming:** follow existing code; `server/src` is flat, one file per domain (auth, chapters, characters, media, openrouter, prompt, uploads, schema, db, guard, index, markdown, context).
- **API contract / response format:** server routes are Elysia handlers consumed by web via Eden Treaty (`@elysiajs/eden`) — route/type signatures in `server/src` must stay accurate since web infers types from them directly, not from a separate schema.
- **Branching / commits:** no direct commits to the main branch; Conventional Commits.
- **Roles / permissions:** JWT in an httpOnly cookie (`@elysiajs/jwt`), decoded in `server/src/auth.ts`. Two roles: `admin` and `user` (reader). `adminOnly` guard (`server/src/auth.ts`) returns 401/403 for non-admins. Admin account is seeded from `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars on first boot. Readers self-register.

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
