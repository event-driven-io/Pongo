# TODO — Simplify the schema component model

State for [ref_plan.md](ref_plan.md). Steps are sequential. A step is done only
when the gate is green and the review gate has a verdict.

Current status: Steps 1-9 and the component-owned lookup/Pongo runtime
encapsulation follow-up are done. Step 10 remains a separate policy discussion.

Gate, from `/home/oskar/Repos/Pongo/src`:
`npm run build:ts` → `npm run fix` → `npm run test:unit` → `npm run test:int:sqlite`

`build:ts` runs **before** the tests. Pongo's specs import `@event-driven-io/dumbo`
from its built `dist`, so an uncompiled dumbo change leaves every pongo suite
testing the previous build — green for the wrong reason.

Nothing is committed. Oskar handles git.

---

## Step 0 — Initial bookkeeping and contract tests — **skipped, Oskar's call**

Dropped on Oskar's instruction: the initial metrics/audit bookkeeping is not
what this branch needs. The contract type tests it listed are folded into the
steps that implement their subject — Dumbo's database declaration shape into S6,
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
a valid migration _before_ the bad one, so a mid-loop check would fail it. Plus
mixed empty/non-empty statements execute only the non-empty ones, and an all-empty
migration is not recorded. The SQLite-skips and PostgreSQL-applies claims already
had coverage.

**Environment, not code.** `taskProcessor.unit.spec.ts` failed once under parallel
load with `Task was not started within the maximum waiting time` and passed alone
and on a full re-run. e2e:sqlite showed 10 failures, all in `connection.int.*.spec.ts`
files that passed in the int:sqlite run minutes earlier — `SQLITE_IOERR: disk I/O
error` with the root filesystem at 99% (4.1 G free). No `.e2e.spec` file failed.

**JSON index-target vocabulary extracted and cut to three exports.** The two
`unique symbol`s, the two branded types and the two exported guards are gone;
`indexTarget.ts` now holds `IndexTarget` plus the two factories, and
`indexTargetSQL` branches on `target.targetType`. The SQL token layer is
untouched — `isUnique` still comes from the enclosing index, not the target,
because a declaration-time factory cannot know it. Pongo needed no edit beyond
`schema.unit.spec.ts`; it only ever imported the two factories.

The planning and audit references to the deleted generated-index-name helpers
are retained only as historical decisions; no implementation depends on them.

## Step 5 — Simplify extensions without flattening — **done**

- [x] `ExtensionComponent` takes one three-member declaration union — `{ tables }`,
      `{ schemas }`, or neither, each with optional `migrations`. `tables` is new;
      extensions had no table side before this step
- [x] Nested `extensions` removed from `ExtensionComponent` and its options, with
      the schema-hoisting owner-map loop. Composition is listing several flat
      extensions at one attachment point. No recursive mode classifier, no public
      mode marker, no replacement bundle abstraction
- [x] Children listed once, tables then schemas; the base still emits own
      migrations before children
- [x] `SchemasFromExtensions` deleted with its three casts, and both database-level
      schema owner-map loops. `ExtensionComponents` deleted — no referent left once
      the nested option went; `SchemaExtensions` and `DatabaseExtensions` cover the
      attachment points. The three duplicate record aliases were otherwise left alone
- [x] `database.schemas` is direct named schemas only. Extension-owned schemas stay
      at `database.extensions.<key>.schemas`
- [x] Attachment rules throw at construction: a schema-scoped extension cannot
      attach to a database schema; a table-scoped extension cannot attach to a
      database. No temporary default-placement branch — tables-mode arrives in S6
- [x] Pongo's `Omit<Schemas, keyof SchemasFromExtensions<Extensions>>` and the
      runtime `extensionSchemaKeys` set both deleted
- [x] Collection lookup initially moved out of extension traversal code; its
      final component-owned placement is recorded in the completed follow-up
- [x] More than one matching physical table throws immediately; Pongo rejects a
      relational table requested as a collection and reuses a matching collection
- [x] Gate, verified independently of the agents: build exit 0, fix clean, unit
      **1060/1060** across 60 files, int:sqlite **955/959** (the same 4 D1
      failures, no `sqlite3` flake on either run). Concept greps for
      `SchemasFromExtensions`, `extensionSchemaKeys`, `ExtensionComponents` and
      `extensionContains*` return nothing outside `dist/`
- [x] Review gate — **pass**. One new type alias, `ExtensionTables`, symmetric with
      the `ExtensionSchemas` already in that file and required by the new table side;
      four types deleted against it

**Superseded lookup placement.** This step first moved generic traversal from
Pongo into standalone Dumbo helpers. The final follow-up moved it onto the
components that own the data: `DatabaseSchemaComponent.findTable` searches one
schema, and `DatabaseComponent.findTable` resolves physical schema placement and
delegates. The standalone helpers and the remaining containment knowledge in
Pongo were removed.

**`'the unnamed database'` deleted.** The table-extension rejection in
`databaseComponent.ts` built a label for a name that is optional and usually
absent, so the filler stood in for nothing. The message now ends "cannot be
attached to a database" and the `continue`-then-unconditional-throw shape went
with it. Unlike `databaseSchemaComponent`'s `schemaNameLabel`, which names a real
placement — a schema always has one, even if it is the default. Two spec regexes
followed, one of them in Pongo. See the S7 note: that message needs a mode
qualifier back in S6.

**Extension schemas are matched by placement, not by record key.** An extension
keys its default schema arbitrarily — both migration int specs use `default` —
while Pongo's default key is `''`. Pongo's lookup compares
`databaseSchemaKey(schema.schemaName)` against the requested key, so a record-key
match would have silently missed. Tables are gathered from each candidate schema's
own `tables` **and** its directly attached `extensions[*].tables`; a table-scoped
extension on a named schema puts its collections there, one flat gather each way.

**A live bug went with the merged schema map.** `withTable` rebuilds a database
from `{...database.schemas, [key]: schema}` plus `database.extensions`. While
`database.schemas` carried extension schemas, that combination threw
`Database schema key "…" is declared directly and by extension "…"` — so requesting
any _undeclared_ collection on a database with an extension threw. The two
extension int specs never hit it because they only request declared collections.
It is now covered by a test that passed before the lookup was touched, which is
what proves the throw came from the merge and not from the lookup.

**Accepted break.** `database.schemas` no longer exposes extension-contributed
schemas, so `definition.schemas.readmodels` is `undefined`; both
`migrates mixed event-store and Pongo extension schemas` specs now reach
`definition.extensions.eventStore.schemas.readmodels`. Migration names and order
are unchanged in both, and both now also assert the collection component is
_reused_, not deduplicated by accident.

**Three tests deleted, each a dead concept.** Extensions nested inside extensions;
and the two schema-key-collision rejections — a key shared by a direct schema and
an extension, and one shared by two extensions — which cannot occur now that the
maps are not merged. Fifteen added across both packages, including
`table:emt:messages:create` from a table-scoped extension asserted equal to the
same table declared directly, and a `@ts-expect-error` proof that `tables` and
`schemas` cannot be declared together.

**Open, needs your call.** Removing the `Omit` also removed a fallback: a
non-Pongo `schemas` map used to widen to `PongoSchemaCollectionsMap<PongoDatabaseSchemas>`,
an open `[x: string]` index signature, and now falls to `object`. That reads as
consistent with decision 19 — a plain Dumbo declaration must not change the static
database shape — and nothing regressed, but it is a real narrowing rather than a
no-op.

## Step 6 — Make database placement explicit and stop rebuilding components

- [x] Done — full build, lint clean, 1082/1082 unit across 61 files,
      int:sqlite 955/959 and e2e:sqlite 992/1002 with only the four known D1
      failures (plus the `sqlite3/connections` parallel-load flake, 38/38 in
      isolation)
- [ ] `test:int:postgresql` and `test:e2e:postgresql` not run for this step

**The plan was rewritten mid-step.** The first attempt followed Step 6 as
written: `tables` xor `schemas` as two containment shapes, a hidden private
default-schema component, mode-dependent extension routing, the XOR enforced
statically and at runtime, and a `ValidateDatabaseTables` adapter that fed direct
tables through `ValidateDatabaseSchemas` under a fake `''` scope and then
stripped the residue back out of every rendered reference. It worked and it was
rejected as needless complexity — every downstream piece had to fork on the
containment fork.

What replaced it is one shape: a database always has a nameless `defaultSchema`
plus named `schemas`, and direct tables are simply the default schema's tables.
`database.tables` is a getter, not a second map. `tables` and `schemas` may both
be present, so the XOR is gone entirely — which also means Pongo collections mode
no longer needs a privileged lower-level representation. Extensions route by
their own scope with no mode branch. `ref_plan.md` Step 6 was rewritten to match,
along with the stale claims it left in proofs 9 and 11, the Step 5 attachment
rules, and the component sketch in the design section.

The adapter disappeared instead of shrinking. The blocker was that the machinery
qualifies references by the schema's own name — `Extract<Schema['schemaName'],
string>`, which is `never` for a token-named schema — so a nameless scope could
not pass through and any string chosen leaked into public error types. Two
changes inside the existing stack fixed it: a schema's lookup key is now separate
from its name (`DatabaseSchemaKey`, defaulting to `DefaultSchemaKey`), and a
nameless schema contributes no path segment, built that way in `QualifyColumnName`
rather than stripped afterwards. Named-schema behavior is unchanged.

**Carried in from S5, later simplified.** Physical lookup covers the default,
named, and extension-contributed schemas. The final implementation performs that
work through `DatabaseComponent.findTable`, delegating schema-local lookup to
`DatabaseSchemaComponent.findTable`; the intermediate standalone traversal was
deleted.

One Step 5 test went with the old model: "rejects a table extension attached to a
database" asserted a throw that the single shape deliberately removes, since such
an extension now lands in the default schema. It was rewritten to assert that
placement and to prove the table is traversed exactly once.

**Pongo side, superseded by the completed runtime follow-up.** One internal
`PongoDatabaseComponent` now owns the evolving immutable Dumbo component,
canonical collection identity, named-schema views, and runtime property
exposure. `db.schema` is a non-callable facade over the current component,
migrations, and migration execution; callable schema handles were removed.

Two deliberate boundaries: binding the configured `defaultSchemaName` into the
declared component's migration context is Step 7, so declared unscoped
collections still emit unqualified migration names; and
`samples/simple-ts/src/pongo.config.ts` was already invalid before this step, and
belongs to Step 9.

## Step 7 — Bind Pongo's logical default placement once

- [x] Pongo passes a configured `defaultSchemaName` as `defaults.schemaName`
      when reading declared component migrations
- [x] Declared default collections now emit concrete default-schema migration
      names when the configured default resolves to a named schema
- [x] `PongoDatabaseCache` treats `db(name, options)` options as setup-time
      configuration and rejects setting up an existing database with options;
      reuse is `db(name)` with no options
- [x] Focused checks green:
      `npx vitest run packages/pongo/src/core/database/pongoDb.unit.spec.ts`
      and `npx vitest run packages/pongo/src/core/pongoClient.unit.spec.ts`
- [x] Gate: `npm run fix` and `npm run build:ts`

**Carried in from S5.** `defaults.schemaName` is read in exactly one place —
`databaseSchemaComponent.ts:106`, `parent.defaults?.schemaName ??
SQLDefaultSchemaNameToken.from()` — and written in exactly one place,
`componentMigrations.unit.spec.ts`. **Pongo never passes it.** Binding Pongo's
`defaultSchemaName` to it is this step's job, and until then the whole
policy-vs-placement split is exercised only by dumbo's own unit spec.

That single line is also what separates `SQLDefaultSchemaNameToken` (an explicit
"let the dialect pick") from `undefined` (no placement anywhere in the ancestry).
Only a table with a `databaseSchemaComponent` ancestor passes through it, so only
such a table resolves the configured logical default. With no `defaults` set
today the divergence is latent — every path lands unqualified — so nothing
observable proves it until this step lands. End-to-end proof #4 is the check:
`defaultSchemaName: 'readmodels'` must yield `schema:readmodels:create` and
`table:readmodels:messages:create`, not `table:messages:create` with no schema
creation.

**S5's throw is gone, not narrowed.** S5 rejected a table-scoped extension
attached to a database because the database had no vocabulary for that
placement. S6 gave it one: such an extension lands in the default schema, so
every table now has a `databaseSchemaComponent` ancestor and there is no path
that silently ignores `defaults.schemaName`. Both specs were rewritten to assert
the placement instead of the throw.

## Step 8 — Simplify Pongo typing and audit the public surface

- [x] Keep `MigrationStyle` in Dumbo; Pongo imports the generic migration style
      type from Dumbo where needed
- [x] Preserve the existing Pongo/Dumbo input boundary without adding markers,
      wrappers, brands, new conditional helper layers, or casts
- [x] Keep explicit Pongo projection types unless one can be removed by direct
      substitution with an existing type
- [x] Deleted `pongoDocumentType`; exact document inference now comes from Dumbo
      `TableRowType<Collection>['data']`, with positive type tests and no casts
- [x] Initially reduced `PongoSchemaScope`; the completed runtime follow-up
      removed the scope and callable `db.schema(name)` entirely
- [x] Audit export candidates in a table with `symbol`, `used on main`,
      `current role`, `consumer value`, `replacement`, and `decision`
- [x] Keep positive type tests named by supported usage scenario; remove only
      absence-only tests for APIs already deleted
- [x] Focused checks green:
      `npx vitest run packages/pongo/src/core/schema/schema.type.spec.ts packages/pongo/src/core/schema/schema.unit.spec.ts packages/pongo/src/core/database/pongoDb.unit.spec.ts packages/dumbo/src/storage/sqlite/core/schema/schemaComponentSQL.unit.spec.ts packages/dumbo/src/storage/postgresql/core/schema/schemaComponentSQL.unit.spec.ts`
- [x] Gate: `npm run fix && npm run build:ts`

| symbol                                                    | used on main | current role                                                                 | consumer value                                                 | replacement                                               | decision      |
| --------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------- | ------------- |
| `dumboSchema.defaultSchema` / `pongoSchema.defaultSchema` | no           | Removed in S6                                                                | Legacy default namespace helpers                               | `{ tables }` / `{ collections }`; release notes in S9     | delete        |
| `MigrationStyle`                                          | yes          | Generic migration option imported by Pongo                                   | Shared migration configuration type                            | none                                                      | keep in Dumbo |
| `IndexIdentifier`                                         | no           | Internal `createIndexSQL` identifier shape                                   | No public value beyond the function signature                  | `Parameters<typeof createIndexSQL>[1]` for internal tests | make private  |
| `MIGRATIONS_LOCK_ID`                                      | yes          | Migrator's default advisory lock id                                          | Users can already pass `lock.options.lockId`                   | explicit `lock.options.lockId`                            | make private  |
| `generatedIndexName` / `generatedIndexNameSegment`        | no           | Already deleted in S4 after Pongo kept explicit index names                  | none                                                           | explicit index names                                      | delete        |
| `MigrationRecord`                                         | yes          | Orphaned ledger-row shape; no public API returns or accepts it               | none clear                                                     | none                                                      | delete        |
| `SchemaComponentRecord`                                   | no           | Barrel alias to `SchemaComponentMap`                                         | Duplicate name only                                            | `SchemaComponentMap`                                      | delete        |
| `jsonPathIndexTarget` / `jsonDocumentIndexTarget`         | no           | Dumbo index target factories used by Pongo index factories and SQL rendering | Existing public target factories                               | none                                                      | keep          |
| `supportsSchemas` / `supportsFunctions`                   | yes          | Database metadata capabilities returned by metadata APIs                     | Public capability metadata                                     | none                                                      | keep          |
| `toClientSchemaMetadata`                                  | yes          | Public Pongo schema metadata converter                                       | Useful conversion utility; `toDbSchemaMetadata` is used by CLI | none                                                      | keep          |

## Step 9 — Documents and metrics

- [x] Metrics ignored on Oskar's instruction
- [x] `spec.md` rewritten to describe the implemented component model through
      Step 8
- [x] `ref_plan.md` rewritten to describe the implemented state and remaining
      Step 10 discussion
- [x] `todo.md` updated with this documentation-only closeout
- [x] Gate: `npm run fix && npm run build:ts`

## Follow-up — Baseline migration metadata and advisory lock options — **historical; baseline metadata was later removed**

- [x] Added migration options to `sqlMigration`
- [x] `baseline: true` marks a migration as the initial schema for the
      component declaring it
- [x] A baseline migration suppresses generated initial DDL for that component
      subtree only: `CREATE SCHEMA`, `CREATE TABLE`, and `CREATE INDEX`
- [x] Other migrations returned by the same callback still run after the
      baseline, while typed components remain available for schema typing and
      future snapshot/diff tooling
- [x] `ignoreHashMismatch: true` skips an already-applied changed migration
      without failing and without updating the recorded hash
- [x] Added usage-scenario tests:
      `runs a baseline migration instead of generated schema table and index creates`,
      `runs a table baseline while keeping generated schema creates around it`,
      and `skips an already applied baseline when its SQL changes`
- [x] Fixed `runSQLMigrations` to pass merged `lock.options` into the selected
      database lock, so custom `lockId` and `timeoutMs` are effective
- [x] Verified the GitHub Actions failure locally with
      `npx vitest run src/packages/dumbo/src/storage/postgresql/core/schema/migrations.int.spec.ts`
- [x] Gate: `npm run fix && npm run build:ts`

## Follow-up — Immutable component growth — **done**

- [x] Added typed immutable `DatabaseSchemaComponent.withTable`
- [x] Added typed immutable `DatabaseComponent.withSchema` and default/named
      `withTable`
- [x] Kept extensions, custom migrations, and source declarations reusable
- [x] Preserved child traversal when custom own migrations are supplied; custom
      schema/table/index callbacks replace only that component's generated DDL
- [x] Replaced Pongo's runtime schema overlay and migration concatenation with
      one evolving `AnyDatabaseComponent`
- [x] Made `db.schema.component` expose the current component and kept static
      collection/schema properties declaration-based
- [x] This first version kept external runtime caches and callable schema handles;
      both were superseded by the completed runtime encapsulation follow-up
- [x] Added usage-focused runtime and type tests for immutable growth, dynamic
      registration, accumulation, projection, extensions, and aliases
- [x] Focused verification: 761 Dumbo unit tests, 344 Pongo unit tests, and the
      PostgreSQL plus both SQLite index-migration integration scenarios passed

## Follow-up — Component-owned lookup and Pongo runtime encapsulation — **done**

- [x] Added schema-local `DatabaseSchemaComponent.findTable` across direct and
      extension tables
- [x] Added `DatabaseComponent.findTable` for physical schema resolution and
      delegation across default, named, and extension-owned schemas
- [x] Deleted standalone `findTable` / `findTables` helpers and their obsolete tests
- [x] Added and plugged in one internal `PongoDatabaseComponent` owning the
      evolving Dumbo component, canonical collection cache, `collections()`,
      stable named-schema views, and runtime property exposure
- [x] Kept `PongoDb` responsible for pool/cache setup, transactions, SQL,
      collection construction dependencies, and migration execution
- [x] Removed `PongoSchemaScope`, `PongoSchemaManagement`, callable
      `db.schema(name)`, schema handles, projection helpers, property installers,
      reflection, and descriptor maps
- [x] Exposed non-callable `PongoDatabaseSchema` as `db.schema`, with
      `component`, `migrations`, and `migrate` reading the current component
- [x] Preserved strongly typed root collections and named schemas while exposing
      runtime additions without claiming static type growth
- [x] Preserved canonical wrapper identity for normal access; per-call cache,
      error, or document-schema options create temporary wrappers outside
      `db.collections()`
- [x] Extracted explicit generated schema/table/index migration fallbacks and
      retained custom-own-migration replacement plus child traversal
- [x] Renamed tests around declaration, access, composition, and migration usage
      scenarios; removed defensive tests for obsolete implementation states
- [x] Gate: build and fix green; unit **1104/1104** across 60 files; integration
      **391/391** across 32 files; e2e **465 passed, 5 skipped** across 9 files;
      `git diff --check` clean

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
