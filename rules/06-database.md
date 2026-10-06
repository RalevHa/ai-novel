# 06 · Database

- Use a transaction when modifying multiple tables.
- Name tables and columns meaningfully.
- Write readable SQL with consistent formatting.
- Use indexes where appropriate.
- **Every schema change ships a re-runnable (idempotent) `.sql` migration script** in the project's SQL folder — the task is not done without it.
- Always specify columns — never `SELECT *`.
- Optimize an existing query before writing a new one.

## Project specifics

- **Database / driver:** PostgreSQL 16 (Docker Compose service `db`) via Drizzle ORM (`postgres` driver), schema in `server/src/schema.ts`.
- **Migration folder:** `server/drizzle/` (drizzle-kit). After editing `schema.ts` run `bun run db:generate`, then make the generated SQL idempotent (`IF NOT EXISTS`, `DO $$ … EXCEPTION WHEN duplicate_object` for constraints) and apply with `bun run db:migrate`. `0000_baseline` was hand-edited this way so it is safe on databases originally created with `drizzle-kit push`.
- **Timezone / encoding gotchas:** none recorded yet — TODO if one is found.
