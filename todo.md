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
  **Closed after S3** — the bag is generic now and three of the four casts are gone; see the post-S3
  cleanup under S3.
- `SchemaComponentDeclaration` type alias, one use site, not re-exported — inline it if S2 touches it.
- pongo's `defineValue` became `withValue` — reduced to a one-line `Object.freeze({ ...c, [k]: v })`
  after review. It stamps pongo marker symbols on frozen dumbo components; S9 deletes it along
  with the markers, since the two migration builders are their only runtime readers.
- Duplicate-name detection moved inside `migrations()` — S2's job, done early; re-runs per level.

### S2 — Dedupe by name, not identity ✅
- [x] Tests written and failing (4 failed under the old identity check, confirmed by mutation)
- [x] Name-based dedupe in the `migrations()` composition
- [x] Same name + different SQL still throws — message shape byte-identical
- [x] Same rule applied in `databaseMigrations.ts`, with its own collapse test
- [x] Test names rewritten from the usage perspective (new rule: spec.md §5, plan.md ground rules)
- [x] Gate: build, fix, unit — 1007/1007, pristine
- [x] Review gate R — verdict: **STOP**, overridden by Oskar on both counts (see below)

`haveSameSQL(a, b)` in `sqlMigration.ts` compares `JSONSerializer.serialize(migration.sqls)`. Not
the real SHA-256 hash from `migrator.ts:236` — that one is async and needs a dialect formatter,
which `migrations()` has neither of. Content equality yields the same collapse-or-throw decision
without dragging dialect knowledge into the component core.

Review gate R said STOP on two mechanical rules; Oskar accepted both:
- Non-test source **+2** (22,825 → 22,827). Inlining the comparison at both call sites would have
  been −2, but Oskar rejected the inline form as unreadable. Readability outranks a two-line budget.
- `haveSameSQL` replaces zero existing abstractions, so the gate scored it purely additive. It is a
  two-line predicate beside the type it compares — not an indirection layer, factory, registry or
  config hook, which is what the rule exists to catch. It reaches the public barrel via the
  pre-existing `export * from './sqlMigration'`; no new re-export line.

The gate also called the diamond test vacuous. It was wrong: `migrations` is a function, called once
per branch, so each branch mints a distinct migration object with the same name — exactly what the
old identity check rejected. Verified by swapping `haveSameSQL` for identity and watching it fail.

Pre-existing test names that break the new usage-perspective rule. Not swept in S2 — S15 owns them,
except where an earlier step already touches the file:
- `schemaComponent.unit.spec.ts` — "rejects two different migrations that would share one ledger
  identity", "exposes migrations as a method and never as an accessor", "exposes a frozen component
  with nothing hidden behind it", "identifies every component kind without relying on string keys",
  "declares against the component it is read from, not the one it was built from", "returns exactly
  what its declaration returned when it has no children", "finishes traversal when reusable
  components form a cycle", "keeps its own keys to the declared component shape", "accepts a shared
  table discovered twice within one logical schema"
- `components/databaseMigrations.unit.spec.ts` — "gives the driver complete identifiers in schema,
  table, and index order", "keeps declared migrations before driver migrations on each component".
  Both die with the file in S9; not worth renaming before then.

---

## Phase 2 — Parent pointers

### S3 — Generic `withParent` clone, applied by the factory ✅
- [x] Tests written and failing (clone, original untouched, **grandchild reparented**, **unattached component's own children attached**, frozen, re-parent harmless)
- [x] Generic recursive `withParent` in `schemaComponent.ts` — kind-blind, no kind switch; exported
      from `schemaComponent.ts` but deliberately not re-exported from `core/schema/index.ts`
- [x] `createSchemaComponent` runs its own `components` through `withParent`
- [x] `parent` assigned before freeze; original never mutated
- [x] Existing `mapValues`-shaped helper reused if one exists — none existed; a module-private
      `componentsWithParent` (12 lines) does that job, with `schemaComponentMap` supplying the
      null-prototype freeze
- [x] `parent?: AnySchemaComponent | undefined` added to the `SchemaComponent` type
- [x] Gate: build, fix, unit — 1015/1015, pristine
- [x] Review gate R — verdict: **STOP**, overridden by Oskar (see below)

Construction is two-step in both places — the component literal first, `component.components`
assigned after it, then frozen. The parent/child reference is cyclic: children must point at the
component, so the component has to exist before its children can be cloned against it. `withParent`
does the same dance for the same reason.

Tests: eight new tests under the `placing a component under a parent` describe, plus a vacuity fix.
"does not change the migrations of the definition it was built from" had no children in its fixture,
so it survived every mutation of `withParent` and `createSchemaComponent` — including one that broke
39 other tests. It now places a table carrying an index, both declaring migrations named after their
placement depth, and asserts the definition's full `migrations()` before and after placement plus the
parent's. Mutation-proved: making `withParent` non-recursive fails it (`users_email_idx:under-1`
instead of `under-2`), and mutating the component in place fails it too.

Thirteen pre-existing tests were rewritten because cloning breaks reference equality — more than the
plan anticipated at this step; it expected this at S4. Nine came out equal or stronger. Two are mildly
weaker but still assert their named subject: "runs a shared child migration once when the child has
multiple aliases" lost its identity-traversal assertion, and "accesses declared children through typed
record aliases" went from identity to `tableName`. Two lost coverage deliberately and acceptably: the
cycle test can no longer construct a cycle through the factory at all, and the extension-alias test
lost an assertion that cloning makes unstateable.

Review gate R said STOP on the mechanical net-lines rule; Oskar accepted it:
- Non-test source 144 → 176, **+32**; test source +139. Oskar: "I'm fine with +32".
- The gate found no new exported type, options bag, registry or config hook, judged all growth to be
  machinery plan.md pre-authorised, and found nothing droppable. S3 is the one purely additive step in
  Phase 2 — the deletions it unlocks land in S4 and S9.

Small cleanup applied after the gate: `components: {} as SchemaComponentMap` became
`components: schemaComponentMap<SchemaComponentMap>({})`, removing a cast.

Post-S3 cleanup, agreed with Oskar — the `fields` bag is now typed. This closes the first of the two
findings logged from S1's review gate, which had noted that the bag was untyped and left the factories
casting. `createSchemaComponent` gained a `const Fields extends Readonly<Record<string, unknown>>`
parameter, so the return type is `SchemaComponent<Kind> & Fields & { components: Components }` and the
per-kind data survives into it.

Three of the four `as unknown as` casts are now gone entirely — `tableComponent`,
`databaseSchemaComponent` and `databaseComponent` all `return base;`. The typing bites: renaming
`tableName` to `tableNameTYPO` in the fields bag now fails the build with "Property 'tableName' is
missing". Before, all four factories compiled with that typo.

Getting there exposed two declarations the casts had been hiding, both fixed:
`TableComponent.databaseSchemaName` and `DatabaseSchemaComponent.databaseName` were declared
`?: string` while their own options types said `?: string | undefined` — different things under
`exactOptionalPropertyTypes`, and the component types had the wrong one.

Three narrow casts remain, one per value TS genuinely loses through a spread-then-freeze:
`relationships as Relationships`, `schemaName as SchemaName`, `databaseName as DatabaseName`. Each
covers one property and leaves the rest of the return checked, rather than one blanket cast disabling
it all.

`columnSchemaComponent` keeps its `as unknown as`. Its return type is intersected with an
uninstantiated conditional (`Options extends { notNull: true } | { primaryKey: true } ? ... : ...`),
and TS will not compare against that. The blocker is the `notNull` inference in its own signature, not
the fields bag; unpicking it means the conditional-type gymnastics plan.md says to walk away from.

Cost: +3 lines across the three factories plus the generic parameter. Build, fix, `tsc -b --force` and
1015/1015 unit tests all green.

Follow-ups S3 leaves behind:
- **S4 inherits a gap**: `tables`, `indexes` and `columns` field maps still hold the ORIGINAL child
  components — only `components` holds clones. S4's spec expects `.tables.users` to be a clone, so that
  field-map re-derivation is still owed.
- `findComponents` now returns one entry per ALIAS rather than one per identity, since clones are
  distinct objects. No test pins the new arity directly.

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
