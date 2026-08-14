# Review: schema_features

Scope: diff against `main`, with `*.spec.ts` and Markdown ignored for the primary code pass. I also read `/home/oskar/Repos/Pongo/spec.md` and checked adjacent runtime paths and dead-code candidates.

Follow-up status: after this review, the low-hanging fixes for findings 1, 4, and 6 were implemented with focused tests. Finding 2 was rechecked against the transaction implementation: `dryRun` already rolls back through `withTransaction`, and focused SQLite/PostgreSQL tests were added to pin that behavior.

## Executive Summary

The branch mostly implements the simplified model described in `spec.md`: immutable declarations, one downward `migrations(context?)` traversal, flat placement context, and dialect-neutral schema/table/index tokens.

The main design is coherent. The initially suspected migration bugs have been narrowed:

1. Collection-level migration lost placement context for named/default-bound schemas.
2. Migrator `dryRun` executes migrations inside a transaction and rolls back; the missing piece was test coverage.

The main simplification opportunity is in Pongo's runtime schema overlay: it currently owns lookup, dynamic component creation, dynamic schema creation, and runtime collection cache bucketing in one closure. That is the only area that feels harder than the model in `spec.md` requires.

## Findings

### 1. Collection-level `schema.migrate()` ignores schema placement

Severity: high.

`pongoCollection` receives the resolved `databaseSchemaName` and the already dialect-aware `sqlBuilder`, but its schema migration API calls the table component without context:

- `packages/pongo/src/core/collection/pongoCollection.ts:924`
- `packages/pongo/src/core/collection/pongoCollection.ts:927`

That means:

```ts
db.schema('crm').collection<User>('users').schema.migrate();
```

or:

```ts
db.collection<User>('users', { databaseSchemaName: 'crm' }).schema.migrate();
```

will generate `component.migrations()` as if the table lived in the logical/default schema. The table and indexes get no `databaseSchemaName` context, so generated migration names and SQL placement can diverge from normal `db.schema.migrate()` / `db.migrate()`.

This directly conflicts with the spec's placement rule: components do not remember where they are placed; placement must be passed downward when migrations are read.

Recommendation: make collection-level migration call `component.migrations({ databaseSchemaName })`. If collection-level migration should also create the schema for a named dynamic scope, it needs to include the schema create migration too. The simpler and more coherent option is to route collection-level migration through the same overlay path as database/schema migration, filtered to the collection if necessary. Otherwise this API will always risk disagreeing with database-level migration.

Tradeoff: passing `{ databaseSchemaName }` is minimal, but it only fixes table/index placement. Reusing the overlay migration path is slightly larger, but keeps all migration behavior in one place.

### 2. `dryRun` rollback behavior needed explicit coverage

Severity: medium test gap, pre-existing on `main`.

`runSQLMigrations` accepts `dryRun`, and the CLI exposes it as "Perform dry run without commiting changes":

- `packages/pongo/src/commandLine/migrate.ts:75`
- `packages/pongo/src/commandLine/migrate.ts:125`
- `packages/dumbo/src/core/schema/migrators/migrator.ts:98`

The migrator creates the migration table, executes every pending migration, and records migration rows inside `pool.withTransaction`:

- `packages/dumbo/src/core/schema/migrators/migrator.ts:141`
- `packages/dumbo/src/core/schema/migrators/migrator.ts:147`
- `packages/dumbo/src/core/schema/migrators/migrator.ts:235`
- `packages/dumbo/src/core/schema/migrators/migrator.ts:239`

For `dryRun`, it returns `{ success: false, result }` from the transaction handler:

- `packages/dumbo/src/core/schema/migrators/migrator.ts:169`

The transaction layer treats `success: false` as rollback while still returning `result`, so the implemented semantics are "execute in a transaction and rollback", not "inspect without executing".

Recommendation: keep `dryRun` as-is for now and cover it explicitly. Focused SQLite and PostgreSQL tests now assert that dry-run reports the migration as applied inside the attempted run, but leaves neither the user-created table nor `dmb_migrations` committed.

Tradeoff: rollback dry-run is closer to real execution than a pure planner, but it depends on transactional DDL support. That is acceptable for PostgreSQL and the tested SQLite paths; a future non-executing preview would be a separate feature.

### 3. Runtime overlay in `pongoDatabaseSchemas` is doing too much

Severity: medium design risk.

`pongoDatabaseSchemas` currently handles:

- default schema binding;
- declared table lookup through `findTable`;
- Pongo-vs-non-Pongo validation;
- dynamic default collection creation;
- dynamic named collection creation;
- dynamic named schema migration creation;
- migration dedupe.

Relevant lines:

- `packages/pongo/src/core/database/pongoDb.ts:99`
- `packages/pongo/src/core/database/pongoDb.ts:116`
- `packages/pongo/src/core/database/pongoDb.ts:133`
- `packages/pongo/src/core/database/pongoDb.ts:148`
- `packages/pongo/src/core/database/pongoDb.ts:165`

This is the one area that feels more complex than the spec's model. The spec says Dumbo owns generic physical table traversal and Pongo owns Pongo-specific decisions. The current code follows that, but the boundary is blurry because overlay migration generation also needs to know whether a schema is direct, extension-owned, default-bound, or runtime-created.

Recommendation: keep the immutable component model, but simplify the runtime overlay around an explicit "scope" concept local to `pongoDb.ts`, not a new exported abstraction:

```ts
type RuntimeScope = {
  databaseSchemaName: string | SQLDefaultSchemaNameToken;
  collections: Map<string, PongoCollectionComponent>;
  schemaMigration?: AnyDatabaseSchemaComponent;
};
```

Then use one resolver for both `db.collection(...)` and `schema.migrations`. The key simplification is not adding public types; it is making "resolve schema scope" a single local operation instead of duplicating equivalent logic in `pongoDatabaseSchemas` and `collectionsIn`.

Tradeoff: a small local helper improves coherence here. A public overlay abstraction would be overkill.

### 4. Dynamic named schema creation only checks direct schemas

Severity: medium/low.

When a dynamic collection is created in a named schema, `namedScope` creates a schema component if `component.schemas[databaseSchemaName]` is absent:

- `packages/pongo/src/core/database/pongoDb.ts:120`
- `packages/pongo/src/core/database/pongoDb.ts:123`

But `findTable` and the spec both treat extension-owned schemas as valid searchable schemas:

- `packages/dumbo/src/core/schema/components/findTables.ts:36`
- `packages/dumbo/src/core/schema/components/findTables.ts:39`

So if an extension contributes schema `"crm"` and the user dynamically creates a collection in `"crm"`, Pongo can add another `schema:crm:create` migration. It is mostly harmless because `CREATE SCHEMA IF NOT EXISTS` is idempotent and dedupe may collapse exact duplicates, but it is conceptually noisy. If the extension schema has a different `kind`, dedupe will not collapse by name.

Recommendation: when deciding whether to synthesize a schema migration for a dynamic named scope, consider direct schemas and direct extension-owned schemas. That keeps lookup and migration synthesis aligned.

Tradeoff: this adds a tiny traversal, but it removes a special case that users would otherwise see as duplicate migration names/SQL.

### 5. Baseline suppression is correct but duplicated in each generated component

Severity: low.

The baseline behavior matches `spec.md`: base traversal propagates `skipGeneratedInitialMigrations` to children when a component's own migrations include `baseline: true`:

- `packages/dumbo/src/core/schema/schemaComponent.ts:82`
- `packages/dumbo/src/core/schema/schemaComponent.ts:85`

Each generated-DDL component repeats the same local `hasBaseline` shape:

- `packages/dumbo/src/core/schema/components/databaseSchemaComponent.ts:111`
- `packages/dumbo/src/core/schema/components/tableComponent.ts:125`
- `packages/dumbo/src/core/schema/components/indexComponent.ts:154`

Recommendation: I would not introduce a broad abstraction for this. The repeated block is small and explicit. If it bothers maintenance, a local helper like `hasInitialDDLSuppressed(context, ownMigrations)` inside the schema component module is enough. Avoid pushing generated-DDL orchestration into the base component; that would obscure which factory owns which initial migration.

Tradeoff: keeping repetition preserves locality. A helper reduces repetition but risks becoming a thin abstraction unless more component types are added.

### 6. `TableColumnNames` has leftover compatibility filtering

Severity: low/dead-code cleanup.

`TableColumnNames` still excludes `keyof ReadonlyMap<string, AnyColumnSchemaComponent>`:

- `packages/dumbo/src/core/schema/components/tableTypesInference.ts:42`
- `packages/dumbo/src/core/schema/components/tableTypesInference.ts:45`

Tables now expose plain frozen records, not `ReadonlyMap` components. This looks like leftover compatibility logic from the deleted parent-pointer/map component model.

Recommendation: remove the `Exclude<..., keyof ReadonlyMap<...>>` layer unless a type test proves it is still needed. The direct shape should be:

```ts
Extract<
  T extends TableComponent<infer Columns> ? keyof Columns : never,
  string
>;
```

Tradeoff: this is cleanup only, but it makes the type model match the runtime model.

### 7. Old renamed component APIs appear removed cleanly

Severity: informational.

I searched source files, excluding `dist`, specs, Markdown, and `*.tsbuildinfo`, for:

- `databaseSchemaSchemaComponent`
- `tableSchemaComponent`
- `indexSchemaComponent`
- `schemaComponentMigrator`
- `pongoCollectionSchemaComponent`
- `pongoDatabaseSchemaComponent`

No source references remain. That supports the spec's requirement that there are no aliases for deleted APIs.

### 8. Public `.from` helpers are unused internally, but not necessarily dead

Severity: informational.

The dead-code search found these internal-only references:

- `packages/dumbo/src/core/schema/dumboSchema/dumboSchema.ts:185`
- `packages/pongo/src/core/schema/index.ts:338`
- `packages/pongo/src/core/schema/index.ts:451`

They are exposed as `dumboSchema.database.from`, `pongoSchema.collection.from`, and `pongoSchema.db.from`, so they may be public convenience API rather than removable dead code. Do not remove them as dead code unless the public API is intentionally being narrowed.

## Coherence Against `spec.md`

What matches well:

- Components no longer expose child component maps through the base `SchemaComponent`.
- Placement is context-only for tables and indexes.
- Generated names are path-based and omit database names.
- SQLite/PostgreSQL rendering is delegated to SQL tokens/processors.
- The deleted parent-pointer/reconstruction model is gone from source.

Where the implementation drifts:

- Collection-level migration reintroduces an implicit-placement problem by reading table migrations without context.
- Pongo's overlay logic is more stateful than the rest of the model. It is not wrong, but it is the place most likely to accumulate exceptions.
- Dynamic schema creation checks direct database schemas but not extension-owned schemas, while lookup checks both.

## Recommended Order

1. Fix `pongoCollection.schema.migrate()` placement first. This is the branch-specific correctness issue.
2. Keep `dryRun` as rollback-based execution and retain the added integration coverage.
3. Simplify `pongoDatabaseSchemas` locally around a single runtime scope resolver.
4. Align dynamic schema creation with `findTables` by considering extension-owned schemas.
5. Remove `ReadonlyMap` compatibility filtering from `TableColumnNames` if type tests still pass.

I would avoid a larger abstraction pass. The Dumbo component layer is already close to the target model; most complexity worth reducing is in Pongo's runtime overlay, not the generic schema component primitives.
