# Bundled relational schema migrations for event stores, consumers, and processors

## Summary

PostgreSQL and SQLite event stores must expose one composable schema graph that includes their own schema and the schemas of registered projections and processors that use the same storage. A parent must flatten that graph into one ordered Dumbo migration plan and execute it with one migration runner and one transaction. Runtime initialization must reuse the same lazy, memoized migration behavior that event stores already have, including `autoMigration` inheritance and an explicit `None` override.

The change also makes event-store async projection registrations useful at runtime. Async projection definitions registered on an event store are passed to consumers automatically and become ordinary projectors with default processor settings. Passing an explicit `processors` array to the consumer disables that automatic registration. A later explicit processor registration with the same processor ID replaces the automatically registered processor.

Dumbo must provide an immutable `DatabaseMigrator` that binds one storage-agnostic schema component graph to a concrete database. Pongo databases, PostgreSQL and SQLite event stores, and their consumers use that shared capability for SQL description, explicit migration, and lazy schema assurance. With `CreateOrUpdate`, `ensureMigrated()` applies pending migrations. With `None`, it performs a read-only migration-history check and throws when migrations are pending without executing DDL.

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
- Use one Dumbo `DatabaseMigrator` capability across Pongo and Emmett schema owners.
- Make `ensureMigrated()` apply migrations under `CreateOrUpdate` and validate migration history without DDL under `None`.
- Report pending migrations through a typed `PendingMigrationsError` when read-only assurance fails.
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

## Dumbo `DatabaseMigrator`

Add a module-pattern `DatabaseMigrator` capability to Dumbo. It binds one immutable `AnySchemaComponent` graph to a concrete pool, migration-history table, resolved `autoMigration` setting, and default migration options:

```ts
export type DatabaseMigrator = {
  readonly component: AnySchemaComponent;
  sql(): string;
  print(): void;
  migrate(options?: MigratorRunOptions): Promise<RunSQLMigrationsResult>;
  ensureMigrated(): Promise<void>;
};

export const databaseMigrator = (
  options: DatabaseMigratorOptions,
): DatabaseMigrator => {
  // module-pattern implementation
};
```

The exact option type should reuse Dumbo's existing pool, migration-table, timeout, hash, executor, and migration option types. Do not introduce a second schema model: `component` remains the declarative model, while `DatabaseMigrator` is the database-bound capability that operates on it.

`DatabaseMigrator` behavior is:

- The component graph and migration-history table are fixed for the lifetime of the migrator.
- When an owner changes its graph or migration-table configuration, it creates and stores a new migrator.
- `migrate()` explicitly invokes the migration runner regardless of `autoMigration`.
- `ensureMigrated()` with `CreateOrUpdate` lazily invokes `migrate()`.
- `ensureMigrated()` with `None` reads migration history without creating the migration table, acquiring a migration lock, or executing DDL.
- A successful migration or read-only assurance is memoized for that migrator, and concurrent callers share the same in-flight promise.
- A failed migration or assurance clears the in-flight state so a later call can retry.
- `migrate({ dryRun: true })` retains Dumbo's execute-and-rollback behavior and never satisfies or memoizes migration assurance.
- `sql()` and `print()` describe only the supplied component graph. They exclude the migration-history table, locks, and migration-record bookkeeping.

The read-only path compares every expected component migration with recorded migrations. It uses the same migration table and `ignoreMigrationHashMismatch` setting as execution, ignores recorded migrations absent from the component graph, and treats a missing migration table as an empty history without creating it. When expected migrations are missing or hash-mismatched under the active hash settings, `ensureMigrated()` rejects with `PendingMigrationsError`, which contains the pending migrations. It otherwise resolves with no value.

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

Projections and processors expose only their optional declarative `schema` component. They do not expose redundant `migrate()`, `sql()`, `print()`, verification, or `autoMigration` members.

`autoMigration` remains configuration on event-store, consumer, and processor registrations. Its effective value is resolved through the ownership chain; it is not a property required on every schema component.

The public schema methods are backed by the owner's current Dumbo `DatabaseMigrator`. The owner resolves its effective `autoMigration` value and passes it to the migrator; Dumbo implements the automatic migration or read-only assurance behavior once.

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

A projection definition and its declarative component can be reused with different stores and databases, so migration state must never be stored globally on either object. Each storage-bound owner composes its current graph and creates a `DatabaseMigrator` for that graph and inherited storage target.

The migrator owns the in-flight and completed assurance state. Child initialization delegates to the same owner migrator, so a successful parent migration or assurance satisfies later initialization within that graph. When registration changes the graph, the owner composes the new graph and replaces its current migrator. The new migrator checks the complete plan on first use; recorded migrations are skipped and new migrations are applied or reported as pending according to `autoMigration`.

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
- `None` prevents automatic migration, migration-table creation, and migration-lock acquisition. `ensureMigrated()` instead reads the existing migration history and throws a typed pending-migrations error when the effective graph has not been applied.
- An explicit `schema.migrate()` still runs under `None`.

Automatic migration triggers remain consistent with current event-store behavior:

- An inline projection is covered by the event store's lazy `ensureMigrated()` call before the first store operation. Projection handling itself never invokes initialization per event or batch.
- A consumer calls `ensureMigrated()` for its effective graph during initialization/start.
- A processor with separate storage calls its own migrator's `ensureMigrated()` during initialization.

## Projection and processor initialization

Schema composition and lifecycle initialization are coordinated but are not the same operation.

- Built-in Pongo projections expose collection migrations through their schema component instead of unconditionally starting a nested `collection.schema.migrate()` call.
- Initialization delegates to the storage-bound owner's `ensureMigrated()` rather than calling child migration methods.
- With effective `CreateOrUpdate`, the owner migrator lazily applies pending migrations.
- With effective `None`, the owner migrator performs the read-only migration-history check and throws when migrations are pending.
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

`ensureMigrated()` is the single automatic schema entry point. It does not need a separate validation method or result object:

```ts
await schema.ensureMigrated();
```

With `autoMigration: 'None'`, this call reads the configured migration table without creating it or any other database object. It compares expected migrations from the effective graph with recorded migrations, uses the configured hash-ignore behavior, and ignores historical records absent from the graph. A missing migration table makes every expected migration pending. If anything is pending, the call throws `PendingMigrationsError` with the pending migration list; otherwise it resolves and memoizes success.

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

With `autoMigration: 'None'`, this reads migration history only and throws the typed pending-migrations error when necessary. It does not behave like `dryRun` and does not require DDL privileges.

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

### Dumbo

- Add the immutable `DatabaseMigrator` type and `databaseMigrator(...)` module-pattern factory.
- Accept an `AnySchemaComponent`, concrete Dumbo pool, resolved `MigrationStyle`, migration-table configuration, and existing migrator defaults.
- Expose `component`, `sql()`, `print()`, `migrate()`, and `ensureMigrated()`.
- Implement `CreateOrUpdate` assurance by delegating to the existing `runSQLMigrations()` behavior.
- Implement `None` assurance as a read-only comparison against recorded migration history.
- Add `PendingMigrationsError` containing the pending `SQLMigration` values.
- Reuse the existing hash calculation, `ignoreMigrationHashMismatch`, migration-table naming, timeout, executor, SQL formatting, and migration result types.
- Treat a missing migration table as an empty history without creating it.
- Memoize successful migration or assurance and share concurrent calls; clear state after failure and never memoize dry runs.
- Keep `SchemaComponent`, `AnySchemaComponent`, `runSQLMigrations()`, and current `dryRun` behavior unchanged.
- Ensure `sql()` and `print()` describe component migrations only, excluding migrator bookkeeping.

If Dumbo cannot land first, use a temporary local structural fixture for compile-time work and a local migrator adapter for integration work. Do not publish an Emmett-specific schema wrapper; remove the adapter when the Dumbo version is updated.

### Pongo

- Construct one `DatabaseMigrator` for each `PongoDb` from the database component, pool, migration table, effective `autoMigration`, and migration defaults.
- Make `PongoDb.schema` expose the common `component`, `sql`, `print`, `migrate`, and `ensureMigrated` capabilities while retaining Pongo-specific `migrations` and `renameCollection()` members.
- Keep database-wide migration as the documented and supported operational boundary.
- Make normal database and collection operations call the database migrator's memoized `ensureMigrated()`.
- When a collection changes the database component graph, compose the new graph and replace the database's current immutable migrator.
- Remove `collection.schema.migrate()` in this beta. Keep `collection.schema.component` as the declarative contribution used by Emmett and other parents.
- Preserve Pongo's root `CreateOrUpdate` default and explicit `None` configuration while delegating their behavior to Dumbo.
- Add PostgreSQL, sqlite3, D1, and Durable Object coverage for the common migrator behavior.

### PostgreSQL

- Extract the current event-store migration array into an event-store schema component in `src/packages/emmett-postgresql/src/eventStore/schema/migrations/`.
- Update `src/packages/emmett-postgresql/src/eventStore/postgreSQLEventStore.ts` to:
  - Accept and retain both inline and async projection registrations.
  - Compose both kinds of schema-aware projection components.
  - Run one migration plan.
  - Initialize both registration kinds once.
  - Pass async projection definitions to created consumers when `processors` is omitted.
  - Create and expose the current composed `DatabaseMigrator` through the existing event-store schema object.
  - Replace the migrator if the registered component graph changes.
- Update `src/packages/emmett-postgresql/src/eventStore/consumers/postgreSQLEventStoreConsumer.ts` to:
  - Resolve inherited `autoMigration`.
  - Build a consumer schema from the parent/local component and same-pool processor components.
  - Create a `DatabaseMigrator` with the effective policy and expose `component`, `sql`, `print`, `migrate`, and `ensureMigrated`.
  - Replace the migrator when processor registration changes the component graph.
- Update `src/packages/emmett-postgresql/src/eventStore/consumers/postgreSQLProcessor.ts` to:
  - Bind schema-aware processors to inherited or owned storage.
  - Apply policy inheritance and overrides.
  - Avoid nested/repeated migration after a successful parent bundle.
- Update `src/packages/emmett-postgresql/src/eventStore/projections/postgreSQLProjection.ts` to use the supplied registration type instead of hardcoding `async`.
- Update Pongo projection factories under `src/packages/emmett-postgresql/src/eventStore/projections/pongo/` to expose collection schema components and remove their dependency on `collection.schema.migrate()`.

### SQLite

- Extract the current event-store migration array into an event-store schema component in `src/packages/emmett-sqlite/src/eventStore/schema/migrations/`.
- Update `src/packages/emmett-sqlite/src/eventStore/SQLiteEventStore.ts` with the same composition, policy, async registration, and schema API behavior as PostgreSQL.
- Update `src/packages/emmett-sqlite/src/eventStore/consumers/sqliteEventStoreConsumer.ts` and `sqliteProcessor.ts` with the same `DatabaseMigrator`, replacement, consumer, and processor behavior.
- Correct inline projection initialization to use `registrationType: 'inline'`.
- Update Pongo projection factories under `src/packages/emmett-sqlite/src/eventStore/projections/pongo/` to contribute collection schema components without calling the removed collection migration API.
- Apply the behavior to sqlite3, D1, and Durable Object driver variants through shared code, with driver-specific integration coverage.

### Documentation

- Document declarative schema components separately from the storage-bound event-store and consumer schema operations in both package READMEs and `src/docs`.
- Document `PongoDb.schema` as Pongo's sole operational migration boundary and `collection.schema.component` as declarative only.
- Add a Pongo beta migration note replacing `collection.schema.migrate()` with `db.schema.migrate()`.
- Explain `autoMigration` inheritance and explicit overrides.
- Explain `ensureMigrated()` behavior under `CreateOrUpdate` and `None`, and distinguish the read-only `None` path from `dryRun`.
- Show one-call provisioning for inline and async projections.
- Show the omitted-versus-provided `processors` behavior.
- State that independently configured processor storage is not included in the parent bundle.

## Test-first implementation order

The order below follows real dependencies and starts with isolated quick wins. Each item begins with a failing test and ends with the smallest implementation needed to pass it; it is not a set of release phases. Dumbo and Pongo work can proceed in parallel with the independent Emmett core fixes, using local structural fixtures and a temporary migrator adapter until updated packages are available.

1. Add core unit tests proving `projections.async()` returns `type: 'async'` with the correct TypeScript registration type, then correct the helper.
2. Add core consumer tests for automatically seeded processors, explicit `processors: []`, and replacement of an automatic processor by explicit registration with the same ID, then implement the registry behavior without changing unrelated lifecycle behavior.
3. Add PostgreSQL and SQLite tests that expose the current registration-type errors: PostgreSQL must persist the supplied inline/async type, and SQLite inline initialization must receive `inline`. Fix those two localized defects.
4. In Dumbo, add unit and type tests for `DatabaseMigrator`: it retains the supplied component, renders and prints only component SQL, and explicit `migrate()` delegates once to the existing runner with the configured database and migration table. Implement the module-pattern factory without changing `SchemaComponent` or `runSQLMigrations()`.
5. Add Dumbo tests for `ensureMigrated()` under `CreateOrUpdate`: lazy execution, concurrent-call sharing, successful memoization, retry after failure, explicit migration under `None`, and dry runs that always execute but never satisfy assurance. Implement the state machine inside the immutable migrator.
6. Add Dumbo PostgreSQL and SQLite tests for `ensureMigrated()` under `None`: all migrations present, missing migration, hash mismatch, ignored hash mismatch, extra historical rows, missing migration table, `PendingMigrationsError` contents, and no DDL or lock acquisition. Implement the read-only history comparison by reusing migrator hashing and options.
7. Add Pongo API tests proving `PongoDb.schema` exposes the shared migrator capabilities plus existing Pongo-specific members, while `collection.schema` exposes only `component`. Remove `collection.schema.migrate()` and route explicit database migration through the Dumbo migrator.
8. Add Pongo lifecycle tests proving normal operations call memoized `ensureMigrated()`, `None` performs the read-only check, a newly registered collection replaces the immutable migrator, and the new migrator observes the expanded graph. Run the shared behavior against PostgreSQL, sqlite3, D1, and Durable Object drivers.
9. Add Emmett compile-time tests for the new projection and processor schema generics using a structural `AnySchemaComponent` fixture. Add composition tests proving existing Dumbo components remain unchanged and are bound only when collected by a storage owner; do not publish an Emmett-specific wrapper or add driver metadata to Dumbo components.
10. Add PostgreSQL schema tests proving the event-store migration component produces the same SQL migrations as the current array. Extract the component while keeping existing `schema.sql()` and `schema.migrate()` tests green.
11. Repeat the same component-equivalence test and extraction for shared SQLite schema code before testing individual SQLite drivers.
12. Add Pongo projection tests proving each built-in projection exposes the expected collection component without opening a migration transaction or calling the removed collection migration API. Refactor the PostgreSQL and SQLite Pongo factories to use that component.
13. Add PostgreSQL integration tests showing one `eventStore.schema.migrate()` creates the event store plus inline and async Pongo projection tables through one migration runner and one transaction. Implement event-store component composition and create its `DatabaseMigrator`.
14. Add equivalent SQLite integration tests in shared suites and run them against sqlite3, D1, and Durable Object variants. Implement shared SQLite composition rather than duplicating it per driver.
15. Add tests for the API boundary: projections and processors expose only a declarative component, while Pongo databases, event stores, and consumers expose `component`, `sql`, `print`, `migrate`, and `ensureMigrated`. Assert that every storage-bound operation describes the same effective graph and that registration recreates the owner's immutable migrator.
16. Add policy tests for root `CreateOrUpdate`, inherited `None`, child override to `CreateOrUpdate`, child override to `None`, explicit migration under `None`, and independently configured processor storage. Implement effective-policy resolution once in Emmett core and pass the result to each relational `DatabaseMigrator`.
17. Add initialization tests proving a successful parent migration or assurance satisfies later initialization on the same migrator, consumer start does not repeat it, inline handling never assures per event, graph replacement triggers a new assurance, and separate-storage processors initialize independently.
18. Add event-store consumer tests showing omitted `processors` creates projectors for async definitions with default settings, an explicit array suppresses defaults, and an explicit same-ID registration replaces an automatic projector.
19. Add least-privilege PostgreSQL integration coverage: migrate with a migration role, then start an event store and consumer with `autoMigration: 'None'` under a role with read access but no schema `CREATE`; assert that `ensureMigrated()` succeeds without DDL, migration-table creation, or lock acquisition. Add the pending-schema variant and assert the typed error identifies pending migrations.
20. Add regression tests confirming `dryRun` still executes transactionally and rolls back, and that it does not satisfy parent or child migrators.
21. Update documentation from the tested public examples, then run formatting/type checks and the smallest affected Dumbo, Pongo, PostgreSQL, and SQLite integration suites before the repository-wide unit and full test commands required for application-code completion.

## Acceptance criteria

- A PostgreSQL or SQLite event store with inline and async Pongo projections can create every required table through one `eventStore.schema.migrate()` call.
- The composed migration uses one Dumbo runner invocation, one configured migration table, and one transaction.
- Dumbo exposes an immutable `DatabaseMigrator` created by `databaseMigrator(...)` without changing the storage-agnostic component model.
- `DatabaseMigrator` exposes `component`, `sql`, `print`, `migrate`, and `ensureMigrated` and is reused by Pongo and Emmett storage owners.
- `ensureMigrated()` under `CreateOrUpdate` applies migrations lazily; under `None` it performs a read-only history check and throws a typed error containing pending migrations.
- Successful migration or assurance is memoized per migrator, concurrent calls share work, failures can retry, and dry runs never satisfy assurance.
- Changing an owner's component graph recreates its immutable migrator, whose next assurance observes the new graph.
- `DatabaseMigrator.sql()` and `print()` exclude migration-history and lock bookkeeping.
- A projection or processor contributes only a storage-agnostic Dumbo schema component; it does not expose a second migration facade.
- `eventStore.schema.component` and `consumer.schema.component` expose their complete composed graphs.
- `eventStore.schema.sql()` includes event-store and registered projection migrations in ownership order.
- `PongoDb.schema` is Pongo's database-wide operational migration API and exposes the common migrator capabilities plus its Pongo-specific members.
- `PongoCollection.schema` exposes its component but no longer exposes `migrate()`.
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
- Read-only `ensureMigrated()` ignores extra historical migrations, respects the existing hash-ignore option, treats a missing migration table as all expected migrations pending, and reports pending values through its typed error.
- `dryRun` retains current execute-and-rollback behavior.
- Existing schema-unaware processors continue to initialize and process messages as before.

## Verification commands for implementation

Run focused tests as each behavior is introduced. From `src`, finish application-code work with:

```shell
npm run agent:check
npm run test:unit
npm test
```

Also run the focused PostgreSQL and SQLite integration files added for schema composition, assurance, policy inheritance, async processor defaults, and least-privilege startup. If Dumbo or Pongo changes live in separate repositories, run their complete relevant unit and integration suites before updating Emmett's dependency versions.
