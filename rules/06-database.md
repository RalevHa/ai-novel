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
- **Timezone gotcha:** timestamps are `timestamp` (no zone), stored as UTC. Drizzle maps typed columns to `Date`, but a raw `sql` aggregate such as `max(...)` comes back as a plain string like `"2026-10-07 03:10:12"`; read it as UTC (`new Date(s.replace(' ', 'T') + 'Z')`), otherwise a machine in another zone sorts it hours off.
- **Verifying idempotence:** replay a migration with `psql -c "$(sed 's/--> statement-breakpoint//' file.sql)"`. Piping SQL into `docker exec -i … psql` delivers no input in this environment, so that check passes without running anything.
- **Backfills inside a migration** must be guarded to run once (e.g. `WHERE NOT EXISTS`), since the whole file may be replayed.
- **Do not `git checkout` `drizzle/meta/_journal.json`** while a migration is uncommitted: the journal entry is lost with it. Drizzle applies migrations newer than the last applied one, so never reorder or edit the journal by hand.
