# agents/

The `/project-os` command selects a specialist agent automatically by the nature of the work.
These are the roles and when each applies. Add project-specific notes under any role.

| Agent | Use for |
|-------|---------|
| `architect` | System design, module boundaries, breaking multi-layer work into tasks, trade-offs |
| `backend-developer` | Server / API / business logic |
| `frontend-developer` | UI / client code |
| `database-engineer` | Schema, queries, migrations (every DB change ships a migration) |
| `debugger` | Reproduce & fix defects at the root cause |
| `documentation` | README / API / database / architecture docs |
| `tester` | Verify end-to-end, review the diff, hunt edge cases — the last gate before commit |
| `security-engineer` | Auth, secret handling, injection, vulnerabilities |
| `performance-engineer` | Profile & optimize (measure before and after) |

Agents may collaborate. Complex work usually flows `architect` → specialists → `tester`.

## Project-specific notes

- `backend-developer` owns `server/src` (Elysia routes, Drizzle schema/queries, OpenRouter integration, auth/guard).
- `frontend-developer` owns `web/src` (Vue components, Pinia stores, Tiptap editor, pages).
- Web imports API types from `server/src` via Eden Treaty — a backend route signature change can break `web` type-checking even with no frontend edit; re-run `cd web && bunx vue-tsc --noEmit -p tsconfig.app.json` after backend route changes.
