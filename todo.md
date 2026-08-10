# TODO — Self-contained schema components

State for [plan.md](plan.md). One step at a time, in order. A step is done only when every box under it is ticked — including the review gate.

Execution order is **S1, S2, S3, S5, S6, S7, S8, S9, S4, S10 … S17** — S4 waits for S9 to delete its last blocker, and its section below sits between S9 and S10 to match. Step IDs never move.

Per-step gate, run from `/home/oskar/Repos/Pongo/src`:
`npm run build:ts` → `npm run fix` → `npm run test:unit` (+ `test:int` / `test:e2e` where marked).

Run `build:ts` **before** the tests, not after. Pongo's specs import `@event-driven-io/dumbo` from its built `dist`, so a dumbo change that has not been compiled leaves every pongo suite testing the previous build — green for the wrong reason. Caught in S8, where three pongo assertions passed against a stale `dist` and failed on the rebuild.

If review gate R returns STOP: halt, summarise for Oskar, agree what to drop. Do not continue.

---

## Superseded work

Steps S0–S3 of the previous plan were completed against the parent-pointer design. `qa.md` Q49 overturned that design; `spec.md` D1 now says components are never rewritten. The code those steps produced — `withParent`, `attachChildren`, `isAliasedComponents`, the `parent` field, the per-kind `schema()` / `table()` accessors — has already been removed from the working tree.

What survives from them and does not need redoing:

- `migrations` is a method composing own-plus-children (old S1)
- name-based dedupe with `haveSameSQL` (old S2)
- `schemaComponentState`, `InternalSchemaComponent`, `localMigrationsOf`, `migrationsFor`, `declaredMigrations` are gone (old S1)
- the baseline in `metrics/baseline.md` (old S0)

What that work left behind, now owed:

- the spec files do not compile — **S1**
- `createSchemaComponent` still carries a `fields` bag and a `context` option — **S4**, which now runs after S9
- `databaseMigrations.ts` threads two identifiers by hand as scaffolding — **S9**

---

## S1 — Retire placement-reading tests, restore the placement throw
- [x] `schemaComponent.unit.spec.ts`: describe `placing a component under a parent` deleted — done pre-compaction
- [x] `schemaComponent.unit.spec.ts`: describe `resolving the schema a component belongs to` — deleted wholesale pre-compaction, which was wrong. Of its 7 tests only 2 were genuinely obsolete (`reports no schema for a table that was never placed in one`, `reports the schema a table was placed in` — D1 deletes that guarantee) and 1 had already moved (`rejects declaring a collection for one schema and putting it in another`). Restored now:
  - `lets a table declared for a schema be put in that same schema` — positive half of D7's placement rule, was dropped while the negative half was kept
  - `gives a column no way to reach the table it belongs to` — §5's structural assertion, passes unchanged under D1
  - `resolves an index's schema through the table it was placed in` (and its duplicate `lets an index find the schema of the table it was put in`) — guarantee survives via D18, assertable only on emitted DDL → **owed to S9**
- [x] `.schema()` assertions rewritten in `pongoDb.unit.spec.ts` as `schemas.<name>?.schemaName` plus a table-presence assertion — the claim survives D1, only the back-pointer expressing it dies. `pongoDatabaseSchemaComponent.unit.spec.ts` had none left
- [x] Placement throw present in `databaseSchemaComponent`'s constructor — added pre-compaction
- [x] No duplicate throw in pongo; `pongoDatabaseSchemaComponent.ts` never had one
- [x] `databaseSchemaComponent.unit.spec.ts` restored from `98124594` after being deleted wholesale, and rewritten per D1/§5:
  - `exposes its own copy of a table…` **inverted** to `holds the very table declaration it was given` (`strictEqual`) — §5 asserts identity, since nothing clones
  - `leaves the table declaration…reusable in another schema` kept, `.schema()` dropped
  - `places extensions the same way it places tables` kept as identity; its ordering half moves to S9
  - `never lets a table report which schema it was placed in` added — §5 requires this asserted structurally
  - `leaves the tables of an unnamed schema without a schema name` deleted — D7 removes unnamed schemas; replaced at S6
  - indexes-in-the-same-schema deferred to S9: it can only be asserted on emitted DDL
- [x] Unused imports left by the deleted `.table()` / token removed (`indexComponent.ts`, `schemaComponent.unit.spec.ts`)
- [x] The 4 placement-conflict tests pass
- [x] Gate: build:ts green, fix green
- [x] `databaseMigrations.unit.spec.ts` × 4 fixed: every fixture built a nameless schema and relied on the map key for the schema name, so `databaseSchemaName` was undefined and the guard dropped every builder call. Naming them explicitly is what D7/D8 require anyway
- [ ] Gate: unit — 1011 pass, **2 carried to S3** (see below)
- [ ] Review gate R — verdict: ____

**Debt carried out of S1 — resolved during S2, not carried.** `accesses declared children through typed record aliases` and `keeps a composed declaration read-only after construction` assert `components` is a frozen null-prototype record. Commit `98124594` had `createSchemaComponent` assign `components` a plain `{}` instead of routing it through `schemaComponentMap`. Restoring that one call fixes both. The S1 reasoning for deferring — "repairing the freeze means writing code S3 removes" — was wrong: it is a single function call, not a body of code, and §4 says no step may leave the repo red for longer than itself.

## S2 — Dead-code sweep
- [x] Proof test written and run green: `main.users` → `users`, `audit.users` → `dumbo_audit_table_users`. The collision detector's own fixture never collides, so it can never fire
- [x] `logicalSchemaMapping.ts` deleted in full; `components/index.ts` re-export dropped
- [x] `validateLogicalSchemaMapping` and `logicalSchemaMapping.unit.spec.ts` deleted. `DefaultSQLiteMigratorOptions` stays as `{}` — `getDefaultMigratorOptions` throws for an unregistered database type, and sqlite3 and d1 both read it
- [x] `findComponents`, `findComponent`, `SchemaComponentPredicate` deleted, plus their `core/schema/index.ts` exports
- [x] pongo `sqlBuilder` specs reach the collection through the fixture that placed it
- [x] The 4 collision tests deleted (they sat at 901–989, not 1008–1097)
- [x] `assertNativeName` still present — untouched
- [x] Gate: build green, fix green, unit **1006 pass / 0 fail**, int — see below
- [x] Review gate R — verdict: **pass**. (1) No new abstraction — zero new production symbols; the two spec fixture helpers changed return shape, none were added. (2) No remnant — grep for `findComponent`, `SchemaComponentPredicate`, `logicalSchemaMapping`, `LogicalSchemaCollision`, `assertLogicalSchema`, `validateLogicalSchemaMapping` returns nothing across both packages; `isPongoCollectionComponent` kept its production callers. (3) Line count down both sides. (4) No spec contradiction — D16 and D20 satisfied; the one plan.md bullet left undone is recorded directly below.

**`supportsSchemas` / `supportsFunctions` NOT deleted.** plan.md called for it; reverted on Oskar's call. Two reasons. `supportsSchemas` is the natural place to decide whether a driver needs the `dumbo_<schema>_table_` prefix — today that choice is hardcoded per driver. And `supportsFunctions` was not a bare flag: it gated a conditional type making `functionExists` **required** when true. Deleting it silently downgraded PostgreSQL's metadata to optional — a type-guarantee loss inside a step billed as pure deletion. plan.md's S2 bullet is wrong and stays undone.

**Deleted tests, with reasons:**
- `finds a nested table from a composed root` — its subject was `findComponents`/`findComponent`. No claim survives them.
- `finishes traversal when reusable components form a cycle` — asserted `findComponents` terminates on a cycle. Not transferable: `migrations()` has no cycle guard and never claimed one, and the fixture bypassed the factories with raw object literals to build a cycle the public API cannot produce.
- 4 collision tests (`accepts distinct physical table names across logical schemas`, `rejects one physical table name reused across logical schemas`, `accepts a shared table discovered twice within one logical schema`, `detects physical table collisions inside database extensions`) — all four asserted `assertLogicalSchemaMapping`, deleted with it. `sqliteObjectNames.unit.spec.ts` > `keeps underscore-containing logical tuples distinct` already carries the injectivity claim that makes the detector unnecessary.
- `SQLite logical schema mapping` > `validates expanded database schema components in strict mode` — asserted the deleted `validateComponent` hook body. The hook mechanism itself is still covered by `reports schema validation failure before executing migrations`.
- The proof test itself, per the plan — it duplicates `keeps underscore-containing logical tuples distinct`.

**Rewritten, not deleted:** `finds tables and extensions nested inside another extension` and `discovers an extension table without exposing it as a database schema` both made real claims (extensions don't promote their contents into `tables`/`schemas`). Rewritten to reach through `extensions.<alias>.components`. `behaves the same when migrated directly or from a database root` kept its two migration assertions; only the two `findComponents` restatements went.

**Int gate:** the one int spec covering the production change, `sqlite/core/schema/migrations.int.spec.ts`, passes 18/18. The remaining int failures are environmental — `SQLITE_IOERR: disk I/O error` on file-based databases and PostgreSQL connection specs with no live server. None of the failing specs reference a symbol this step touched (grep for `findComponent|logicalSchema|validateComponent|schemaComponent` returns 0 in all three).

**Line delta (S1+S2 cumulative vs `main`):** non-test **−128**, tests **−193**.

## S3 — The erased child list becomes an array — **done**
- [x] `accesses declared children through typed record aliases` and `keeps a composed declaration read-only after construction` — **rewritten, not deleted**. Both claims survive D3; only the surface they were asserted on changed. The first moved onto `databaseSchemaComponent.tables`, which is a real typed map and stays keyed under D3. The second now asserts the child list is a frozen array that rejects `push`
- [x] `components` is `ReadonlyArray<AnySchemaComponent>`
- [x] Each factory builds it from its own typed maps
- [x] `mergeSchemaComponentMaps` and its duplicate-key throw deleted
- [x] The duplicate-key tests deleted and recorded below
- [x] `schemaComponentMap` still used for the typed maps
- [x] Gate: build green, `npm run fix` green, unit **1004/1004** (1006 − the 2 deleted alias tests)
- [x] Review gate R — verdict: **pass**, with one finding carried to S4 (below)

**Deleted tests, with reasons**
- `rejects using one alias for both a table column and index` — the throw it asserts is gone. Under D3 the key is no longer shared: both children sit in the erased array and both migrate. Plan says delete and do not replace; not replaced.
- `rejects using one alias for both a schema and a database extension` — the same throw, reached through `databaseComponent` rather than `tableComponent`. Deleted with it.

**`ExtensionComponent` lost its typed `components` field.** Extension was the one kind whose erased list *was* its user-facing typed map, so D3 takes it away. Nothing in production read it — the compiler flagged only spec files, which is the same evidence D3 rests on. Typed access returns in **S15** as `schemas` / `extensions`. In the meantime three tests that reached through `extension.components.<key>` now assert reachability through `migrations()` instead: `finds tables and extensions nested inside another extension`, `discovers an extension table without exposing it as a database schema`, and `attaches an extension to a database without exposing its internals as schemas`. That is the claim that actually matters and it survives S15 unchanged. `ExtensionComponent`'s second generic parameter went with the field; `dumboSchema.extension` lost it too.

**Identity assertions kept, restated.** `db.schemas.crm === db.components.crm` and friends were asserting D1 — the parent holds the same object. Restated as `db.components` deep-equalling the list of typed-map values, or `.includes(...)` where the list has other members. Same claim, no loss.

**Line delta (S3 alone):** non-test **−46**, tests **−52**.

## S5 — Drop `databaseName` from the chain — **done**
- [x] Tests written and failing first — `carries no database name on a schema declaration` (type spec) and `builds the same migrations with and without a database name` (`databaseMigrations.unit.spec.ts`)
- [x] `databaseName` gone from `DatabaseSchemaComponent` and its options
- [x] Cross-database validation deleted, record-key check kept
- [x] `databaseName` gone from every identifier type; `DatabaseIdentifier` went with it — emptied of its only field, it had no other reader
- [x] `'A database name is required to build migrations'` throw deleted
- [x] `databaseName` gone from `pongoDb.ts`'s identifier and `withTable.ts`
- [x] `SchemaComponentContext.databaseName` and `IndexSQLContext.databaseName` deleted — the same concept in the two remaining context types
- [x] Gate: build green, `npm run fix` green, unit **1004/1004**, sqlite schema int **104/104**
- [x] Review gate R — verdict: **pass**. No new abstraction: the step only removes. No remnant: every surviving `databaseName` is `databaseComponent`'s connection and reporting metadata, which D9 keeps on purpose, and it is genuinely read (`pongo/core/schema/index.ts:616`, `commandLine/configFile.ts:115`). It no longer reaches `createSchemaComponent`'s context and no identifier carries it.

**Deleted test, with reason**
- `rejects placing a schema under a database other than its constraint` — asserts the cross-database validation D9 deletes. With `databaseSchemaComponent.databaseName` gone there is no constraint left to violate. Not replaced.

**Pre-existing integration failures, verified not caused here.** `test:int:sqlite` also matches D1 and PostgreSQL `.int.spec` files. Four failures in `sqlite/d1/connections/connection.int.generic.spec.ts` (`D1TransactionNotSupportedError`) reproduce identically on a clean `HEAD` worktree — 4 failed / 7 passed both sides. The PostgreSQL `.int.spec` failures are environment (no server). Every SQLite schema integration spec passes.

**Type spec rewritten to real tests (boy scout, at Oskar's call).** `schemaComposition.type.spec.ts` was a file of bare top-level statements using `@ts-expect-error`. It is now five `it()` blocks using `expectTypeOf`, so a broken expectation reports as a named failing test instead of a compile error with no test name. The eight `@ts-expect-error` absence checks collapsed into `Extract<keyof …, 'name'>` assertions against `never`; each original comment survives against its entry. Deprecated `toMatchTypeOf` replaced with `toExtend`.

**Line delta (S5 alone, production files):** **−32**.

## S6 — Schema names are required; `defaultSchema` exists — **done**
- [x] Tests written and failing first — `names every schema, either explicitly or as the default one` (type spec), `should create a default schema carrying the default schema token` (`dumboSchema.unit.spec.ts`), `gives the default schema no segment` (`migrationNames.unit.spec.ts`), and two identifier tests in `databaseMigrations.unit.spec.ts`
- [x] `schemaName: string | SQLDefaultSchemaNameToken`, always present, on `DatabaseSchemaComponent`, its options and `PongoSchemaComponent`
- [x] Nameless overload deleted from `dumboSchema.schema` and `pongoSchema.schema` — both are now plain generic functions, not overload sets
- [x] `dumboSchema.defaultSchema` and `pongoSchema.defaultSchema` added
- [x] `dumboSchema.schema.from` takes a required name; its `undefined` branch is gone
- [x] `SchemaComponentContext.databaseSchemaName` and `IndexSQLContext.databaseSchemaName` widened to include the token
- [x] Key-vs-name check in `databaseComponent` is total over string names
- [x] `databaseMigrations` seeds the walk with the token, so the three `databaseSchemaName !== undefined` guards are gone and a table in a database-level extension is no longer silently dropped
- [x] Every nameless-schema fixture rewritten in this step — 26 call sites across dumbo and pongo specs
- [x] Gate: build green, `npm run fix` green, unit **1009/1009**, `test:int:sqlite` 43/47 files (only the four pre-existing D1 `D1TransactionNotSupportedError` failures)
- [x] Review gate R — verdict: **pass, with one flag**. No invented concept: `SQLDefaultSchemaNameToken` already existed in `sqlToken.ts`, declared but never consumed; this step is what consumes it. The one new name is `schemaSegment`, module-private to `migrationNames.ts`, which replaces the `=== defaultSchemaName` comparison duplicated across the three name builders and makes the token rule total. No remnant of the nameless schema: it is unrepresentable in the type.

**Flag — "default schema" now has two encodings at the dialect boundary.** `postgreSQLTableReference`, `postgreSQLDatabaseSchemaSQL`, `sqliteTableName`, `sqliteIndexName` and `schemaSegment` each ask `SQLDefaultSchemaNameToken.check(x) || x === <dialect default string>`, because pongo still resolves `defaultSchemaName` eagerly to `'public'` / `'main'`. S7 moves the token side into the formatter and S13/S14 stop the eager resolution, at which point the string half of each condition goes. This is transitional by plan order, not a workaround left behind.

**Regression fixed here rather than in S9.** S9's plan text lists "a table inside a DATABASE-level extension produces `CREATE TABLE` under the default schema" as its required regression test, calling it "silently dropped today". Removing the `databaseSchemaName !== undefined` guard is a D7 consequence, so the fix and its test (`qualifies a table in a database extension with the default schema token`) land here. S9 should not duplicate it.

**Renamed tests, with reason** — the nameless schema they described no longer exists:
- `should create a default schema without name` → `should create a default schema carrying the default schema token`
- `should keep an unnamed reusable schema under its record key` → `should keep a default schema under its record key`
- `keeps an unnamed schema under its typed database record key` → `keeps a default schema under its typed database record key`
- `declares an unnamed reusable schema component` → `declares a reusable default schema component`
- `keeps an unnamed reusable schema under its database record key` → `keeps a reusable default schema under its database record key`

**Line delta (S6 alone, production files):** **+5** (+117 / −112). The growth is the dual encoding above: five two-line conditions where there was one. `databaseMigrations.ts` (−9), `dumboSchema.ts` (−7) and `pongo/core/schema/index.ts` (−5) all shrank; `sqliteObjectNames.ts` (+10) and `migrationNames.ts` (+6) paid for it. S7 and S13 take it back.

## S7 — `SQLTableReference` + `SQLCreateSchema` — **done**
- [x] Existing processor registry read first — no second dispatch mechanism. `SQLProcessorsRegistry` + `SQLProcessor` already exist; both dialects already build their registry `from: defaultProcessorsRegistry` in `core/sql/formatter/index.ts`. The four new processors register through that, nothing else was added.
- [x] Tests written and failing, both dialects — `core/sql/tokens/schemaTokens.unit.spec.ts`, one SQL value formatted through both formatters: named schema, default token, each dialect's default spelled out, underscore-ambiguous schemas, reserved words, the `dumbo_` reservation guard, composition into a statement, create-schema. Plus a default-token reference case in each dialect's `schemaComponentSQL.unit.spec.ts` and a create-schema case on Postgres.
- [x] Integration tests — three cases per dialect running the emitted SQL against a real database. See the coverage note below for where each lives and why.
- [x] Tokens added to `core/sql/tokens/sqlToken.ts` — `SQLTableReference { databaseSchemaName, tableName }`, `SQLCreateSchema { databaseSchemaName }`, both carrying `string | SQLDefaultSchemaNameToken`
- [x] Processors registered per dialect — `PostgreSQLTableReferenceProcessor`, `PostgreSQLCreateSchemaProcessor`, `SQLiteTableReferenceProcessor`, `SQLiteCreateSchemaProcessor`
- [x] `postgreSQLTableReference` / `sqliteTableReference` / `postgreSQLDatabaseSchemaSQL` emit tokens
- [x] Gate: build green, `npm run fix` green, unit **1020/1020**, int green (run by Oskar)
- [x] Review gate R — verdict: **pass, with one flag**. No second dispatch mechanism and no invented concept, but the step is **+100 production lines** — see below.

**The physical name is resolved at format time now, not at reference-construction time.** `sqliteTableName`'s `dumbo_` reservation guard therefore throws when the SQL is formatted rather than when the builder is created. That is what "resolution moves into the formatter" means, so `reserves the mapped-name prefix for native tables and indexes` was changed to format the SQL inside `assert.throws`. Its index half is untouched — `sqliteIndexReference` still resolves eagerly until S8.

**`SQLCreateSchema` was added a step early, and S9 is where it earns its place.** Oskar questioned it: every other token is a fragment that stands where a name stands, this one is a whole statement. He was right that it buys nothing in S7 — its only caller, `postgreSQLDatabaseSchemaSQL`, is already PostgreSQL-specific and already makes the default-schema test, which `PostgreSQLCreateSchemaProcessor` then makes again. The function still returns `SQL | undefined` because the processor's "nothing" is an empty string, while pongo needs no migration at all.

Resolved 2026-08-10: **`databaseSchemaComponent` owns the CREATE SCHEMA**, in S9. That file is in `core/` and has no dialect, so one line of it must render three ways — `CREATE SCHEMA IF NOT EXISTS crm` on Postgres, nothing for the Postgres default schema, nothing on SQLite. A name token cannot express that; `CREATE SCHEMA IF NOT EXISTS ${name}` leaves the literal text behind and SQLite gets broken SQL. The statement has to disappear whole, so the statement is the token. `sqlMigration` drops statements that render empty, which retires the `undefined` branch: the component emits unconditionally, the formatter decides, and `postgreSQLDatabaseSchemaSQL` plus pongo's default-schema branch are deleted. Recorded in plan.md S9.

**Integration coverage, checked rather than assumed.** The existing pongo int specs already drive the whole token path against a real database and were passing unchanged: `pongo/storage/sqlite/sqlite3/migrations.int.spec.ts` creates `users`, `dumbo_crm_table_users`, `dumbo_audit_table_users` and their mangled indexes, then inserts through them; `pongo/storage/postgresql/pg/migrations/migrations.int.spec.ts` creates the `crm` and `audit` schemas, their tables and `public.users`, then inserts through them. What they could **not** reach is `SQLDefaultSchemaNameToken` itself — pongo still resolves `defaultSchemaName` eagerly to `'public'` / `'main'`, so every int path went through the string half. That gap is now covered by three cases per dialect: a table created under the default token, a table created under a named schema, and both at once proving they land on separate physical tables. Postgres additionally runs `postgreSQLDatabaseSchemaSQL`'s `CREATE SCHEMA` and asserts it returns `undefined` for the default token.

They live in different places on purpose. SQLite got its own `schemaComponentSQL.int.spec.ts` — its pool is in-memory and costs nothing. Postgres went into the existing `core/schema/migrations.int.spec.ts` as a nested `running schema component SQL` describe, reusing that file's container. A standalone Postgres file was written first and passed, but starting one container in this environment takes ~28s against vitest's 30s hook timeout, and adding a tenth pushed nine suites into `Hook timed out`. The margin was already gone before this step; the fix is not to spend a container on three `CREATE TABLE`s when an identical one already exists in the same folder. When S13 stops the eager resolution, the pongo int specs start covering the token half too, and these may fold back in.

**Renamed, at Oskar's request — "object" said nothing:** `databaseObjectSQL.ts` → `schemaComponentSQL.ts` (both dialects, with their specs), `sqliteObjectNames.ts` → `sqlitePhysicalNames.ts`, and this step's own new files to `schemaTokens.unit.spec.ts` / `schemaProcessors.ts`. Exported function names are unchanged.

**Line delta (S7 alone, production files):** **+100**. Two new processor files (+72), tokens (+17), registrations (+15), and −4 from the two reference builders that lost their branching. This step is purely additive by plan order — it adds the token vocabulary, and S9 is what deletes the machinery it replaces (`DatabaseMigrationBuilder`, `databaseMigrations`, both pongo migration builders, `postgreSQLTableSQL` / `postgreSQLIndexSQL` as public functions). Running total since S1 is still negative; S7 and S8 are the two steps that pay in before S9 collects.

## S8 — `SQLIndexReference` + JSON target tokens
- [x] Tests written, both dialects — the two existing suites plus a multi-column and a unique-document case each
- [x] `SQLIndexReference`, `SQLJSONDocumentIndexTarget`, `SQLJSONPathTarget` + processors
- [x] `postgreSQLIndexSQL` / `sqliteIndexSQL` rebuilt on tokens
- [x] The two bodies became identical: hoisted to `core/schema/components/createIndexSQL.ts`, both deleted. `postgreSQLIndexReference` and `sqliteIndexReference` went with them — nothing outside those bodies called either
- [x] `CREATE INDEX IF NOT EXISTS` — Oskar asked for it mid-step; both dialects support it, and it matches `createTableSQL`'s `CREATE TABLE IF NOT EXISTS`. Custom `sql` callbacks are untouched, so the two `passes resolved references to custom index SQL` cases still assert bare `CREATE INDEX`. Expectations updated in both dumbo suites and both pongo `sqlBuilder.unit.spec.ts`
- [x] A unique JSON-document index is a btree index on PostgreSQL, not GIN — `SQLJSONDocumentIndexTarget` carries `isUnique` and the PostgreSQL processor drops `USING GIN` for it. Covered by a unit test per dialect and by a PostgreSQL int test that reads `pg_am` back
- [x] Gate: build, fix, unit (1024 pass), int
- [x] Review gate R — verdict: **+34 production lines, flagged to Oskar**

**The JSON target tokens render the whole target clause, parentheses included.** That is the only shape that works: PostgreSQL puts `USING GIN` *outside* the parens (`ON users USING GIN (data)`) while SQLite puts the expression inside them (`ON users (json_extract(data, '$.a.b'))`). A token that rendered only the column expression would leave the surrounding `(` `)` and the access method in dialect-free core, where neither can be decided. With the whole clause tokenised, core's `createIndexSQL` is one statement template for both dialects.

**Bug fixed: a unique JSON-document index silently lost its uniqueness on PostgreSQL.** The old `postgreSQLIndexSQL` hardcoded `USING GIN` for that target and dropped `isUnique` — you declared a uniqueness constraint and got a plain index, with nothing said. GIN genuinely cannot be unique, but jsonb has a btree operator class, so `CREATE UNIQUE INDEX ... ON users (data)` is valid PostgreSQL and enforces whole-document uniqueness. The access method is therefore a consequence of `isUnique`, which is why `SQLJSONDocumentIndexTarget` carries it:

|          | non-unique         | unique          |
| -------- | ------------------ | --------------- |
| Postgres | `USING GIN (data)` | `(data)` btree  |
| SQLite   | `(data)`           | `(data)`        |

Oskar raised it — Marten supports unique indexes over JSONB, which is what made the "unique document index is meaningless" reading wrong. Marten's own unique indexes are btree over an extracted expression (`(data ->> 'UserName')`), which is the `jsonPathIndexTarget` case and already worked. `migrations.int.spec.ts` now asserts the access methods against a live PostgreSQL through `pg_am`: `gin` for the plain document index, `btree` for the unique one. The `users` fixture there gained a nullable `data` JSONB column to make that possible.

**Line delta (S8 alone, production files): +34.** Deletions: `postgreSQLIndexSQL` and its helper (−62), `sqliteIndexSQL` and its helper (−68), pongo's two builders (−3). Additions: `createIndexSQL.ts` (+53), tokens (+30), the two processor files (+76), registrations (+16). Same shape as S7 — the token vocabulary is paid for up front and S9 collects. Running total since S1 stays negative, but S7's +100 and S8's +34 mean S9 has to delete real weight, not just move it.

**Int status.** dumbo's PostgreSQL `migrations.int.spec.ts` 14/14, both SQLite schema int specs 21/21. `test:int:sqlite` also reports 3 failures in `sqlite3/connections/connection.int.spec.ts` and 4 in `d1/connections/connection.int.generic.spec.ts`. The sqlite3 three pass in isolation — timing flakes under a loaded run. The D1 four reproduce in isolation and are `D1TransactionNotSupportedError` from `withTransaction` outside `session_based` mode: transaction semantics, no DDL involved, and the same four failed in the pre-S8 run.

## S9 — Components emit their own DDL
- [ ] Tests written and failing, including the database-level-extension regression
- [ ] `tableComponent` emits create-table via `createTableSQL`
- [ ] `indexComponent` emits create-index
- [ ] `databaseSchemaComponent` emits create-schema — `SQLCreateSchema` unconditionally, no default-schema test in the component
- [ ] `sqlMigration` drops statements that render empty — this is what lets the component emit unconditionally
- [ ] Postgres `core/schema/migrations.int.spec.ts` — the `running schema component SQL` describe S7 added asserts `postgreSQLDatabaseSchemaSQL(...) === undefined` for the default token. Rewrite it against the component's migrations; keep the three database-level assertions
- [ ] Deleted: `databaseMigrations.ts`
- [ ] Deleted: `DatabaseMigrationBuilder`
- [ ] Deleted: the four identifier types
- [ ] Deleted: `postgreSQLTableSQL`, `postgreSQLIndexSQL`, `postgreSQLDatabaseSchemaSQL`, `sqliteTableSQL`, `sqliteIndexSQL`
- [ ] Deleted: pongo `databaseMigrations.ts` × 2, both migration builders, the `migrationBuilder` option
- [ ] Both `sqlBuilder.unit.spec.ts` files read `.migrations()`
- [ ] `grep "components: \[\] }"` returns nothing — the last reader of the `this` binding, which is what unblocks S4
- [ ] Gate: build, fix, unit, **int**
- [ ] Review gate R — verdict: ____ (must show a large net deletion)

## S4 — The factory owns its literal

Runs **after S9**, not after S3. `databaseMigrations.ts` gets a component's own declared migrations by spreading it with an emptied child list — `{ ...component, components: [] }.migrations()` — which only works while `migrations` resolves children through `this`. D2 replaces `this` with a closure over the factory's own `children`, so the spread stops removing anything, the clone returns its whole subtree, and the per-component `declared, driver, declared, driver` interleaving asserted by `databaseMigrations.unit.spec.ts` breaks. That is a live path: `pongoDb.ts:209` runs every pongo migration through it. The alternatives were hacking around the missing `this` in a file that is about to be deleted (gate R question 2 — a deleted concept leaving a remnant) or pulling S9 forward without the S7/S8 tokens it needs. S9 deletes the file, so waiting costs nothing; S5–S9 do not need `createSchemaComponent` gone. Agreed with Oskar 2026-08-10.

- [ ] All six factories return their own object literal
- [ ] `componentMigrations` is the only shared helper, module-private
- [ ] `createSchemaComponent` deleted
- [ ] `fields` bag deleted
- [ ] `context` option deleted
- [ ] `scopedContext` deleted
- [ ] `Object.freeze` on the component deleted (records stay frozen)
- [ ] No `this` in any factory
- [ ] `as unknown as` casts removed where the bag was their cause
- [ ] `declares against the component it is read from, not the one it was built from` deleted — it asserts the `this` binding that D2 removes on purpose — and recorded here
- [ ] Gate: build, fix, unit, **int**
- [ ] Review gate R — verdict: ____

## S10 — The migration table is a real table component
- [ ] Golden test written and failing: DDL byte-identical to `main`
- [ ] `migrationTableComponentFor` returns a `tableComponent` in a real schema
- [ ] Deleted: `schemaComponent()`, `genericComponentType`
- [ ] Gate: build, fix, unit, **int**
- [ ] Review gate R — verdict: ____

## S11 — Migration naming moves into dumbo
- [ ] Golden test written and failing: `pongoCollection:users:001:createtable`, literal string
- [ ] Schema-qualified, schema-component, index and plain-dumbo name tests
- [ ] Accepted divergence asserted deliberately (explicit `public` on pg)
- [ ] `migrationNamePrefix` option added; pongo passes its three prefixes
- [ ] Deleted: `packages/pongo/src/storage/migrationNames.ts` and all three functions
- [ ] Gate: build, fix, unit, **int**
- [ ] Review gate R — verdict: ____ (watch: is `migrationNamePrefix` net-negative?)

## S12 — SQLite physical names use the logical name
- [ ] Tests written and failing (mapped name, default name, dot rejection, index name)
- [ ] `crm.users` maps to `crm.users`; default schema maps to `users`
- [ ] Deleted: `escapeName`, `SQLiteMappedNamePrefix`
- [ ] `assertNativeName` rejects a default-schema identifier containing a dot
- [ ] Break stated in the step summary; no migration attempted
- [ ] Gate: build, fix, unit, **int**, **e2e**
- [ ] Review gate R — verdict: ____

## S13 — `defaultSchemaName` optional in `pongoDb`
- [ ] Tests written and failing (unnamed default, explicit override, per-collection override, scope guard)
- [ ] `defaultSchemaName` optional throughout `pongoDb`
- [ ] `pongoDb.ts:100` no longer resolves it eagerly
- [ ] Collections without one go into `dumboSchema.defaultSchema(...)`
- [ ] **Clears S6's dual encoding.** Delete the `|| x === <dialect default string>` half of the default-schema test in its three remaining homes as of S7 — `isDefaultSchema` in postgresql `sql/processors/schemaProcessors.ts`, `sqliteTableName` and `sqliteIndexName` in `sqlitePhysicalNames.ts`, and `schemaSegment` in pongo's `migrationNames.ts` if S11 has not deleted that file. `postgreSQLDatabaseSchemaSQL` is not among them; S9 deletes it. Once pongo stops passing `'public'` / `'main'` as a real schema name, the token is the only encoding, and an explicitly given `public` / `main` becomes a named schema that carries its segment — the divergence S11 asserts deliberately.
- [ ] Gate: build, fix, unit, **int**
- [ ] Review gate R — verdict: ____

## S14 — Collections normalise into the tree
- [ ] Tests written and failing (ad-hoc schema, merge, duplicate-table throw, late collection, idempotence)
- [ ] `withTable` get-or-creates the schema component
- [ ] Schema components sharing a key merge; duplicate table name within a schema throws
- [ ] Deleted: `composePongoDatabase`, the `withValue` stash and its duplicate throw
- [ ] Deleted: `pongoSchemaComponentType`, `pongoDatabaseComponentType`, `isPongoSchemaComponent`, `isPongoDatabaseComponent`, `withValue`
- [ ] `pongoCollectionComponentType` kept only if `pongoDb.ts:255` still needs it, else a type-level brand
- [ ] Gate: build, fix, unit, **int**, **e2e**
- [ ] Review gate R — verdict: ____

## S15 — Extension as a database fragment
- [ ] Type spec written and failing: `db.schemas.readmodels.tables.users`
- [ ] Placement tests (schema-attached resolves that schema, database-attached keeps its own)
- [ ] Two-extension schema merge test
- [ ] Projection-factory test
- [ ] `extensionComponent` gains `schemas` / `extensions`
- [ ] `databaseComponent` merges extension schemas, typed as a record intersection
- [ ] No conditional recursion in the types — stop and ask if it starts creeping in
- [ ] Gate: build, fix, unit, **int**
- [ ] Review gate R — verdict: ____

## S16 — Event-store example
- [ ] `eventStore` extension factory over projection registrations
- [ ] `messages` in `emt`; one read-model table per projection in its own schema
- [ ] Composed into a `pongoDb`
- [ ] E2E on Postgres
- [ ] E2E on SQLite
- [ ] Name-based reference resolves to the correctly qualified identifier
- [ ] Migrating twice is a no-op
- [ ] Gate: build, fix, full suite
- [ ] Review gate R — verdict: ____

## S17 — Final sweep
- [ ] Every deleted symbol verified gone, including re-exports and `dist` barrels
- [ ] Dead code, orphaned specs, stale index entries cleaned
- [ ] Docs and samples updated for `dumboSchema.defaultSchema` and required names
- [ ] `metrics/final.md` written with before/after and the net delta
- [ ] `npm run build:ts`, `npm run fix`, `npm run test` — pristine, no skips
- [ ] Summary written for Oskar
- [ ] Nothing committed
