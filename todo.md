# TODO — Simplify the schema component model

State for [ref_plan.md](ref_plan.md). Steps are sequential. A step is done only
when the gate is green and the review gate has a verdict.

Gate, from `/home/oskar/Repos/Pongo/src`:
`npm run build:ts` → `npm run fix` → `npm run test:unit` → `npm run test:int:sqlite`

`build:ts` runs **before** the tests. Pongo's specs import `@event-driven-io/dumbo`
from its built `dist`, so an uncompiled dumbo change leaves every pongo suite
testing the previous build — green for the wrong reason.

Nothing is committed. Oskar handles git.

---

## Step 0 — Baseline and contract tests — **skipped, Oskar's call**

Dropped on Oskar's instruction: the baseline/metrics/audit bookkeeping is not
what this branch needs. The contract type tests it listed are folded into the
steps that implement their subject — Dumbo `tables` xor `schemas` into S6,
`defaultSchemaName` behaviour into S7, the export audit into S8.

## Step 1 — Migrator cleanup — **done**
- [x] `SchemaComponentMigrator` type and factory deleted
- [x] `migrationTableComponent` singleton deleted
- [x] `migrationTableComponentFor` kept; file renamed to `migrationTableComponent.ts`
- [x] Three specs rewritten onto `runSQLMigrations(pool, component.migrations(), options)`
- [x] `validateComponent` deleted from `MigratorOptions`
- [x] `schema.migrationTable` flattened to top-level `migrationTable`
- [x] Default-migrator-options registry kept
- [x] Empty-render filter and `sqls.length === 0` short circuit kept; `rendersNothing` not renamed
- [x] Migration-table bootstrap kept explicit; SQLite not routed through a create-schema token
- [x] Gate: build green, fix green, unit **1039/1039**, int:sqlite 946/950 (4 known D1 failures)
- [x] Review gate — **pass**. No new abstraction; deletions plus one file rename. Net production **−59**

**Deleted test, with reason**
- `reports schema validation failure before executing migrations` — its subject was
  the `validateComponent` hook, and the only thing that could invoke it was
  `SchemaComponentMigrator`. Both are gone; no guard or replacement left behind.

**Added test.** `records migrations in the configured migration table`
(`pongo/src/storage/sqlite/sqlite3/migrations.int.spec.ts`). The
`PongoDbOptions.migrationTable` → `runSQLMigrations` hop was rewritten in this
step and had no coverage reaching the ledger.

## Step 2 — Make `schemaComponent` the base — **done**
- [x] `SchemaComponent<Kind>` exposes only `[schemaComponentType]` and `migrations(context?)`
- [x] Children stay a constructor option, captured in the migration closure
- [x] `context(parent)` option added; own migrations then children run scoped; one final dedupe
- [x] `isSchemaComponent` checks the marker and the migration function, not a children array
- [x] `createTableSQL` / `createIndexSQL` take plain inline definitions
- [x] `tableComponent`, `indexComponent`, `columnSchemaComponent` converted
- [x] `isIndexComponent`, `isColumnSchemaComponent` deleted
- [x] `databaseComponent`, `databaseSchemaComponent`, `extensionComponent` converted
- [x] Last 4 `Omit<SchemaComponentOptions, 'components'>` removed — none remain
- [x] `isDatabaseComponent`, `isDatabaseSchemaComponent`, `isExtensionComponent` deleted
- [x] `.components` spec assertions converted to migration-order / identity / dedupe claims
- [x] Column factory's `as unknown as` replaced with overloads + `expectTypeOf` proof
- [x] Gate: build green, fix green, unit **1040/1040**, int:sqlite 944 passed / 7 failed (see below)
- [x] Review gate — **pass**. No new type, alias or helper added. Net production **−25**

**Rejected mid-step.** The first attempt introduced `CreateTableDefinition` and
`CreateIndexDefinition`. Oskar rejected both: the plan says "plain definitions",
which means an inline parameter shape or the existing `options` object, not a
new named export. Deleted; `createIndexSQL` now receives `options` directly.

**Naming rule set here.** No placeholder names like `declaration` — name the
concrete thing. The `declaration` local in `schemaComponent.unit.spec.ts` is now
`crm`.

**Three assertions deleted, not whole tests.** Each because a sibling assertion
in the same test already carried the claim over migration names: child order in
`migrates the components it groups in declaration order`, the dedupe claim in
`applies a nested extension placed under two aliases only once`, and the child
order in `accepts the same direct extension-map shape on databases and schemas`.

**`columnSchemaComponent`'s implementation destructures the options rest.**
Re-listing each field inferred an all-required return type that neither overload
accepts under `exactOptionalPropertyTypes` (TS2394). No cast was used.

**Open, pre-existing, not introduced here.** For `{ primaryKey: true }` the type
says `notNull: true` while the runtime property is absent — inherited from the
old conditional return type. Needs a decision; candidate for S8.

**Environment, not code.** The 7 integration failures are 4 D1
`D1TransactionNotSupportedError`/miniflare cases, identical in isolation, and
2–3 `SQLITE_IOERR: disk I/O error` in file-based SQLite connection specs caused
by the disk being 99% full (4.1 G free). `hookTimeout` was raised 30s → 120s in
`vitest.shared.ts`, which cleared every PostgreSQL container `Hook timed out`.

## Step 3 — Make context the only Dumbo placement source — **done**
- [x] `databaseSchemaName` removed from `TableComponent` and table options
- [x] `databaseSchemaName` and `tableName` removed from `IndexComponent` and index options
- [x] Table-vs-schema and both index-vs-table conflict loops deleted; the
      duplicate-table-name and extension-schema-name loops kept — unrelated to placement
- [x] Table context contributes only `tableName`; named schema context always overrides
- [x] `defaults?: Readonly<{ schemaName?: string }>` added to `SchemaComponentContext` and made live
- [x] Index migration throws naming the index when `tableName` is absent from context.
      No `!`, no cast, no synthetic table name
- [x] `migrationTableComponentFor` places through a `databaseSchemaComponent` when a
      schema is requested; `createSchema` deleted
- [x] Pongo keeps `databaseSchemaName` on `PongoCollectionComponent` only; it no longer
      reaches `table(...)`
- [x] Custom migration callbacks proven to receive the fully scoped context
- [x] Gate, verified independently of the agent: build exit 0, fix clean, unit
      **1038/1038**, int:sqlite **947/951** (the same 4 D1 failures)
- [x] Review gate — **pass**. No new type, alias or helper. Net production **−41**

**`defaults.schemaName` was made live here, not staged.** A
`databaseSchemaComponent` whose `schemaName` is a `SQLDefaultSchemaNameToken`
contributes `parent.defaults?.schemaName ?? SQLDefaultSchemaNameToken.from()`
to its children — verbatim the plan's Placement block for the private
logical-default child. S6 then only changes who constructs that child. Its own
create-schema migration and name still come from `options.schemaName`. Nothing in
the repo sets the field yet; S7 wires Pongo's producer side.

**`createSchema` deleted, with evidence.** `migrator.ts` was its only production
caller and passed `schemaName: databaseType === 'PostgreSQL' ? schemaName : undefined`
alongside `createSchema: databaseType === 'PostgreSQL'`, so `createSchema && schemaName`
already meant exactly `schemaName !== undefined`. Migrator behaviour is unchanged.
The brief's feared spurious SQLite ledger row is structurally impossible: core
migrations run through `execute.batchCommand` at `migrator.ts:135`, never through
`runSQLMigration`, so they are neither empty-filtered nor recorded.

**Accepted external break.** A PostgreSQL caller who wrote
`migrationTableComponentFor({ schemaName: 'infra' })` without `createSchema`
previously got no `CREATE SCHEMA` and now gets `CREATE SCHEMA IF NOT EXISTS infra`,
which needs CREATE privilege. Idempotent, but real.

**Four tests deleted.** Two index-placement conflict tests and two
table-declares-its-own-schema tests — their premise, a component carrying its own
placement, no longer exists. Replaced by `refuses to create an index it cannot place
in a table` and by `reuses one table declaration in two independent schemas`, which
asserts one declaration yields both `table:relational:public:users:…` and
`table:relational:audit:users:…`.

**Property assertions converted, not dropped.** `.databaseSchemaName` / `.tableName`
checks in `dumboSchema`, both `sqlBuilder` specs, `pongoDb`, and the SQLite
`migrationTableComponent` spec became migration-name or rendered-SQL claims. Two were
deleted outright — both on column-less tables that emit no migration to assert against.

## Step 4 — Correct generated migration names — **done**
- [x] Grammar is `<type>:[<kind>:]<encoded-path>:<operation>`. No number segment,
      no numbering option added to any factory
- [x] The three `?? 'relational'` defaults deleted from `tableComponent`,
      `indexComponent` and `databaseSchemaComponent`. `kind?: string | undefined`
      kept on all three option types; `dumboSchema` passthrough untouched; Pongo's
      four `kind` call sites untouched
- [x] `kind` and every path segment percent-encoded independently. The encoder is
      private to its module. `encodeURIComponent` escapes both `:` and `%`, so an
      identifier containing a literal `%3A` stays distinct from one containing `:`
- [x] Collision tests for `:`, `%`, and kind-vs-path; a relational table and a
      `pongo_collection` table sharing a name in one schema produce different names
      and both survive `dedupeMigrations`
- [x] Create-schema migration derived from the **resolved scoped placement**, not
      from `options.schemaName`. None emitted while the placement stays a
      `SQLDefaultSchemaNameToken`; custom migrations and children still run
- [x] A logical-default schema given `defaults: { schemaName: 'pongo' }` emits
      `schema:pongo:create`
- [x] Migration name length validated against the ledger's `Varchar(255)` up front
      in `runSQLMigrations`, before the lock, the ledger bootstrap and the loop
- [x] Named-schema `SQLCreateSchema` migrations kept; migrator empty-SQL filtering kept
- [x] Gate, verified independently of the agents: build exit 0, fix clean, unit
      **1043/1043**, int:sqlite **955/959** (the same 4 D1 failures),
      int:postgresql **740 passed / 5 skipped**, e2e:postgresql **729 passed / 5
      skipped**. The two PostgreSQL suites were re-run after the name builders
      were distributed, not only before
- [x] Review gate — **pass**. No new type, alias or helper; three exports removed

**Migration-name builders distributed to their components.** `migrationNames.ts`
is now `migrationName.ts` and holds only the grammar: the private encoder, the
segment join, and the placement-to-path-segment rule shared by tables and indexes.
`databaseSchemaMigrationName`, `tableMigrationName` and `indexMigrationName` are
module-local consts in the one component each serves, and the components barrel no
longer re-exports any of it. Behaviour-neutral: no migration-name assertion changed.

**`generatedIndexName` and `generatedIndexNameSegment` deleted.** They built a
physical index identifier (`users_email_json_path_idx`) and had no production
caller in either package — Pongo names every index from the caller's argument. The
only importer was `schemaComponent.unit.spec.ts`, whose test `derives a readable
default index name from its logical target` went with them. If Pongo should ever
default an index name, this comes back wired up rather than orphaned.

**Accepted break.** Every generated migration name changes, so an existing ledger
re-runs each generated migration: a no-op against `CREATE TABLE IF NOT EXISTS` /
`CREATE SCHEMA IF NOT EXISTS` that leaves a second row per object. Three names also
left dumbo's public surface with the barrel export.

**Assertions deleted, not renamed.** Nine `schema:relational:001:create` entries
across dumbo and pongo specs — the default-token schema emits no migration now, so
the entry has no successor. Three left a test asserting a single-entry list and one
left `[]`; all four still carry their claim, the `[]` one as the "before" half of a
before/after pair that guards exactly this regression.

**One spec neither grep found.** `postgresql/core/schema/schemaComponentSQL.unit.spec.ts`
holds no name literals, so it surfaced only at the gate. Its
`renders nothing for the default one` claim had no migration left to attach to and
is now `emits no migration for the default one`, which also removed two `!` assertions.

**Tests added.** Name length exactly 255 accepted and recorded; 256 rejected with a
clear error and the ledger unchanged — that one seeds an applied migration and puts
a valid migration *before* the bad one, so a mid-loop check would fail it. Plus
mixed empty/non-empty statements execute only the non-empty ones, and an all-empty
migration is not recorded. The SQLite-skips and PostgreSQL-applies claims already
had coverage.

**Environment, not code.** `taskProcessor.unit.spec.ts` failed once under parallel
load with `Task was not started within the maximum waiting time` and passed alone
and on a full re-run. e2e:sqlite showed 10 failures, all in `connection.int.*.spec.ts`
files that passed in the int:sqlite run minutes earlier — `SQLITE_IOERR: disk I/O
error` with the root filesystem at 99% (4.1 G free). No `.e2e.spec` file failed.

**Open, raised here, not fixed.** `indexComponent.ts` declares a second vocabulary
for JSON index targets — two `unique symbol`s, two branded types and two exported
guards — that duplicates the `SQLJSONPathTarget` / `SQLJSONDocumentIndexTarget` SQL
tokens it converts into immediately. The symbols appear in no other file and both
guards are called only by the private `indexTargetSQL` in the same file. Candidate
for S5 or S8. `ref_plan.md:894` and `:1022` still name the deleted
`generatedIndexName`.

## Step 5 — Simplify extensions without flattening
- [ ] Not started

## Step 6 — Make database placement explicit and stop rebuilding components
- [ ] Not started

## Step 7 — Bind Pongo's logical default placement once
- [ ] Not started

## Step 8 — Simplify Pongo typing and audit the public surface
- [ ] Not started

## Step 9 — Documents and metrics
- [ ] Not started

## Step 10 — Decide the DDL privilege policy — **discussion open, nothing to implement**
- [ ] Shape: a union, not booleans — a negative boolean encodes its default into its
      name. Candidate `privileges?: 'full' | 'restricted'`, one privilege level rather
      than one member per object type
- [ ] Scope: schema creation is real; database creation has no emitter today — decide
      whether it becomes a feature or is dropped
- [ ] Transport: migrator option filtering by `schema:` name prefix, or a policy field
      on `SchemaComponentContext` beside `defaults.schemaName`
- [ ] Behaviour when disabled: omit create-schema migrations uniformly, migration table
      included; confirm a genuinely missing schema still fails legibly
- [ ] Default value, and whether the S3 break stays in place for external callers
- [ ] Boundary: what else is privileged DDL under the same policy (`CREATE EXTENSION`)

Raised by the S3 `createSchema` deletion. Does not block Steps 4–9; scheduled after
them because S6 and S7 both change what emits `CREATE SCHEMA`.
