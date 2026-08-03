# TODO — Self-contained schema components

State for [plan.md](plan.md). One step at a time, in order. A step is done only when every
box under it is ticked — including the review gate.

Per-step gate, run from `/home/oskar/Repos/Pongo/src`:
`npm run build:ts` → `npm run fix` → `npm run test:unit` (+ `test:int` / `test:e2e` where marked).

If a review gate returns STOP: halt, summarise for Oskar, agree what to drop. Do not continue.

---

## Phase 0 — Baseline

### S0 — Record the baseline ✅
- [x] `metrics/baseline.md` written: source LOC per directory, test LOC, exported symbol counts
- [x] Deletion checklist recorded (16 symbols)
- [x] `npm run build:ts` clean
- [x] `npm run fix` clean
- [x] Anything already broken before our changes reported to Oskar — nothing broken

---

## Phase 1 — Component core

### S1 — Plain frozen components, `migrations` as a method ✅
- [x] Tests written and failing (15 failed / 31 passed, `root.migrations is not a function`)
- [x] Plain frozen object literal replaces `Object.defineProperties`
- [x] `options.migrations` is a function of the component, kept in the closure — no field added
- [x] `migrations()` = own + children's `migrations()`, recursively, resolved through `this`
- [x] No accessor properties on any component — asserted structurally in the spec
- [x] Array form of `options.migrations` no longer accepted; call sites updated
- [x] Every `.migrations` read site becomes `.migrations()`
- [x] Deleted: `declaredMigrations` — already absent at baseline; the plan's note was stale
- [x] Deleted: `schemaComponentState`, `InternalSchemaComponent`
- [x] Deleted: `localMigrationsOf`
- [x] Deleted: `migrationsFor` and its `visited` set
- [x] Callers updated (`withTable.ts`, `databaseMigrations.ts`, `schemaComposition.type.spec.ts`)
- [x] No stale re-exports in any `index.ts`
- [x] Gate: build, fix, unit — 1003/1003, pristine
- [x] Review gate R — verdict: **PASS** (source −65 lines; tests +145)

Accepted debt, agreed with Oskar — `databaseMigrations.ts:127` reads a node's own migrations as
`{ ...component, components: {} }.migrations()`. It preserves the declared-before-driver
interleaving its unit spec asserts; the clean alternative was tried and broke that spec. S9
deletes the file and the debt with it.

Logged from review gate R, not blocking:
- `createSchemaComponent` gained a `fields` bag — replaces 6 `Object.defineProperties` blocks,
  so net-negative, but the bag is untyped and the factories keep `as unknown as` casts.
- `SchemaComponentDeclaration` type alias, one use site, not re-exported — inline it if S2 touches it.
- pongo's `defineValue` became `withValue` — reduced to a one-line `Object.freeze({ ...c, [k]: v })`
  after review. It stamps pongo marker symbols on frozen dumbo components; S9 deletes it along
  with the markers, since the two migration builders are their only runtime readers.
- Duplicate-name detection moved inside `migrations()` — S2's job, done early; re-runs per level.

### S2 — Dedupe by name, not identity
- [ ] Tests written and failing
- [ ] Name-based dedupe in the `migrations()` composition
- [ ] Same name + different SQL still throws
- [ ] Same rule applied in `databaseMigrations.ts`
- [ ] Gate: build, fix, unit
- [ ] Review gate R — verdict: ____

---

## Phase 2 — Parent pointers

### S3 — Generic `withParent` clone, applied by the factory
- [ ] Tests written and failing (clone, original untouched, **grandchild reparented**, **unattached component's own children attached**, frozen, re-parent harmless)
- [ ] Five-line generic recursive `withParent` in `schemaComponent.ts` — no kind switch
- [ ] `createSchemaComponent` runs its own `components` through `withParent`
- [ ] `parent` assigned before freeze; original never mutated
- [ ] Existing `mapValues`-shaped helper reused if one exists
- [ ] Gate: build, fix, unit
- [ ] Review gate R — verdict: ____

### S4 — Named accessors and qualifier resolution
- [ ] Tests written and failing (`this.table().schema().schemaName`, unattached → default token)
- [ ] `tableComponent.schema()`, `indexComponent.table()` — one-line methods, **not getters**
- [ ] One shared resolution helper: declared → parent chain → `SQLDefaultSchemaNameToken`
- [ ] Conflict rule kept: child declaring a different schema throws
- [ ] Column gets no accessor
- [ ] `databaseSchemaComponent` exposes clones of its tables — with no attach code of its own
- [ ] Deleted: ad-hoc conflict loop at `databaseSchemaComponent.ts:58-69`
- [ ] Gate: build, fix, unit, **int**
- [ ] Review gate R — verdict: ____

---

## Phase 3 — Drop `databaseName`

### S6 — Remove `databaseName` from the chain
- [ ] Tests written and failing (type spec + no-name migrations + name-independence)
- [ ] Deleted: `databaseName` from `DatabaseSchemaComponent` and its options
- [ ] Deleted: cross-database validation in `databaseComponent.ts:59-68` (record-key check kept)
- [ ] Deleted: `databaseName` from all four identifier types; `DatabaseIdentifier` itself if empty
- [ ] Deleted: the `'A database name is required to build migrations'` throw
- [ ] Deleted: `databaseName` from `pongoDb.ts` identifier and `withTable.ts`
- [ ] Gate: build, fix, unit, **int**
- [ ] Review gate R — verdict: ____

---

## Phase 4 — DDL as tokens

### S7 — `SQLTableReference` + `SQLCreateSchema`
- [ ] Read the existing processor registry first — no second dispatch mechanism
- [ ] Tests written and failing, both dialects (qualified, default token, explicit `public`, create-schema)
- [ ] Tokens added to `core/sql/tokens/sqlToken.ts`
- [ ] Processors registered per dialect
- [ ] `postgreSQLTableReference` / `sqliteTableReference` / `postgreSQLDatabaseSchemaSQL` emit tokens
- [ ] Gate: build, fix, unit
- [ ] Review gate R — verdict: ____

### S8 — `SQLIndexReference` + JSON target tokens
- [ ] Tests written and failing, both dialects (reference, GIN vs plain, path extraction, unique, multi-column, custom `sql`)
- [ ] `SQLIndexReference`, `SQLJSONDocumentIndexTarget`, `SQLJSONPathTarget` + processors
- [ ] `postgreSQLIndexSQL` / `sqliteIndexSQL` rebuilt on tokens
- [ ] If the two bodies became identical: hoisted to core, both deleted
- [ ] Gate: build, fix, unit
- [ ] Review gate R — verdict: ____

### S9 — Components emit their own DDL
- [ ] Tests written and failing, including the database-level-extension regression
- [ ] `tableComponent`'s migrations function emits create-table
- [ ] `indexComponent`'s migrations function emits create-index
- [ ] `databaseSchemaComponent`'s migrations function emits create-schema
- [ ] Deleted: `databaseMigrations.ts`
- [ ] Deleted: `DatabaseMigrationBuilder`
- [ ] Deleted: the four identifier types (if unused)
- [ ] Deleted: `postgreSQLTableSQL`, `postgreSQLIndexSQL`, `postgreSQLDatabaseSchemaSQL`
- [ ] Deleted: `sqliteTableSQL`, `sqliteIndexSQL`
- [ ] Deleted: pongo `databaseMigrations.ts` × 2, `pongoPostgreSQLMigrationBuilder`, `pongoSQLiteMigrationBuilder`
- [ ] Deleted: `migrationBuilder` option on `pongoDb`
- [ ] Both `sqlBuilder.unit.spec.ts` files read `.migrations()`
- [ ] S1's accepted debt gone: `grep "components: {} }"` returns nothing
- [ ] Deleted: `pongoCollectionComponentType`, `pongoSchemaComponentType`,
      `pongoDatabaseComponentType` and the three `isPongo*Component` guards — the builders were
      their only runtime readers
- [ ] Deleted: `withValue` (pongo/src/core/schema/index.ts) — nothing left to stamp
- [ ] Any surviving discrimination is a type-level brand, never a value on the component
- [ ] Gate: build, fix, unit, **int**
- [ ] Review gate R — verdict: ____ (must show a large net deletion)

---

## Phase 5 — Naming and `pongoDb`

### S10 — Naming moves into dumbo
- [ ] Golden test written and failing: `pongoCollection:users:001:createtable`, literal string
- [ ] Schema-qualified, schema-component, index and plain-dumbo name tests
- [ ] Accepted divergence asserted deliberately (explicit `public` on pg)
- [ ] `migrationNamePrefix` option added; pongo passes its three prefixes
- [ ] Deleted: `src/packages/pongo/src/storage/migrationNames.ts` and all three functions
- [ ] Gate: build, fix, unit, **int**
- [ ] Review gate R — verdict: ____ (watch: is `migrationNamePrefix` net-negative?)

### S11 — `defaultSchemaName` optional
- [ ] Tests written and failing (unnamed default, explicit override, per-collection override, scope guard)
- [ ] `defaultSchemaName` optional throughout `pongoDb`
- [ ] Unnamed default keyed on one sentinel, not a dialect string
- [ ] Unnamed default schema component carries `SQLDefaultSchemaNameToken`
- [ ] Gate: build, fix, unit, **int**
- [ ] Review gate R — verdict: ____

### S12 — Collections normalise into the tree
- [ ] Tests written and failing (ad-hoc schema, merge, duplicate-table throw, late collection, idempotence)
- [ ] `mergeSchemaComponentMaps` merges same-alias schema components
- [ ] Duplicate table name within a schema still throws
- [ ] `withTable` uses the merge instead of its spread
- [ ] Gate: build, fix, unit, **int**, **e2e**
- [ ] Review gate R — verdict: ____

---

## Phase 6 — Extension as database fragment

### S13 — Extensions declare schemas
- [ ] Type spec written and failing: `db.schemas.readmodels.tables.users`
- [ ] Placement tests (schema-attached resolves that schema, database-attached does not)
- [ ] Two-extension schema merge test
- [ ] Projection-factory test
- [ ] `extensionComponent` gains `schemas` / `extensions`
- [ ] `databaseComponent` merges extension schemas, typed as a record intersection
- [ ] No conditional recursion in the types — stop and ask if it starts creeping in
- [ ] Gate: build, fix, unit, **int**
- [ ] Review gate R — verdict: ____

---

## Phase 7 — Example and sweep

### S14 — Event-store example
- [ ] `eventStore` extension factory over projection registrations
- [ ] `messages` in `emt`; one read-model table per projection in its own schema
- [ ] Composed into a `pongoDb`
- [ ] E2E on Postgres
- [ ] E2E on SQLite
- [ ] Name-based reference resolves to the correctly qualified identifier
- [ ] Migrating twice is a no-op
- [ ] Gate: build, fix, full suite
- [ ] Review gate R — verdict: ____

### S15 — Final sweep
- [ ] All 16 deletion-checklist symbols verified gone, including re-exports
- [ ] Dead code, orphaned specs, stale index entries cleaned
- [ ] Docs and samples updated
- [ ] `metrics/final.md` written with before/after and the net delta
- [ ] `npm run build:ts`, `npm run fix`, `npm run test` — pristine, no skips
- [ ] Summary written for Oskar
- [ ] Nothing committed
