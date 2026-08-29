# Durable Object SQLite Driver TODO

## State

- [x] Inspected Dumbo SQLite core, sqlite3, and D1 adapter structure.
- [x] Inspected Pongo D1 wrapper and Cloudflare/lazy-loading structure.
- [x] Researched Cloudflare Durable Object SQLite API.
- [x] Ran Miniflare PoC proving `storage.transaction(async () => ...)` rolls back SQL writes across `await Promise.resolve()`.
- [x] Created implementation blueprint in `plan.md`.
- [x] Created code-generation prompt sequence in `plan.md`.
- [ ] Phase 1 / Prompt 1: implement the first real Dumbo Durable Object SQLite behavioral slice with tests in matching D1/sqlite3 subfolders. Current skeleton code exists, but Phase 1 is not complete: skeleton/stub tests are not acceptable, and exposed executor/pool/connection/transaction surfaces need real behavior tests or narrower exposed code.
- [ ] Implement Dumbo Durable Object SQLite client execution.
- [ ] Implement Dumbo Durable Object SQLite connection and pool.
- [ ] Implement Dumbo Durable Object SQLite transaction support using async `storage.transaction`.
- [ ] Register and export Dumbo driver from `@event-driven-io/dumbo/cloudflare`.
- [ ] Add Dumbo Durable Object SQLite generic driver and formatter integration tests in matching subfolders.
- [ ] Implement Pongo Durable Object SQLite wrapper driver.
- [ ] Add full Pongo Durable Object SQLite tests mirroring D1 where runtime support allows.
- [ ] Run final build/test verification.

## Notes

- Driver type planned as `Cloudflare:durableObjectSQLite`.
- Primary public Dumbo option should be `storage?: DurableObjectStorage`; `sql?: SqlStorage` can be supported for lower-level usage and tests.
- `storage` means the full Cloudflare Durable Object storage object, usually `ctx.storage`; `sql` means only `ctx.storage.sql`.
- Passing only `sql` can execute queries but cannot support transaction APIs, because `transaction` lives on `DurableObjectStorage`.
- Transactions must not emit `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`, or `RELEASE` through `ctx.storage.sql.exec()`.
- Full transaction support should use `DurableObjectStorage.transaction(async () => ...)`; raw `SqlStorage` alone is insufficient.
- Do not use `DurableObjectStorage.transactionSync()` in this driver implementation. The Miniflare PoC validated async `storage.transaction(async () => ...)`, and the public Dumbo/Pongo transaction API must stay async.
- Existing package `./cloudflare` exports should be enough; package export maps likely do not need changes.
- Runtime test harness validated with a throwaway Miniflare script using a SQLite-backed Durable Object class.
- Revised implementation discipline: every prompt must be test-first and should mirror the relevant D1/sqlite3 test class before production implementation.
- A prompt is not complete unless `npm run fix`, targeted unit tests where appropriate, targeted integration tests for real runtime behavior, and the affected package TypeScript build have passed.
- There is no manual user-review gate in the plan's definition of done; if a required check cannot run, document the blocker and leave the prompt or verification item incomplete.
- Existing D1 coverage is primarily Miniflare-backed integration tests (`connection.int.spec.ts`, `connection.int.generic.spec.ts`, `batchCommand.int.spec.ts`, `sqlFormatter.int.spec.ts`, `transactions.int.spec.ts`). sqlite3 is the closer transaction baseline because it verifies real rollback behavior. Durable Object SQLite should mirror those with Miniflare-backed Durable Object tests whenever runtime behavior exists; fake tests are only for call-shape or hard-to-observe internals.
- Mandatory self-review after each phase: no `transactionSync`, no transaction-control SQL through `ctx.storage.sql.exec`, async public API preserved, tests colocated like D1/sqlite3, no top-level catch-all specs, no scaffolding/stub tests used to justify placeholder code, no tests that assert implementation details instead of behavior, no redundant abstractions, no monkey patching, no hacks, and no exposed production behavior without matching tests or documented narrowing.
