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
- **Migration folder:** none — this project uses `bun run db:push` (`drizzle-kit push`) to sync `schema.ts` straight to the database, no generated `.sql` migration files are tracked. When this changes, update this line and the "idempotent migration" rule above accordingly.
- **Timezone / encoding gotchas:** none recorded yet — TODO if one is found.
