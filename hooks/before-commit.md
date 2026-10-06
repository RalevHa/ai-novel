# BeforeCommit checklist

- [ ] Not committing directly to the main branch (branch first if needed).
- [ ] `git diff` reviewed — no secrets, tokens, keys, or connection strings.
- [ ] No debug leftovers, dead code, or `SELECT *`.
- [ ] Tests / lint pass (or the reason they were skipped is stated).
- [ ] DB changes have an idempotent migration script committed alongside.
- [ ] Docs updated for any changed contract/flow/schema.
- [ ] Commit message follows Conventional Commits and describes the *why*.
