# Todo: statement timeouts and #219

## Steps

- [x] 1. Dumbo pg statement timeouts: per call (read and restore) and per transaction (`statementTimeoutMs`)
- [x] 2. #219: `find`, `fetchByIds`, `countDocuments`, `drop` run on the session's transaction (Pongo)
- [ ] 3. Pongo `timeoutMs`/`abort` per operation, `statementTimeoutMs` per transaction, docs, `npm test` (after 1 and 2)

## Verification log

<!-- Per step: commands run, pass/fail, notes -->

- Step 1: `npm run build:ts` passed, `npm run agent:check` passed, step specs passed (60/60), `npm run test:unit` passed (1318/1318).
- Step 2: D1 transactions now apply column mapping in `d1SQLExecutor` (`query`, `batchQuery`); D1 drop test asserts the drop isn't undone by abort (D1 rollback undoes no writes). `npm run build:ts` passed, `npm run agent:check` passed, step specs passed (255 passed, 4 pre-existing skips; durableObject 84/84), `npm run test:unit` passed (1326/1326).
- Step 3: Mongo-aligned naming: `timeoutMS` per operation and transaction, session `defaultTimeoutMS`; Dumbo `timeoutMs`/`statementTimeoutMs`/`migrationTimeoutMs`/lock `timeoutMs` renamed to `...MS`; shim maps Mongo `timeoutMS` and `signal`, doesn't expose a transaction timeout. `npm run build:ts` passed, `npm run agent:check` passed, step specs passed (466 passed, 4 pre-existing skips; durableObject 87/87), `npm run test:unit` passed (1371/1371), `npm test` passed. Not ticked: `src/docs/getting-started.md` still uses `maxTimeMS`.
