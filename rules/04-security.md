# 04 · Security

- Prevent SQL injection.
- Validate input every time — on both the client and the server.
- Never hardcode passwords, API keys, or secrets — use `.env` / configuration.
- Always use parameterized queries.
- Check authorization on the server for every endpoint.
- Never expose secrets in code, logs, or docs; ensure `.gitignore` covers `.env` and `*.key`.

## Project specifics

- **Auth model:** JWT in an httpOnly cookie (`@elysiajs/jwt`), verified in `server/src/auth.ts`. Roles: `admin` / `user`. `adminOnly` guard returns 401 (no session) / 403 (wrong role).
- **Secret storage:** `server/.env` (not committed; see `server/.env.example`). Holds `DATABASE_URL`, `OPENROUTER_API_KEY`, `JWT_SECRET`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
