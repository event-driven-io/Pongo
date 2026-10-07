# Bundled relational schema migrations for event stores, consumers, and processors

## Summary

PostgreSQL and SQLite event stores must expose one composable schema graph that includes their own schema and the schemas of registered projections and processors that use the same storage. A parent must flatten that graph into one ordered Dumbo migration plan and execute it with one migration runner and one transaction. Runtime initialization must reuse the same lazy, memoized migration behavior that event stores already have, including `autoMigration` inheritance and an explicit `None` override.

The change also makes event-store async projection registrations useful at runtime. Async projection definitions registered on an event store are passed to consumers automatically and become ordinary projectors with default processor settings. Passing an explicit `processors` array to the consumer disables that automatic registration. A later explicit processor registration with the same processor ID replaces the automatically registered processor.

Dumbo provides an immutable `SchemaComponentMigrator` that binds one storage-agnostic schema component graph to a concrete pool. Pongo databases already use it, and PostgreSQL and SQLite event stores and their consumers must use it too, for SQL description, explicit migration, and lazy schema assurance. The migrator does not read `autoMigration`; the owner picks the call. Under `CreateOrUpdate`, the owner calls `migrate()`, which applies pending migrations. Under `None`, it calls `ensureMigrated()`, which reads the migration history and throws when migrations are pending, without executing DDL.

The Dumbo and Pongo parts are done in [Pongo PR #225](https://github.com/event-driven-io/Pongo/pull/225). See [Done in Pongo PR #225](#done-in-pongo-pr-225). The remaining work is in Emmett, and it needs a Dumbo and Pongo release that includes that PR.

## Why this is needed

The current code has two separate migration paths:

- `eventStore.schema.migrate()` runs event-store migrations and invokes `init` only for projections registered as inline.
- `consumer.start()` invokes async processor initialization independently, and built-in Pongo projection initialization calls `collection.schema.migrate()`.

This causes runtime processes to issue DDL even when the event store uses `autoMigration: 'None'`. In PostgreSQL, even `CREATE TABLE IF NOT EXISTS` requires namespace `CREATE`, so a least-privilege runtime role fails before PostgreSQL can observe that the table already exists. Provisioning code also has to register projections merely to make their schema visible to migration.

The connection and transaction are not missing today. PostgreSQL and SQLite projection initialization already receives `execute`, the connection, the transaction, the pool, the driver, and migration options through its context. The missing abstraction is a declarative schema contribution that a parent can compose before executing migrations.

## Goals

- Compose event-store, consumer, projection, reactor, and workflow schema contributions when they use the same PostgreSQL or SQLite storage.
- Execute a composed schema as one Dumbo migration plan, with one migration-table setup and one transaction.
- Let projections and processors contribute declarative Dumbo schema components while storage-bound event stores and consumers expose migration operations.
- Preserve existing lazy and explicit event-store migration semantics.
- Inherit `autoMigration` through event store → consumer → processor, with an override at each level.
- Keep the root default as `CreateOrUpdate`.
- Ensure `None` prevents automatic schema execution before the migration runner is called.
- Include both inline and async event-store projection registrations in event-store migration composition and initialization.
- Automatically register event-store async projections as consumer projectors using default processor settings.
- Allow all processor kinds to contribute schema when they share the consumer's storage.
- Use Dumbo's `SchemaComponentMigrator` in Emmett schema owners, as Pongo does.
- Under `CreateOrUpdate`, automatic assurance calls `migrate()`. Under `None`, it calls `ensureMigrated()`, which checks migration history without DDL.
- Report pending migrations through Dumbo's typed `PendingMigrationsError` when the read-only check fails.
- Preserve current `dryRun` behavior: execute inside a transaction and roll back.

## Non-goals

- Do not change the default `autoMigration` value to `None`.
- Do not add `Verify` to the `autoMigration` union.
- Do not add a separate `verifyNoPendingMigrations()` or validation-result API; `ensureMigrated()` owns that behavior.
- Do not structurally inspect tables, functions, indexes, or other database objects.
- Do not treat migrations recorded in the database but absent from the current bundle as an error.
- Do not change `dryRun` into a no-execution operation.
- Do not compare connection strings or database metadata to decide whether two independently configured pools target the same physical database.
- Do not bundle processors that supply their own pool or connection, even when they happen to target the same database as the parent.
- Do not add arbitrary user-supplied Dumbo or Pongo extension schemas in this change. The schema graph must leave room for that later.
- Do not add relational migration behavior to MongoDB, EventStoreDB, or in-memory storage. The core registration behavior may be shared where applicable, but schema execution is limited to PostgreSQL and SQLite.
- Do not move `autoMigration` into Dumbo. The owner picks `migrate()` or `ensureMigrated()`.
- Do not share concurrent first calls through an in-flight promise, and do not retry them. When two first calls apply the same migration at the same time, one fails with Dumbo's `UniqueConstraintError`. This matches Dumbo and Pongo.

## Existing behavior to preserve

- An explicit `schema.migrate()` call runs even when `autoMigration` is `None`; `None` changes automatic assurance from migration to a read-only check.
- Automatic event-store migration is lazy and memoized per bound event-store instance.
- A non-dry migration is not executed repeatedly by normal operations on the same bound instance.
- `dryRun` executes migrations transactionally and does not mark the schema as migrated.
- Migration failures use the current Dumbo transaction and rollback behavior.
- Processor initialization remains one-time per processor instance.
- Processors with their own storage configuration initialize against their own storage.

## Core schema contribution

Emmett core must allow a projection definition or message processor to carry a schema value without importing Dumbo or defining a second schema abstraction. Add a generic schema parameter directly to the existing types:

```ts
export type ProjectionDefinition<
  EventType,
  EventMetaDataType,
  HandlerContext,
  EventPayloadType,
  Schema = unknown,
> = {
  // existing fields
  schema?: Schema;
};

export type MessageProcessor<
  MessageType,
  MessageMetadataType,
  HandlerContext,
  Schema = unknown,
> = {
  // existing fields
  schema?: Schema;
};
```

The exact generic placement must preserve existing inference and default type arguments. Core does not inspect the schema value. PostgreSQL and SQLite adapters accept Dumbo `AnySchemaComponent` values and use Dumbo's component guard when collecting contributions.

Do not introduce a core `RelationalSchema`, migration facade, or duplicate component wrapper.

## Storage-agnostic Dumbo components

Keep Dumbo's existing `SchemaComponent` and `AnySchemaComponent` storage-agnostic. A component describes migrations but does not own a pool, connection, transaction, or driver. Do not add a driver generic, runtime driver discriminator, or supported-driver list to the component API for this change.

The concrete event store or consumer binds the composed component graph to its own storage and driver when it renders or executes migrations. Bundling is therefore decided by storage ownership:

- A child is bundleable only when it uses the parent's inherited pool/session.
- A processor with explicit connection options, pool, Dumbo instance, or connection owns separate storage and is excluded from the parent bundle.
- Do not compare connection strings. Two distinct pools cannot share the parent's active migration transaction even when they target the same database.
- Existing Dumbo SQL rendering and execution behavior determines whether a component's migrations can run with the bound parent's driver; this change does not add a separate compatibility protocol.

## Done in Pongo PR #225

[Pongo PR #225](https://github.com/event-driven-io/Pongo/pull/225) implements the Dumbo and Pongo parts. Emmett uses them as they are and does not add a wrapper.

### Dumbo `SchemaComponentMigrator`

```ts
export type SchemaComponentMigrator<
  Component extends AnySchemaComponent = AnySchemaComponent,
> = Readonly<{
  component: Component;
  sql(): string;
  print(): void;
  migrate(
    options?: Pick<
      MigratorOptions,
      'execute' | 'dryRun' | 'ignoreMigrationHashMismatch' | 'migrationTimeoutMS'
    >,
  ): Promise<RunSQLMigrationsResult>;
  ensureMigrated(
    options?: Pick<
      MigratorOptions,
      'dryRun' | 'ignoreMigrationHashMismatch' | 'migrationTimeoutMS'
    >,
  ): Promise<void>;
}>;

export const schemaComponentMigrator = <Component extends AnySchemaComponent>(
  options: MigratorOptions & { pool: Dumbo; component: Component },
): SchemaComponentMigrator<Component>;
```

An owner uses it like this:

```ts
const migrator = schemaComponentMigrator({
  pool,
  component,
  migrationTable,
});

// automatic assurance
await (autoMigration === 'None'
  ? migrator.ensureMigrated()
  : migrator.migrate());
```

The behavior is:

- The pool, the component graph, and the `MigratorOptions` (migration table, executor, lock, transaction options, dry run, hash ignore, timeout) are fixed when the migrator is created. To change the graph or the migration table, the owner creates a new migrator.
- Per-call options override the configured ones. A per-call `undefined` keeps the configured value.
- `migrate()` and `ensureMigrated()` run the same check first. It reads the migration history on the configured executor or on the pool, without a transaction, DDL, or migration lock. A missing history table counts as empty history. Recorded migrations that are not in the graph are ignored. Migrations whose SQL renders to nothing are ignored.
- The check compares each expected migration with its record:
  - no record: pending;
  - same hash: applied;
  - different hash: throws `InvalidOperationError` (`Migration hash mismatch for "<name>". Aborting migration.`) before any write;
  - different hash, with `ignoreMigrationHashMismatch` on the migrator or `ignoreHashMismatch` on the `sqlMigration`: counts as applied, the tracer logs `migration-hash-mismatch`, and the recorded hash stays unchanged.
- `ensureMigrated()` never writes. When something is pending, it throws `PendingMigrationsError`, and `pendingMigrations` holds the pending `SQLMigration` values.
- When nothing is pending, `migrate()` returns `{ applied: [], skipped }` without writing. Otherwise, it takes the migration lock (PostgreSQL advisory lock; no lock on SQLite) and creates the history table if needed. For each pending migration, it then runs one batch: the history record first, then the migration SQL. It runs in a new transaction, or on the caller's `execute`.
- Concurrent first calls both find the migration pending. The first one applies it. The second one fails with `UniqueConstraintError` on the history `name` column, and its transaction rolls back. There are no retries.
- When the check finds nothing pending, or `migrate()` applies the pending migrations, the migrator remembers it. Later calls return without database access. A `migrate()` dry run, a `migrate()` with a per-call `execute`, and a failed call are not remembered. Concurrent calls do not share an in-flight promise.
- `migrate({ dryRun: true })` executes in a transaction and rolls back.
- `sql()` and `print()` describe only the component graph's migrations. They exclude the history table, the lock, and the history records.
- A migration name longer than 255 characters fails with `InvalidOperationError`. A database type without registered metadata or default migrator options fails with `NotRegisteredError`.

Dumbo also provides schema-inspection helpers with a `{ databaseSchemaName }` option, for tests. PostgreSQL has `schemaExists`, `tableExists`, `columnExists`, `functionExists`, `indexExists`, and `sequenceExists`. SQLite has `tableExists`, `columnExists`, and `indexExists`, tested on sqlite3, D1, and Durable Objects.

For PostgreSQL migrations, `createFunctionIfDoesNotExistSQL(functionName, functionDefinition, { databaseSchemaName })` wraps a function definition in a `DO` block that runs it only when the function is missing. Without `databaseSchemaName`, it checks `current_schema()`.

### Pongo

- `PongoDb.schema` exposes `component`, `sql()`, `print()`, `migrate()`, and `ensureMigrated()`, plus `migrations` and `renameCollection()`. One `SchemaComponentMigrator` per database backs it. Registering or renaming a collection replaces the migrator.
- `db.schema.ensureMigrated()` runs only the read-only check, whatever the `autoMigration` setting is.
- Before collection operations and before `db.sql.query()` and `db.sql.command()`, Pongo runs automatic assurance: `migrate()` under `CreateOrUpdate`, `ensureMigrated()` under `None`.
- `db.schema.migrate({ session })` runs in the session's active transaction. Automatic assurance runs in its own migration transaction.
- `collection.schema.component` is the declarative contribution that Emmett composes. `collection.schema.migrate()` is deprecated, not removed. It calls `db.schema.migrate()` and migrates the whole database.
- `PongoMigrationOptions` no longer accepts `migrationTable`. The migration table comes from the client or database options.
- On D1, Pongo creates the migrator with `{ execute: pool.execute, transactionOptions: { mode: 'strict' } }`. Migrations run directly on the pool, and dry runs are rejected. The history record and the migration SQL are in one batch, so D1 applies them together or not at all.
- Docs: `src/docs/schema-migrations.md`, `src/docs/getting-started.md`, the root `README.md`, and `src/packages/dumbo/README.md`.

## Storage-bound schema operations

Only objects that own or inherit a concrete relational pool expose schema operations. Extend the existing PostgreSQL and SQLite event-store `schema` objects and add equivalent `schema` objects to their consumers:

```ts
schema: {
  readonly component: AnySchemaComponent;
  sql(): string;
  print(): void;
  migrate(options?: MigrationOptions): Promise<RunSQLMigrationsResult>;
  ensureMigrated(): Promise<void>;
  // Event stores retain their existing `dangerous` operations.
};
```

This is the same shape as `PongoDb.schema`. `ensureMigrated()` is the read-only check under any `autoMigration` setting, as in Pongo.

Projections and processors expose only their optional declarative `schema` component. They do not expose redundant `migrate()`, `sql()`, `print()`, verification, or `autoMigration` members.

`autoMigration` remains configuration on event-store, consumer, and processor registrations. Its effective value is resolved through the ownership chain; it is not a property required on every schema component.

The public schema methods are backed by the owner's current Dumbo `SchemaComponentMigrator`. The owner resolves its effective `autoMigration` value and uses it for automatic assurance: `migrate()` under `CreateOrUpdate`, `ensureMigrated()` under `None`. Pongo's `ensureSchema` in `pongoDb.ts` is the reference. Dumbo implements the check, the migration, and the memoization once.

An event store or consumer's `sql()`, `print()`, `migrate()`, and `ensureMigrated()` operate on its complete effective schema graph, not only its local tables. Its `migrate()` flattens that graph and calls the Dumbo migration runner once; it must not call child migration methods sequentially.

## Schema graph and ownership

Every schema owner has a local component and zero or more child components. Components are composed in this order:

1. Event-store schema.
2. Consumer infrastructure owned by that event store or consumer, including processor checkpoint and projection-registration storage.
3. Registered processor and projection schemas in registration order.

The same order is used by `sql()`, `print()`, `migrate()`, and `ensureMigrated()`.

The event-store schema graph contains:

- The local event-store component.
- Every schema-aware inline projection registered on the event store.
- Every schema-aware async projection registered on the event store.

The consumer schema graph contains:

- The event-store component when the consumer was created by an event store.
- The consumer's local relational infrastructure.
- Every effective schema-aware processor registered on the consumer that uses the inherited consumer pool.

Components are flattened and deduplicated through Dumbo's component and migration utilities. The same migration name with equivalent SQL is included once. Dumbo's existing component composition rejects conflicting SQL for the same migration name before database execution rather than silently selecting one definition.

All migrations in a bundle use the parent's configured migration table and the parent's active transaction executor. This removes the current nested Pongo migration runner and ensures the migration table is checked or created once per bundle.

## Binding and memoization

A projection definition and its declarative component can be reused with different stores and databases, so migration state must never be stored globally on either object. Each storage-bound owner composes its current graph and creates a `SchemaComponentMigrator` for that graph and inherited storage target.

The migrator owns the completed state. Child initialization delegates to the owner's automatic assurance on the same migrator, so a successful parent migration or check satisfies later initialization within that graph. When registration changes the graph, the owner composes the new graph and replaces its current migrator, as `PongoDatabaseComponent` does. The new migrator checks the complete plan on first use. Recorded migrations are skipped, and new migrations are applied or reported as pending according to `autoMigration`.

The following operations do not mark a schema as migrated:

- `sql()`
- `print()`
- `migrate({ dryRun: true })`
- A failed migration
- A failed read-only assurance

## `autoMigration` resolution

Resolve the effective policy through the ownership chain:

```text
event store → consumer → processor
```

The rules are:

- A root Pongo database, event store, or standalone consumer defaults to `CreateOrUpdate`.
- An omitted child value inherits its parent's effective policy.
- An explicit child value overrides the inherited value.
- A processor with separate storage starts a separate policy chain and defaults to `CreateOrUpdate` when it has no explicit value.
- `None` prevents automatic migration, migration-table creation, and migration-lock acquisition. Automatic assurance calls `ensureMigrated()` instead, which reads the existing migration history and throws `PendingMigrationsError` when the effective graph has not been applied.
- An explicit `schema.migrate()` still runs under `None`.

Automatic migration triggers remain consistent with current event-store behavior:

- An inline projection is covered by the event store's lazy automatic assurance before the first store operation. Projection handling itself never invokes initialization per event or batch.
- A consumer runs automatic assurance for its effective graph during initialization/start.
- A processor with separate storage runs automatic assurance on its own migrator during initialization.

## Projection and processor initialization

Schema composition and lifecycle initialization are coordinated but are not the same operation.

- Built-in Pongo projections expose collection migrations through `collection.schema.component` instead of calling the deprecated `collection.schema.migrate()`.
- Initialization delegates to the storage-bound owner's automatic assurance rather than calling child migration methods.
- With effective `CreateOrUpdate`, the owner calls `migrate()`, which lazily applies pending migrations.
- With effective `None`, the owner calls `ensureMigrated()`, which performs the read-only migration-history check and throws when migrations are pending.
- When the current migrator has already completed migration or read-only assurance, later initialization does not access migration history again.
- Non-schema initialization retains its existing once-per-instance behavior.
- Existing schema-unaware processors and projections continue to use their current `init` behavior and cannot contribute imperative work to a declarative bundle.
- Processors with separate storage are not included in the parent bundle and initialize normally against their own storage and policy.

Event-store projection initialization must cover both inline and async registrations. PostgreSQL projection metadata registration must use the registration's actual `registrationType`; it must not hardcode `async`. SQLite inline initialization must report `inline`; it must not report `async`.

## Event-store async projection registration

Keep the existing event-store projection registration shape. An async entry contains only its projection definition:

```ts
projections: [
  ...projections.inline([ordersSummary]),
  ...projections.async([billingSummary]),
];
```

Do not add full processor options to the async projection registration. When an event store creates a consumer, each async projection becomes a normal projector using the same defaults as an explicit `consumer.projector({ projection })` call.

The core `projections.async()` helper currently returns registrations typed and valued as `inline`; correct it to return `async`.

## Consumer processor defaults and replacement

Use the existing `processors` option to control automatic registration; do not add an inherit/include flag.

- `eventStore.consumer()` with `processors` omitted starts with projector processors derived from the event store's async projection definitions.
- `eventStore.consumer({ processors: [...] })` treats the provided array as the complete initial processor set and does not automatically register event-store async projections.
- `processors: []` explicitly starts with no processors.
- Calls to `consumer.projector()`, `consumer.reactor()`, and `consumer.workflowProcessor()` after construction remain additive.
- When an explicitly registered processor has the same processor ID as an automatically registered processor, replace the automatic processor rather than retaining both or throwing.

The replacement behavior must be based on processor ID, not object identity. Do not silently broaden replacement semantics for unrelated explicit duplicate registrations unless existing tests and API expectations support it; the required case is replacing an automatically seeded default.

This registration behavior belongs in core where possible so non-relational event stores with applicable consumer/projector factories can use it. The schema contribution and migration behavior remains relational.

## Read-only assurance under `None`

Under `None`, automatic assurance calls `ensureMigrated()`. It does not need a separate validation method or result object:

```ts
await schema.ensureMigrated();
```

This call reads the configured migration table without creating it or any other database object. Dumbo's check (see [Done in Pongo PR #225](#done-in-pongo-pr-225)) compares expected migrations from the effective graph with recorded migrations, applies the hash rule, and ignores historical records absent from the graph. A missing migration table makes every expected migration pending. If anything is pending, the call throws `PendingMigrationsError` with the pending migration list. A hash mismatch that is not ignored throws `InvalidOperationError`. Otherwise, the call resolves and memoizes success.

The operation must work for PostgreSQL runtime roles that have read access but no namespace `CREATE` privilege.

## Public behavior examples

### Provision every registered projection in one call

```ts
const eventStore = getPostgreSQLEventStore({
  driver: pgEventStoreDriver,
  connectionString,
  projections: [
    ...projections.inline([ordersSummary]),
    ...projections.async([billingSummary]),
  ],
  schema: { autoMigration: 'None' },
});

await eventStore.schema.migrate();
```

The call applies the event-store schema and both projection schemas in one migration run even though automatic migration is disabled.

### Use the event store's async projections as consumer defaults

```ts
const consumer = eventStore.consumer();
await consumer.start();
```

The consumer registers `billingSummary` as a projector with default processor settings. With inherited `autoMigration: 'None'`, startup checks migration history without executing DDL and throws if the effective graph has pending migrations.

### Replace automatic processors completely

```ts
const consumer = eventStore.consumer({ processors: [] });

consumer.projector({
  processorId: 'billing-summary-v2',
  projection: billingSummary,
  startFrom: 'BEGINNING',
});
```

Because `processors` was explicitly provided, no async projection processors are added automatically.

### Ensure migration state without DDL

```ts
await eventStore.schema.ensureMigrated();
```

Under any `autoMigration` setting, this reads migration history only and throws `PendingMigrationsError` when necessary. It does not behave like `dryRun` and does not require DDL privileges.

## Actionable code changes

### Emmett core

- Update `src/packages/emmett/src/projections/index.ts`:
  - Add a schema generic to `ProjectionDefinition` without importing Dumbo.
  - Allow projection definitions to expose an optional schema value while preserving existing inference and default type arguments.
  - Fix `asyncProjections()` to return `ProjectionRegistration<'async'>` values with `type: 'async'`.
- Update `src/packages/emmett/src/processors/processors.ts`:
  - Add the corresponding schema generic and optional schema value to message processors.
  - Keep normal processor initialization one-shot.
- Update `src/packages/emmett/src/consumers/consumers.ts`:
  - Support automatically seeded processors separately from an explicitly supplied `processors` array.
  - Replace an automatically seeded processor when an explicit registration has the same ID.
  - Preserve explicit additions and the existing start/close behavior.
- Update core consumer and event-store typing so relational adapters can pass event-store async projection defaults without adding Dumbo concepts to core.

### Dumbo and Pongo

Done in [Pongo PR #225](https://github.com/event-driven-io/Pongo/pull/225). See [Done in Pongo PR #225](#done-in-pongo-pr-225). Update Emmett's Dumbo and Pongo dependencies to a release that includes it.

### Emmett test support

- Delete `emmett-postgresql/src/testing/schemaObjects.ts`, including its `TODO`. Import `schemaExists`, `tableExists`, `functionExists`, `indexExists`, and `sequenceExists` from `@event-driven-io/dumbo/pg`. The schema name moves from the third positional argument to an options object: `tableExists(execute, name, schema)` becomes `tableExists(execute, name, { databaseSchemaName: schema })`. Six spec files import from `schemaObjects.ts`.
- Without a schema name, Emmett's helpers search `current_schema()`, and Dumbo's search `current_schemas(false)`, which is every schema on the `search_path`. The results are the same unless a test puts more than one schema on the `search_path`.
- In SQLite specs, replace `tableExists(execute, sqliteTableName({ databaseSchemaName, tableName }))` with `tableExists(execute, tableName, { databaseSchemaName })`, from `@event-driven-io/dumbo/sqlite`. Do the same for `indexExists`.
- In `0_42_0.migration.int.spec.ts`, replace the four `information_schema.columns` queries with `columnExists(pool.execute, 'emt_processors', 'created_at')` and the like, from `@event-driven-io/dumbo/pg`.
- `messagesPollIndex.int.spec.ts` keeps its `pg_class` query. It reads the partitioned index tree, not whether an object exists.

### PostgreSQL

- Extract the current event-store migration array into an event-store schema component in `src/packages/emmett-postgresql/src/eventStore/schema/migrations/`.
- Delete `src/packages/emmett-postgresql/src/eventStore/schema/createFunctionIfDoesNotExist.ts` and import `createFunctionIfDoesNotExistSQL` from `@event-driven-io/dumbo/postgresql`. The schema name moves from the third positional argument to `{ databaseSchemaName }`. The default schema stays `current_schema()`. Dumbo renders the same SQL text as Emmett's helper, and a Dumbo unit test pins that text, so recorded migration hashes still match.
- Update `src/packages/emmett-postgresql/src/eventStore/postgreSQLEventStore.ts` to:
  - Accept and retain both inline and async projection registrations.
  - Compose both kinds of schema-aware projection components.
  - Run one migration plan.
  - Initialize both registration kinds once.
  - Pass async projection definitions to created consumers when `processors` is omitted.
  - Create the current composed `SchemaComponentMigrator` and expose it through the existing event-store schema object.
  - Replace lazy event-store migration with automatic assurance: `migrate()` under `CreateOrUpdate`, `ensureMigrated()` under `None`.
  - Replace the migrator if the registered component graph changes.
- Update `src/packages/emmett-postgresql/src/eventStore/consumers/postgreSQLEventStoreConsumer.ts` to:
  - Resolve inherited `autoMigration`.
  - Build a consumer schema from the parent/local component and same-pool processor components.
  - Create a `SchemaComponentMigrator`, pick the automatic assurance call from the effective policy, and expose `component`, `sql`, `print`, `migrate`, and `ensureMigrated`.
  - Replace the migrator when processor registration changes the component graph.
- Update `src/packages/emmett-postgresql/src/eventStore/consumers/postgreSQLProcessor.ts` to:
  - Bind schema-aware processors to inherited or owned storage.
  - Apply policy inheritance and overrides.
  - Avoid nested/repeated migration after a successful parent bundle.
- Update `src/packages/emmett-postgresql/src/eventStore/projections/postgreSQLProjection.ts` to use the supplied registration type instead of hardcoding `async`.
- Update Pongo projection factories under `src/packages/emmett-postgresql/src/eventStore/projections/pongo/` to expose collection schema components and remove their dependency on the deprecated `collection.schema.migrate()`.

### SQLite

- Extract the current event-store migration array into an event-store schema component in `src/packages/emmett-sqlite/src/eventStore/schema/migrations/`.
- Update `src/packages/emmett-sqlite/src/eventStore/SQLiteEventStore.ts` with the same composition, policy, async registration, and schema API behavior as PostgreSQL.
- Update `src/packages/emmett-sqlite/src/eventStore/consumers/sqliteEventStoreConsumer.ts` and `sqliteProcessor.ts` with the same `SchemaComponentMigrator`, replacement, consumer, and processor behavior.
- Correct inline projection initialization to use `registrationType: 'inline'`.
- Update Pongo projection factories under `src/packages/emmett-sqlite/src/eventStore/projections/pongo/` to contribute collection schema components without calling the deprecated `collection.schema.migrate()`.
- Apply the behavior to sqlite3, D1, and Durable Object driver variants through shared code, with driver-specific integration coverage.
- On D1, create the migrator with the same options as Pongo's D1 driver: `{ execute: pool.execute, transactionOptions: { mode: 'strict' } }`.

### Documentation

Pongo and Dumbo docs are done in PR #225. The items below are for Emmett's docs.

- Document declarative schema components separately from the storage-bound event-store and consumer schema operations in both package READMEs and `src/docs`.
- Explain `autoMigration` inheritance and explicit overrides.
- Explain that automatic assurance calls `migrate()` under `CreateOrUpdate` and `ensureMigrated()` under `None`, and distinguish the read-only `ensureMigrated()` from `dryRun`.
- Show one-call provisioning for inline and async projections.
- Show the omitted-versus-provided `processors` behavior.
- State that independently configured processor storage is not included in the parent bundle.

## Test-first implementation order

The order below follows real dependencies and starts with isolated quick wins. Each item begins with a failing test and ends with the smallest implementation needed to pass it; it is not a set of release phases. The Dumbo and Pongo items are done in [Pongo PR #225](https://github.com/event-driven-io/Pongo/pull/225), so the list covers Emmett only. Items 1–3 do not need the new Dumbo and Pongo release. The other items do.

1. Add core unit tests proving `projections.async()` returns `type: 'async'` with the correct TypeScript registration type, then correct the helper.
2. Add core consumer tests for automatically seeded processors, explicit `processors: []`, and replacement of an automatic processor by explicit registration with the same ID, then implement the registry behavior without changing unrelated lifecycle behavior.
3. Add PostgreSQL and SQLite tests that expose the current registration-type errors: PostgreSQL must persist the supplied inline/async type, and SQLite inline initialization must receive `inline`. Fix those two localized defects.
4. Update Dumbo and Pongo to the release with PR #225. Replace `emmett-postgresql/src/testing/schemaObjects.ts` with Dumbo's schema-inspection helpers, keeping the existing tests green.
5. Add Emmett compile-time tests for the new projection and processor schema generics using a structural `AnySchemaComponent` fixture. Add composition tests proving existing Dumbo components remain unchanged and are bound only when collected by a storage owner; do not publish an Emmett-specific wrapper or add driver metadata to Dumbo components.
6. Add PostgreSQL schema tests proving the event-store migration component produces the same SQL migrations as the current array. Extract the component while keeping existing `schema.sql()` and `schema.migrate()` tests green.
7. Repeat the same component-equivalence test and extraction for shared SQLite schema code before testing individual SQLite drivers.
8. Add Pongo projection tests proving each built-in projection exposes the expected collection component without opening a migration transaction or calling the deprecated `collection.schema.migrate()`. Refactor the PostgreSQL and SQLite Pongo factories to use that component.
9. Add PostgreSQL integration tests showing one `eventStore.schema.migrate()` creates the event store plus inline and async Pongo projection tables through one migration runner and one transaction. Implement event-store component composition and create its `SchemaComponentMigrator`.
10. Add equivalent SQLite integration tests in shared suites and run them against sqlite3, D1, and Durable Object variants. Implement shared SQLite composition rather than duplicating it per driver.
11. Add tests for the API boundary: projections and processors expose only a declarative component, while event stores and consumers expose `component`, `sql`, `print`, `migrate`, and `ensureMigrated`, like `PongoDb.schema`. Assert that every storage-bound operation describes the same effective graph and that registration recreates the owner's immutable migrator.
12. Add policy tests for root `CreateOrUpdate`, inherited `None`, child override to `CreateOrUpdate`, child override to `None`, explicit migration under `None`, and independently configured processor storage. Implement effective-policy resolution once in Emmett core and use the result to pick `migrate()` or `ensureMigrated()` on each relational `SchemaComponentMigrator`.
13. Add initialization tests proving a successful parent migration or check satisfies later initialization on the same migrator, consumer start does not repeat it, inline handling never assures per event, graph replacement triggers a new check, and separate-storage processors initialize independently.
14. Add a concurrency test on PostgreSQL and SQLite: two first automatic assurances on a fresh database, for example two consumer starts. One succeeds, the other fails with `UniqueConstraintError`, and the schema exists. This matches the Dumbo tests.
15. Add event-store consumer tests showing omitted `processors` creates projectors for async definitions with default settings, an explicit array suppresses defaults, and an explicit same-ID registration replaces an automatic projector.
16. Add least-privilege PostgreSQL integration coverage: migrate with a migration role, then start an event store and consumer with `autoMigration: 'None'` under a role with read access but no schema `CREATE`; assert that `ensureMigrated()` succeeds without DDL, migration-table creation, or lock acquisition. Add the pending-schema variant and assert the typed error identifies pending migrations.
17. Add regression tests confirming `dryRun` still executes transactionally and rolls back, and that it does not satisfy parent or child migrators.
18. Update documentation from the tested public examples, then run formatting/type checks and the smallest affected PostgreSQL and SQLite integration suites before the repository-wide unit and full test commands required for application-code completion.

## Acceptance criteria

- A PostgreSQL or SQLite event store with inline and async Pongo projections can create every required table through one `eventStore.schema.migrate()` call.
- The composed migration uses one Dumbo runner invocation, one configured migration table, and one transaction.
- Event stores and consumers use Dumbo's `SchemaComponentMigrator` from PR #225, without an Emmett-specific wrapper.
- Automatic assurance calls `migrate()` under `CreateOrUpdate` and `ensureMigrated()` under `None`. `ensureMigrated()` performs a read-only history check and throws `PendingMigrationsError` containing pending migrations.
- Successful migration or check is memoized per migrator, failures can retry, and dry runs never satisfy assurance. Concurrent first calls are not shared; one of them fails with `UniqueConstraintError`.
- Changing an owner's component graph recreates its immutable migrator, whose next assurance observes the new graph.
- `schema.sql()` and `schema.print()` exclude migration-history and lock bookkeeping.
- A projection or processor contributes only a storage-agnostic Dumbo schema component; it does not expose a second migration facade.
- `eventStore.schema.component` and `consumer.schema.component` expose their complete composed graphs.
- `eventStore.schema.sql()` includes event-store and registered projection migrations in ownership order.
- Built-in Pongo projections use `collection.schema.component` and do not call the deprecated `collection.schema.migrate()`.
- `eventStore.consumer()` automatically registers async event-store projections as default projectors.
- `eventStore.consumer({ processors: [] })` registers none of those defaults.
- An explicit processor registration replaces an automatic processor with the same ID.
- A consumer created by an event store exposes a schema bundle containing the parent schema and same-storage processor schemas.
- Inline and async projection registration metadata uses the correct registration type.
- `autoMigration` defaults to `CreateOrUpdate` only at a root and otherwise inherits through event store → consumer → processor.
- `None` causes consumer startup and processor initialization to avoid invoking any migration runner, migration-table DDL, or migration lock while still checking recorded migrations.
- Explicit `schema.migrate()` works under `None`.
- A child using an already satisfied owner migrator does not access migration history again during initialization in the same bound object graph.
- An explicitly configured processor pool is excluded from its parent's migration bundle and follows its own migration lifecycle.
- Read-only `ensureMigrated()` ignores extra historical migrations, respects the existing hash-ignore option, treats a missing migration table as all expected migrations pending, reports pending values through `PendingMigrationsError`, and throws `InvalidOperationError` for a hash mismatch that is not ignored.
- `dryRun` retains current execute-and-rollback behavior.
- Existing schema-unaware processors continue to initialize and process messages as before.

## Verification commands for implementation

Run focused tests as each behavior is introduced. From `src`, finish application-code work with:

```shell
npm run agent:check
npm run test:unit
npm test
```

Also run the focused PostgreSQL and SQLite integration files added for schema composition, assurance, policy inheritance, async processor defaults, concurrency, and least-privilege startup.
