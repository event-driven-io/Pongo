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

## S9 — Components emit their own DDL — **done**

Folded in **S11** (migration naming moves into dumbo) and the naming half of **S13** (pongo's unnamed default schema carries the token, not `'public'` / `'main'`). Neither could be separated: a component that emits its own DDL needs a name for it, and a name that stays byte-identical for the default case needs the token. Agreed with Oskar 2026-08-10.

- [x] Tests written and failing, including the database-level-extension regression — `core/schema/components/componentMigrations.unit.spec.ts`, the successor to `databaseMigrations.unit.spec.ts`
- [x] `tableComponent` emits create-table via `createTableSQL` — except when it declares no columns, which is a placeholder for a table declared elsewhere and has no valid `CREATE TABLE` (`CREATE TABLE x ()` is a syntax error in SQLite)
- [x] `indexComponent` emits create-index, and `createIndexSQL` moved into it — the two were mutually recursive as separate modules
- [x] `databaseSchemaComponent` emits create-schema — `SQLCreateSchema` unconditionally, no default-schema test in the component
- [x] Statements that render empty are dropped, and a migration left with none is neither run nor recorded — `rendersNothing` in `migrator.ts`. This is what lets the component emit unconditionally
- [x] Migration naming moved into dumbo — `core/schema/components/migrationNames.ts`; pongo's `storage/migrationNames.ts` deleted
- [x] Postgres `core/schema/migrations.int.spec.ts` — the `running schema component SQL` describe now runs the component tree's migrations through `runSQLMigrations`; the three database-level assertions kept
- [x] Deleted: `databaseMigrations.ts`
- [x] Deleted: `DatabaseMigrationBuilder`
- [x] Deleted: the four identifier types — `sqlitePhysicalNames` and `createIndexSQL` type against `SQLTableReference` / `SQLIndexReference`, which is what they are handed
- [x] Deleted: `postgreSQLTableSQL`, `postgreSQLDatabaseSchemaSQL`, `sqliteTableSQL` (`postgreSQLIndexSQL` and `sqliteIndexSQL` went in S8)
- [x] Deleted: pongo `databaseMigrations.ts` × 2, both migration builders, the `migrationBuilder` option
- [x] Both `sqlBuilder.unit.spec.ts` files read `.migrations()`
- [x] `grep "components: \[\] }"` returns nothing — the last reader of the `this` binding, which is what unblocks S4
- [x] Gate: build, fix, unit (1024 pass), int
- [x] Review gate R — verdict: **−100 production lines**, the first net deletion since S6

**Line delta (S9 alone, production files): −100.** 390 deleted, 290 added (244 in tracked files, 46 in the new `migrationNames.ts`). S7's +100 and S8's +34 are paid back.

**How a component is named.** `SchemaComponentContext` gained `migrationNamePrefixes`, and `pongoDb` passes `{ databaseSchema: 'pongoSchema', table: 'pongoCollection', index: 'pongoIndex' }` when it reads `.migrations()`. **Oskar flagged this and he is right: it is the reader deciding, not the component.** Read a tree from pongo and every table in it is called a collection, including an event-store extension table that isn't one — which S16 will hit. The prefix belongs on the component, set by the factory that built it. Agreed to revisit; see the open questions below.

**Migration names that changed, and why.**

| before | after | why |
|---|---|---|
| `pongoIndex:main:users:users_email_idx:create` | `pongoIndex:users:users_email_idx:create` | the default schema contributes no segment. Index names never elided it while collection names did — D10 |
| `pongoCollection:users:001:createtable` | unchanged when the schema is left unnamed | `pongoSchema.db({ collections })` puts them in a token-named schema |
| `pongoCollection:users:001:createtable` | `pongoCollection:public:users:001:createtable` when the definition writes `pongoSchema.schema('public', …)` | D10's accepted divergence, and it fires for a common definition shape — see the open questions |

**A pongo definition cannot yet mix an unnamed default schema with named ones.** `pongoSchema.db` takes either `collections` or `schemas`, so a database with both writes `pongoSchema.schema('public', …)` and takes the divergence above. Closing that needs `pongoSchema.defaultSchema` to work inside `db({ schemas })`, which needs the record-key question answered.

**The default schema's record key is `''`.** `databaseComponent.schemas` is keyed by name, and a schema carrying the token has none. `''` is unforgeable only because `databaseSchemaComponent` rejects it as a name — a rule in one file protecting an assumption in another. Alternative on the table: drop the key entirely and give `DatabaseComponent` a separate `defaultSchema` field, since at most one can exist. Oskar deferred this.

**Explicitly naming the dialect's default schema is now a named schema at runtime too**, not only in migration names: `db.collection('users', { databaseSchemaName: 'public' })` and `db.collection('users')` are two collections over the same physical table. Asserted in `pongoDb.unit.spec.ts`.

**Int status.** Run individually: pongo `migrations.int.spec.ts` (pg) and `migrations.int.spec.ts` (sqlite3) 6/6, dumbo Postgres and SQLite schema specs 54/54, unit 1024/1024. A full `test:int:sqlite` sweep also reports Postgres testcontainer start-up failures across unrelated suites — the machine cannot start that many containers at once; those same suites pass alone. The four D1 `withTransaction` failures are the pre-existing ones from S8.

**Open, agreed with Oskar, before the branch is done**
- The prefix shape. `pongoCollection` fuses a namespace and a kind. Options discussed: keep it as a per-component string for byte-compatibility with released databases, or rename to `pongo:users:collection:001:createtable` — namespace, path, kind — so the component carries one word and the kind comes from its type. A compatibility call, not a code call.
- Move the prefix off the read context and onto the component, wherever the shape lands, with `withTable` carrying it for a schema it creates from nothing.
- `defaultSchemaKey` in `pongoDb` and the `options.x ?? context.x ?? token` chains in the three factories: the fallback belongs once in `createSchemaComponent`, which makes `context.databaseSchemaName` sufficient everywhere.
- The default schema's record key, above.
- **Is `kind` earning its keep?** (raised in S10) The `[schemaComponentType]` symbol is stamped by every factory and read by six `isXComponent` predicates, but in `src` those predicates are called in exactly three production places — `pongo/src/core/schema/index.ts:498-520` — and each of those already checks its own pongo marker (`pongoCollectionComponentType in value` and friends), which is strictly narrower. `findComponents` no longer exists in `dumbo/src`. Type-level branding is real, but the component types are already structurally distinct through their own fields. Decide before the branch ends.

## S4 — The factory owns its literal

Runs **after S9**, not after S3. `databaseMigrations.ts` gets a component's own declared migrations by spreading it with an emptied child list — `{ ...component, components: [] }.migrations()` — which only works while `migrations` resolves children through `this`. D2 replaces `this` with a closure over the factory's own `children`, so the spread stops removing anything, the clone returns its whole subtree, and the per-component `declared, driver, declared, driver` interleaving asserted by `databaseMigrations.unit.spec.ts` breaks. That is a live path: `pongoDb.ts:209` runs every pongo migration through it. The alternatives were hacking around the missing `this` in a file that is about to be deleted (gate R question 2 — a deleted concept leaving a remnant) or pulling S9 forward without the S7/S8 tokens it needs. S9 deletes the file, so waiting costs nothing; S5–S9 do not need `createSchemaComponent` gone. Agreed with Oskar 2026-08-10.

- [x] All six factories return their own object literal — plus `schemaComponent()`, whose literal S10 deletes with it
- [x] `dedupeMigrations` is the only shared helper — one parameter, D4 only. Each factory writes the merge inline: own DDL, then the caller's `migrations` option, then `children.flatMap`. No `componentMigrations`, no declaration local, no component or child list passed anywhere
- [x] `SchemaComponentDeclaration` deleted; the `migrations` option carries its signature inline
- [x] The `migrations` option drops its `component` parameter — `(context) => ReadonlyArray<SQLMigration>`. `context` stays: D1 forbids reading placement off a component, so it is the only way a user-written migration can learn its qualifier, and it is what D18 exists for
- [x] `passes the component itself to its declaration` deleted — its whole body asserts that the parameter is passed, so it tests the parameter's own existence and nothing else
- [x] `createSchemaComponent` deleted
- [x] `fields` bag deleted
- [x] `context` option deleted
- [x] `scopedContext` deleted — its "scope wins, `undefined` never clobbers" precedence survives as `options.databaseSchemaName ?? context.databaseSchemaName` in `tableComponent`, and as a plain spread in `databaseSchemaComponent`, where the name is always defined
- [x] `Object.freeze` on the component deleted; each factory still freezes its own `children` array and `schemaComponentMap` still freezes the typed records
- [x] No `this` in any factory
- [x] `as unknown as` casts removed where the bag was their cause — `indexComponent`'s is gone. `columnSchemaComponent`'s survives: its cause is the conditional return type plus `SQLColumnToken` being a notNull/nullable union that a literal built from `boolean | undefined` cannot satisfy under `exactOptionalPropertyTypes`. The two `self as AnyTableComponent` / `self as AnyIndexComponent` casts inside the declarations are gone with `SchemaComponentDeclaration` — their cause was its `AnySchemaComponent` parameter, and dropping the parameter drops them
- [x] `declares against the component it is read from, not the one it was built from` deleted — it asserts the `this` binding that D2 removes on purpose
- [x] Gate: build green, `npm run fix` green, unit **1022/1022** (1024 − two deleted tests), int **374/374**. The four D1 `D1TransactionNotSupportedError` failures live in `connection.int.generic.spec.ts`, which the `.int.spec` filter does not match; they surface only under `test:int:sqlite`, which was not run
- [x] Review gate R — verdict: **pass**

**Second test edited, beyond the sanctioned one.** `exposes a frozen component with nothing hidden behind it` asserted `Object.isFrozen(root)` on the component itself, which is exactly what this step deletes. That one assertion is gone and the test is now `exposes a component with nothing hidden behind it`; its other claims — no hidden own properties, `schemaComponentType` the only symbol, a spread copy still migrates — all survive.

**Gate R, questions 1, 2 and 4: pass.** One new symbol, `dedupeMigrations`, and it is D4's rule with a name rather than a layer — it takes a list and returns a list. No remnant: `createSchemaComponent`, `scopedContext`, the `context` option and `SchemaComponentDeclaration` have zero references outside `schemaComposition.type.spec.ts:93`, which asserts their absence deliberately. Nothing contradicts spec.md — D2's worked example was corrected to the single-parameter call.

**The helper's shape, settled with Oskar 2026-08-11.** The first implementation gave `componentMigrations` a fourth parameter, the declaration, because spec D2's own signature `(component, children, context)` could not reach it — the declaration lives in the factory closure by D2's next paragraph, and neither `component` nor `children` carries it. D2 was internally inconsistent on that point. Three shapes were rejected before the fourth was taken:

- the fourth parameter — a helper that takes both the migrations and the function producing them
- `(component, context, declaration)`, dropping `children` since the component already exposes them — still an internal declaration concept
- expressing the own DDL as an extra child, so `migrations` collapses to a bare `flatMap` over `components` — rejected because it puts a member in `components` the caller never declared, breaks the deep-equality assertions reading it, and needs a component kind for the emitter that D19 obliges it to name, with no catch-all to reach for

**The `component` parameter goes with it.** Nothing reads it: every caller of the `migrations` option, in production and in the integration specs, is `() => [...]`. The sole exception was a test asserting that the parameter is passed. It existed because `createSchemaComponent` had to hand the component over — the declaration was written before the component object existed, so there was no closure to read it from. That constraint dies with the bag, which makes the parameter a remnant of it under gate R question 2.

What was taken: the helper does D4's dedupe and nothing else, one parameter, and every factory writes its own merge inline. `SchemaComponentDeclaration` goes with the concept — its only two readers were its own declaration and the `migrations` option on `SchemaComponentOptions`, which now writes the signature inline. Naming a one-use function type is what made "the declaration" look like something the design had. spec.md D2 and plan.md S4 were rewritten to match before the code was touched.

**Gate R question 3: growth, declared in advance and undershot.** The four-parameter version measured **+17**. plan.md S4 declared roughly **+35** for the inline merge in six factories, so ground rule 5 is satisfied by declaration rather than by staying flat. The landed figure is **+10** (211 added, 201 deleted, `git diff --numstat` over `packages/**/*.ts` less specs) — dropping the `component` parameter took the type signature from six lines to three and paid back most of what the inline merges cost.

## S10 — The migration table is a real table component
- [x] Golden test written and failing first. One exact literal per dialect, **not** byte-identical to `main`'s; see below for what was asserted instead, why, and why it is one file per storage rather than one in core
- [x] `migrationTableComponentFor` returns a `tableComponent`, wrapped in a `databaseSchemaComponent` when it is asked to create the schema. The five columns are `columnSchemaComponent` declarations over the same `AutoIncrement` / `Varchar` / `Timestamp` tokens; `createTableSQL` renders them per dialect
- [x] Deleted: `genericComponentType`
- [x] `schemaComponent()` kept, with its kind as a **required first parameter** and **no catch-all kind** — `schemaComponent(kind, options)` at `schemaComponent.ts:68`, `Kind` inferred `const`. S10 first deleted it alongside `genericComponentType`, which is what the step was written to do; D19's revision below reverses that half. `groupComponentType` was written and then dropped with it
- [x] Golden tests split by dialect — `storage/postgresql/core/schema/migrationTableComponent.unit.spec.ts` and `storage/sqlite/core/schema/migrationTableComponent.unit.spec.ts`; the core file is deleted
- [x] The same rule applied to the two core specs that already broke it, rather than carried to S17 — `core/schema/components/createTableSQL.unit.spec.ts` trimmed to its dialect-agnostic test, `core/sql/tokens/schemaTokens.unit.spec.ts` deleted. See below. No core file imports from `storage/` any more; `grep -rn "storage/" packages/dumbo/src/core` returns nothing
- [x] Gate: unit — dumbo **692/692**. Pongo's suites read the built `dist`, so their number belongs to the run that rebuilds it
- [ ] Gate: build, fix, **int** — numbers owed. The unit figure above predates both the `schemaComponent(kind, …)` restoration and the golden-test split, so it is not evidence for them
- [x] Review gate R — verdict: **pass on the migration table, reversal on the deletion**. Question 1, new abstraction: none — the table is composed from `tableComponent`, `columnSchemaComponent` and `databaseSchemaComponent`, all of which already existed, and the hand-written `CREATE TABLE` string is gone with nothing standing in for it. Question 2, remnant: this is where it caught. Deleting `schemaComponent()` left every generic-composition test with nothing to compose through, and the answer was to revise D19 rather than hack around it

**D19's second half was wrong; `schemaComponent()` comes back with a required kind.** Two things made the deletion look safe: the migration table was its only production caller, and its kind was untyped. The first is not evidence — `SchemaComponentMigrator` takes exactly **one** component (`schemaComponentMigrator.ts:78`), so a caller holding several needs a way to hand them over as one unit, and for a library's composition entry point "no in-repo caller" is not "no purpose". The second showed up in the tests: **15 tests in `schemaComponent.unit.spec.ts` were rewritten onto `extensionComponent`** through a new local `extensionWith` helper, so tests whose subject is plain composition now say "extension" — the concept lying about itself that gate R question 2 exists to catch.

The revised shape: `schemaComponent(kind, options)` returning `SchemaComponent<Kind>`, and nothing else. `genericComponentType` still goes, and requiring the kind is what closes the hole it left — it meant "we didn't say" and was what you got by omission. The factory is still worth keeping because it writes the frozen child list and the standard merge (own migrations, then the children's, deduped), which is the part a caller should not be hand-rolling; what it no longer does is let the caller skip saying what the thing is. Recorded as spec.md D19 and plan.md S10.

**`groupComponentType` was written, then dropped.** The first draft of the revision exported one, meaning "these components travel together and migrate as one unit", so a caller with nothing better to say had something to pass. Dropped on review: that is `genericComponentType` under a better name — a kind the library hands out instead of one the caller declares, and the first thing anyone reaches for who has not thought about what they are building. There is no catch-all kind of any sort now: the three tests that named the symbol pass their own kind instead.

**What the golden test asserts, and what it deliberately does not.** Byte-identical to `main`'s was not achievable and was dropped knowingly. `createTableSQL` emits a single line where the old hand-written literal was multi-line, and nothing downstream compares the text: `migrator.ts:141-145` hands the core migrations to `execute.batchCommand` directly instead of `runSQLMigration`, so they are never hashed and never recorded. What is asserted is an exact literal per dialect — the same five columns in the same order, `application` defaulting to `'default'`, `timestamp` to `CURRENT_TIMESTAMP`, `name` unique and not null, and `IF NOT EXISTS` — plus the schema-qualified, no-schema and custom-table-name cases by migration name.

**Where those golden tests live, and why not in core.** Rendering the DDL needs a formatter, so the first draft imported `pgFormatter` and `sqliteFormatter` into `core/schema/migrators/migrationTableComponent.unit.spec.ts` — core reaching into `storage/`, the dependency direction the package layout exists to forbid, in tests as much as in production. Split into one file per dialect under `storage/postgresql/core/schema/` and `storage/sqlite/core/schema/`, each asserting its own literal, and the core file deleted. The component itself stays in core and stays dialect-free; only the assertion about how it renders belongs to a dialect. Recorded as a durable constraint in spec.md §5, since it is not a fact about the migration table.

**The two core specs that already broke that rule, fixed here rather than in S17.** Both pulled `pgFormatter` or `sqliteFormatter` out of `storage/`. Deferring them would have meant writing the rule into the spec and leaving it broken next door in the same step, which is how a rule stops being one. It was two files and no production change.

`core/schema/components/createTableSQL.unit.spec.ts` keeps `infers portable column values from the declaration` — a pure `expectTypeOf` over `TableRowType` with no formatter in it. Its two rendering tests moved to `storage/postgresql/core/schema/createTableSQL.unit.spec.ts` and `storage/sqlite/core/schema/createTableSQL.unit.spec.ts`, unchanged apart from their describe naming the dialect. Three tests before, three after.

`core/sql/tokens/schemaTokens.unit.spec.ts` is **deleted**, not trimmed. All ten of its tests rendered SQL through `pgFormatter`, `sqliteFormatter` or both via a local `formatted()` helper; not one was dialect-agnostic, so after the move the file had zero tests and vitest fails a spec file that declares none. It is recoverable from git if that call is reversed. Its tests live in new `schemaTokens.unit.spec.ts` files under `storage/postgresql/core/sql/formatter/` and `storage/sqlite/core/sql/formatter/` — chosen over each package's `core/schema/` because they build a bare `SQLTableReference` or `SQLCreateSchema` and assert what that dialect's formatter makes of it, which is the layer `sqlFormatter.unit.spec.ts` next door already occupies.

Ten tests became **19** — PostgreSQL 10, SQLite 9. Nine dual-dialect cases split into one test per dialect with the same expected text, and `quotes a reserved schema name` was PostgreSQL-only already. The split adds coverage in one place: `refuses a native SQLite table name that would collide with a mapped one` gained a PostgreSQL half, `accepts a native table name that SQLite would reserve`, which asserts the reservation is SQLite's alone. No assertion weakened.

**The migration table's migration name changed** from `dumbo:migrationTable:001` to `dumboTable:dmb_migrations:001:createtable`, because the name now comes from the component the way every other table's does. It is not a compatibility break: the name is never written to the ledger, for the same bypass reason above. The four `WHERE name <> …` filters in the two dumbo `migrations.int.spec.ts` files were updated to the new string; the filter was already matching nothing before this step and still matches nothing — pre-existing, left alone.

**Deleted test, with reason**
- `composes a frozen child list without changing it` — its subject was `schemaComponent({ components: [...] })` accepting a caller-owned frozen array and not writing through it. `extensionComponent` takes a keyed map, so there is no array to hand it. The claim survives the revision, so this test comes back with `schemaComponent(kind, options)`.

**Line delta (S10 alone, production files): −5.** `schemaComponent.ts` −22, `core/schema/index.ts` −2, `schemaComponentMigrator.ts` +19 — the hand-written literal became five column declarations. Restoring `schemaComponent(kind, options)` puts most of the −22 back, so S10 lands near flat. Tests **+265**: 393 lines of new spec files against −128 across the tracked ones. The dialect split is nearly all of it — one core file that rendered through both formatters becomes two, each carrying its own imports, fixture and expected literal. That is what the rule costs, and it buys a package boundary the build can enforce.

## S11 — Migration naming moves into dumbo
- [x] **Done earlier in S9.** Naming lives in `dumbo/core/schema/components/migrationNames.ts`; `packages/pongo/src/storage/migrationNames.ts` is gone
- [x] Golden/default/schema-qualified/index/plain-dumbo naming coverage landed with S9
- [x] Accepted divergence asserted deliberately: explicitly named `public` / `main` carries a schema segment in migration names
- [x] Removed `MigrationNamePrefixes`, `migrationNamePrefixes`, and `pongoMigrationNamePrefixes`; readers no longer select component identity
- [x] Final grammar is `<type>:<kind>:<path>:<sequence>:<operation>`, with `001:create` for schema/table/index DDL
- [x] `kind` is passed through the existing schema/table/index factory options; defaults to `relational`, while Pongo passes `pongo_collection` / `pongo_index`
- [x] Caller-declared `sqlMigration` names and dedupe/conflict semantics remain unchanged
- [x] Review gate R — verdict: **pass**. Three option fields replace the removed prefix types/context; no resolver, registry, marker lookup, or wrapper was introduced

## S12 — SQLite physical names use the logical name
- [x] Tests written and failing first: `sqlitePhysicalNames.unit.spec.ts` failed on old `dumbo_crm_table_users` mapping and missing dotted-name guard
- [x] `crm.users` maps to raw SQLite object name `crm.users`; formatted SQL quotes it as `"crm.users"`. Default schema token maps to `users`
- [x] Indexes in named schemas map to `<schema>.<indexName>`, e.g. `crm.users_email_idx`
- [x] Deleted: `escapeName`, `SQLiteMappedNamePrefix`
- [x] `assertNativeName` rejects a default-schema table or index identifier containing `.`
- [x] Updated SQLite expectations in dumbo formatter/schema SQL specs, pongo SQLite SQL-builder specs, sqlite3 migration int spec, and D1 e2e spec
- [x] Break stated here: existing SQLite tables/indexes in non-default schemas are renamed from the old `dumbo_<schema>_table_...` shape to dotted logical names. No migration attempted
- [ ] Gate: build, fix, unit, **int**, **e2e** — `build:ts` green after the change; focused unit specs green before the S14 revert. Full fix/unit/int/e2e still owed
- [ ] Review gate R — verdict: ____

## S13 — `defaultSchemaName` optional in `pongoDb`
- [x] Naming half done earlier in S9: `defaultSchemaName` is optional in `pongoDb`, `pongoDb.ts` no longer eagerly resolves it for the no-option case, and collections without one use the default schema token
- [x] Tests written and failing for the remaining dual-encoding cleanup: formatter/physical-name specs failed while explicit `public` / `main` still rendered as default
- [x] Removed the dialect-string default branch from PostgreSQL `isDefaultSchema`
- [x] Removed the dialect-string default branch from `sqliteTableName` and `sqliteIndexName`
- [x] `schemaSegment` in pongo's old `migrationNames.ts` was already gone with S11/S9
- [x] Explicitly named `public` / `main` is now treated as a named schema by the DDL formatters / SQLite physical-name mapper
- [x] `PongoDatabase` no longer receives the driver's metadata default schema name as an eager `defaultSchemaName`; only an explicit option is forwarded
- [x] Behavior coverage updated for explicit override/default-token separation through client/cache tests, formatter tests, SQL-builder tests and migration integration fixtures
- [ ] Gate: build, fix, unit, **int** — build and unit are green; focused integration for touched migration paths is green. Full `test:int` still fails in broad sweep on PostgreSQL Testcontainers hook timeouts and one SQLite transaction timeout
- [x] Review gate R — verdict: **pass**. No new abstraction; the remaining behavior is the explicit override/default-token split described in D11

## S14 — Collections normalise into the tree
- [x] Coverage landed for runtime schema creation through `db.schema.component`, static projected-schema typing, duplicate physical table names, late collection migration and idempotent re-run
- [x] Preserve the existing API. No `pongoSchema.collection.of<User>()` or other new document-binding API
- [x] Static declarations stay strongly typed through `PongoDbWithSchema<typeof definition>`
- [x] Dynamic `db.collection<User>('users', { databaseSchemaName })` returns a typed collection and updates `db.schema.component`, but does not grow new static DB properties
- [x] `withTable` remains the runtime path for late collections; direct `pongoSchema.db({ collections })` normalises into schema components at declaration time
- [x] Schema components sharing a key merge; duplicate table name within a schema throws from Dumbo schema construction
- [x] Deleted: `composePongoDatabase`, the `withValue` stash and its duplicate throw
- [x] Deleted: `pongoSchemaComponentType`, `pongoDatabaseComponentType`, `isPongoSchemaComponent`, `isPongoDatabaseComponent`, `withValue`
- [x] `pongoCollectionComponentType` kept because `PongoDatabase.collection` still has a real production reader
- [ ] Gate: build, fix, unit, **int**, **e2e** — build and unit are green; focused integration for touched paths is green. Full `test:int` fails on environment/timeouts; e2e not run
- [x] Review gate R — verdict: **pass after correction**. The bad runtime-composer attempt was removed. Landed shape is declaration-time normalisation plus the existing `withTable` late-runtime path, with no public API change

**Bad attempt, rejected 2026-08-11.** I started S14 with improper fixes: test-side non-null assertions / softened assertions, removing `<User>` from a test to dodge inference, branchy option-object construction, a weak structural replacement for the Pongo collection marker, and a runtime composer under another name. Oskar called this out. Those shapes are not the landed implementation.

**Typing decision, agreed after the rejection.** Do not try to infer a literal schema key from `pongoSchema.collection<User>('users', { databaseSchemaName: 'audit' })` and then make a dynamic DB value expose `db.audit.users`. TypeScript cannot infer later literal generics after the explicit `User` argument without changing the API, and the API must be preserved. Dynamic collection creation is runtime mutation only; strong projected access belongs to schemas declared up front.

## S15 — Extension as a database fragment
- [x] Vitest `expectTypeOf` coverage proves `database.schemas.readmodels.tables.users` and nested extension schemas retain exact component types
- [x] Placement coverage: schema-attached extensions accept only the same physical schema; database-attached schemas keep default/named paths
- [x] Duplicate schema keys throw across direct schemas, extensions, and nested extensions; lossful schema merging was removed from the contract
- [x] `extensionComponent` exposes frozen `schemas` / `extensions` records and traverses direct schemas followed by nested extensions
- [x] `databaseComponent` exposes extension schemas as original component references through a non-recursive record intersection
- [x] Existing duplicate-table and migration dedupe/conflict assertions remain
- [x] Focused gate: build green; 87 schema/component tests green; Dumbo migration integration PostgreSQL 14/14 and SQLite 18/18
- [x] Review gate R — verdict: **pass**. No schema reconstruction, runtime wrapper, resolver, declaration layer, or second migration traversal

## S16 — Event-store example
- [x] Public-API `event-store` extension fixture added to both Pongo migration integration specs
- [x] `messages` uses the default schema and `kind: 'event_store'`; Pongo `users` uses the physical `readmodels` schema
- [x] Composed into a Pongo database without `runtimeDatabaseComponent`, provider namespaces, or projected mixed-schema DB properties
- [x] Vitest `expectTypeOf` proves exact extension/database table types and `PongoCollection<User>` from `db.collection<User>(...)`
- [x] PostgreSQL integration 4/4, including migrate-twice, physical tables, typed read/write, exact generated names, and exact ledger rows
- [x] SQLite integration 2/2 with the same behavioral proof
- [x] Root-time name-reference resolution removed from S16 because the repository does not implement it; no resolver abstraction was added for the example
- [ ] Gate: full build, fix, unit, int, e2e — final sweep below
- [x] Review gate R — verdict: **pass**. Existing public APIs and collection marker usage are preserved; no cast, monkey patch, or runtime composition helper was added

## S17 — Final sweep
- [ ] Every deleted symbol verified gone, including re-exports and `dist` barrels
- [ ] Dead code, orphaned specs, stale index entries cleaned
- [ ] Docs and samples updated for `dumboSchema.defaultSchema` and required names
- [ ] `metrics/final.md` written with before/after and the net delta
- [ ] `npm run build:ts`, `npm run fix`, `npm run test` — pristine, no skips
- [ ] Summary written for Oskar
- [ ] Nothing committed
