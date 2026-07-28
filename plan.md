# Rebuild Dumbo Schema Composition and Pongo Materialization

## 1. Outcome

Replace the committed schema-feature implementation with a simpler component
model in which Dumbo owns composition, typing, traversal, materialization, and
table DDL, while Pongo declares specialized Dumbo components.

The resulting hierarchy is:

```text
DatabaseComponent
└── DatabaseSchemaComponent
    └── TableComponent
        └── IndexComponent
```

`ExtensionComponent` remains a named composition boundary. Its children
participate in traversal and migration aggregation but are not promoted into
the ownership records above.

All Pongo declarations use the corresponding Dumbo abstraction:

```text
PongoDatabaseComponent   is a specialized DatabaseComponent
PongoSchemaComponent     is a specialized DatabaseSchemaComponent
PongoCollectionComponent is a specialized TableComponent
PongoIndexComponent      is a specialized IndexComponent
```

There must be no Pongo-to-Dumbo conversion API. In particular, do not add
`toTableComponent`, `toDatabaseComponent`, or equivalent adapters.

## 2. Architectural Decisions

### 2.1 Immutable declarations

- Schema factory results are immutable declarations.
- Construction composes children from records; declarations expose no public
  `addComponent`, `addSchema`, `addTable`, `addColumn`, `addIndex`, or
  `addMigration` mutators.
- Driver materialization creates a separate runtime tree of the same concrete
  component kinds.
- Lazily created Pongo collections are registered only in the runtime tree.
- Materialization and runtime registration never mutate a declaration or
  insert resolved names into it.

### 2.2 No public URN system

- Remove component-specific URN types, factories, constants, and exports.
- Remove `schemaComponentKey` from the public component model.
- Do not discriminate component types by parsing strings or calling
  `startsWith`.
- Give each Dumbo component kind an exported `unique symbol` discriminator.
- Give Pongo specializations symbol-backed markers in addition to their Dumbo
  component discriminator.
- Use object identity for cycle detection and traversal deduplication.
- Use record aliases and domain names as keys in ownership/component records.
- Use `SQLMigration.name` as the stable persisted migration identity.
- Detect two distinct migrations with the same name while aggregating a root
  and fail before executing SQL.

### 2.3 Containment resolves and validates child context

- A database may have an optional declared database name.
- A database schema may have optional `schemaName` and `databaseName`
  placement constraints.
- A table may have an optional `databaseSchemaName` placement constraint.
- An index may have optional `databaseSchemaName` and `tableName` placement
  constraints.
- These parent fields are ordinary optional data, not component identity,
  string discriminators, or public generic parameters.
- A parent record is authoritative. Composing a child into a parent produces
  an immutable contextual copy of the same component kind with its resolved
  parent fields populated.
- If an explicit child constraint conflicts with its containing database,
  schema, or table, composition throws instead of moving the child.
- A standalone declaration remains unchanged and can be reused when it has no
  explicit placement constraint.
- Remove default-name sentinels from component declarations.
- Remove all public and internal `Bind*` conditional types and `bind*`
  functions.
- Remove `TableTypeState` and the hidden type-state generic tuple.
- During materialization, resolve an effective context:

```ts
type ComponentContext = Readonly<{
  databaseName: string;
  databaseSchemaName?: string;
  tableName?: string;
}>;
```

- A schema record key supplies the effective name for an unnamed schema.
- If an explicitly named schema is stored under a conflicting record key,
  materialization throws.
- Tables exposed from a contextual schema have their resolved
  `databaseSchemaName`.
- Indexes exposed from a contextual table have their resolved
  `databaseSchemaName` and `tableName`.
- Effective names are also passed to SQL and migration builders through
  context; they are never written back to the original standalone
  declarations.

### 2.4 Keep generics small and meaningful

- `SchemaComponent` must not carry a component-key template-literal generic or
  an arbitrary `AdditionalData` generic.
- `DatabaseComponent` needs only the declared schema record type and, if
  required for literal inference, its name.
- `DatabaseSchemaComponent` needs only the declared table record type and, if
  required, its name.
- `TableComponent` may carry table name, columns, indexes, and a plain optional
  `databaseSchemaName`. Relationship literals can be returned as an
  intersection from the factory instead of occupying another public
  positional generic.
- `IndexComponent` may carry index name, column-name literals, and plain
  optional `databaseSchemaName`/`tableName` placement data. Parent names must
  not become public generic parameters.
- Pongo exposes readable aliases so consumers never write Dumbo's internal
  generic parameters:

```ts
PongoDatabaseComponent<Definition>
PongoSchemaComponent<Collections>
PongoCollectionComponent<Document, Name, Indexes>
PongoIndexComponent<Name>
```

- Use symbol-backed phantom properties only where TypeScript needs to retain
  `Document`; do not store `undefined as unknown as Document` as runtime data.

## 3. Target Public APIs

### 3.1 Dumbo factories and types

Use these canonical names only:

```ts
databaseComponent(...)
databaseSchemaComponent(...)
tableComponent(...)
indexComponent(...)
extensionComponent(...)
```

```ts
DatabaseComponent
DatabaseSchemaComponent
TableComponent
IndexComponent
ExtensionComponent
```

Remove the replaced `*SchemaSchemaComponent`, `FeatureSchemaComponent`,
partial alias names, and deprecated discovery aliases rather than adding
compatibility aliases.

Keep:

```ts
findComponents(root, predicate)
findComponent(root, predicate)
```

Discovery accepts typed predicates. It must not accept component-key prefixes.

### 3.2 Typed component records

Dumbo uses immutable typed records for:

- `DatabaseComponent.schemas`
- `DatabaseComponent.extensions`
- `DatabaseSchemaComponent.tables`
- `DatabaseSchemaComponent.extensions`
- `TableComponent.columns`
- `TableComponent.indexes`
- `ExtensionComponent.components`

Each record:

- Is a null-prototype `Readonly<Record<string, Component>>`.
- Preserves the declared property order.
- Exposes record keys directly as typed readonly aliases.
- Accepts arbitrary domain names, including `entries`, `get`, `size`,
  `constructor`, and `__proto__`.
- Is immutable at runtime; declarations expose no mutation escape hatch.
- Is the authoritative collection of children rather than an alias layer over
  another public collection.

Dynamic lookup uses `record[name]`, membership uses
`Object.hasOwn(record, name)`, and traversal uses `Object.values(record)`.
Component kinds remain symbol-discriminated; record keys are aliases and
domain names, not string component-type discriminators.

Database schemas, schema tables, and extensions are constructed from their
direct records. A database/schema extension record accepts only
`ExtensionComponent` values. Arbitrary components must first be grouped inside
an extension. Extension children do not appear in `.schemas` or `.tables`.

### 3.3 Extensions

```ts
const eventStore = dumboSchema.extension('event-store', {
  eventStore: dumboSchema.schema('event_store', {
    events: dumboSchema.table('events', { columns: { /* ... */ } }),
  }),
  checkpoints: dumboSchema.table('processor_checkpoints', {
    columns: { /* ... */ },
  }),
  readModels: pongoReadModelComponent,
});
```

An extension can be attached to a database:

```ts
dumboSchema.database('app', schemas, { eventStore });
```

or to a database schema:

```ts
dumboSchema.schema('audit', tables, { eventStore });
```

Rules:

- Record keys are stable typed aliases.
- Values may be any Dumbo schema components.
- `DatabaseComponent` and `DatabaseSchemaComponent` both accept an immutable
  extension record directly as their third facade argument.
- That record accepts only `ExtensionComponent` values; it is not a generic
  component/options bag.
- The record is exposed directly as typed `.extensions`, using the same
  immutable-record behavior as `.schemas`, `.tables`, and extension
  `.components`.
- Attaching an extension to a database includes its migrations after the
  database's direct ownership children according to the declared structural
  order.
- Attaching an extension to a database schema includes its migrations within
  that schema's structural position.
- Dumbo makes no ownership-versus-reference distinction.
- A repeated object reference is traversed once.
- Cycles terminate safely.
- Two distinct migrations with the same name fail clearly.
- Extension children are never promoted into ownership records.
- An extension behaves identically as a migration root or nested child.
- Remove visibility, expansion, database-feature, and schema-feature variants.

### 3.4 Pongo definitions

Keep the tagged exclusive database API:

```ts
pongoSchema.db('app', {
  collections: {
    users: pongoSchema.collection<User>('users'),
  },
});
```

```ts
pongoSchema.db('app', {
  schemas: {
    public: pongoSchema.schema({
      users: pongoSchema.collection<User>('users'),
    }),
    audit: pongoSchema.schema('audit', {
      entries: pongoSchema.collection<AuditEntry>('entries'),
    }),
  },
});
```

Because Pongo database and schema declarations are specialized Dumbo
components, both accept the same direct extension record:

```ts
pongoSchema.db(
  'app',
  {
    collections: {
      users: pongoSchema.collection<User>('users'),
    },
  },
  { eventStore },
);

pongoSchema.schema(
  'audit',
  {
    entries: pongoSchema.collection<AuditEntry>('entries'),
  },
  { eventStore },
);
```

Rules:

- Exactly one of `collections` and `schemas` is accepted.
- `pongoSchema.db()` returns a specialized `DatabaseComponent`.
- Pongo database and schema factories forward immutable extension records to
  the corresponding Dumbo component factories, so extensions attach at either
  level without a Pongo-specific extension variant or `{ components: ... }`
  wrapper.
- Collection-only mode contains an unnamed Dumbo schema declaration.
- `pongoSchema.schema(collections)` returns a reusable unnamed specialized
  `DatabaseSchemaComponent`.
- `pongoSchema.schema(name, collections)` returns an explicitly named
  specialized `DatabaseSchemaComponent`.
- A schema record key conflicting with an explicit schema name throws during
  materialization.
- `pongoSchema.collection()` returns a specialized `TableComponent`.
- A Pongo collection declaration accepts an optional
  `databaseSchemaName` placement constraint:

```ts
const entries = pongoSchema.collection<AuditEntry>('entries', {
  databaseSchemaName: 'audit',
});
```

- Placing that collection under schema `audit` is valid; placing it under a
  different schema throws.
- A collection without `databaseSchemaName` inherits the containing schema and
  remains reusable.
- A collection retrieved from a composed/materialized schema always exposes
  its resolved `databaseSchemaName`.
- In collection-only database mode, an explicit `databaseSchemaName` must
  match the resolved default schema. It does not silently route the collection
  into another schema; multiple logical schemas require tagged `schemas` mode.
- `pongoSchema.index()` and its built-in variants return specialized
  `IndexComponent` objects.
- Collection index options accept Pongo index components, not a union of raw
  object definitions and components.
- Remove component detection based on `"schemaComponentKey" in value`.
- Remove parallel `PongoDbSchema`,
  `PongoDatabaseSchemaSchema`, and definition/component wrapper types once all
  consumers use the component types.
- `pongoSchema.client()` remains a typed record of Pongo database components.

### 3.5 Runtime API

Keep:

```ts
db.collection('users', {
  schemaName: 'audit',
  schema: { versioning: /* ... */ },
});

db.schema().collection('users');
db.schema('audit').collection('entries');

db.users;
db.audit.entries;
```

Do not expose:

```ts
db.schemas
db.defaultSchemaName
```

`db.schema` remains one callable accessor with live:

```ts
db.schema.component
db.schema.definition
db.schema.migrations
db.schema.migrate(...)
```

`definition` is the original immutable Pongo database component.
`component` is the driver-materialized runtime database component.

## 4. Detailed Implementation Steps

### Phase 0 — Protect the baseline

1. Confirm the worktree contains only the committed schema-feature change.
2. Record the current unit-test, TypeScript-build, and lint status.
3. Classify current tests:
   - Keep tests that express desired behavior.
   - Rewrite tests asserting URN strings, sentinels, binding wrappers, or
     duplicated definition/component behavior.
   - Remove tests added only to support obsolete aliases or feature variants.
4. Add characterization tests before deleting code for:
   - Migration traversal order.
   - Shared-child deduplication.
   - Cycle termination.
   - Extension non-promotion.
   - Tagged Pongo definitions.
   - Runtime schema scopes.
   - Driver resolution precedence.
   - Custom migration ledgers.

Gate: the retained baseline tests pass before core replacement begins.

### Phase 1 — Replace the Dumbo base component

1. Define symbol discriminators for generic, database, schema, table, column,
   index, and extension components.
2. Redefine `SchemaComponent` without key and additional-data generics.
3. Store immutable local migrations and child entries in the component
   constructor's closure or one internal symbol-backed state. Do not use a
   cross-module `WeakMap` with opaque-leaf fallback.
4. Implement one small immutable null-prototype component-record constructor.
5. Implement recursive migration aggregation:
   - Pre-order: component-local migrations, then children in structural order.
   - `Set<SchemaComponent>` for cycle and shared-reference handling.
   - `Map<migrationName, migration>` for duplicate-name detection.
6. Implement `findComponents` and `findComponent` with typed predicates and
   object-identity cycle handling.
7. Delete:
   - Prefix-based discovery.
   - `filterSchemaComponentsOfType`.
   - `mapSchemaComponentsOfType`.
   - `findSchemaComponentsOfType`.
   - `isSchemaComponentOfType`.
   - `extendSchemaComponent`.
   - All public component URN helpers and template-literal URN types.
8. Ensure a custom component created through Dumbo behaves exactly like a
   built-in component during traversal.

Gate: base-component tests cover empty trees, order, shared references,
cycles, arbitrary domain aliases, runtime immutability, and duplicate migration
names.

### Phase 2 — Rebuild the Dumbo ownership hierarchy

1. Reimplement `DatabaseComponent` from an immutable schema record.
2. Reimplement `DatabaseSchemaComponent` from an immutable table record.
3. Reimplement `TableComponent` from immutable column and index records, with
   optional non-generic `databaseSchemaName` placement data.
4. Reimplement `IndexComponent` with optional non-generic
   `databaseSchemaName` and `tableName` placement data.
5. Make domain records authoritative:
   - `.schemas` comes only from the database's schema record.
   - `.tables` comes only from the schema's table record.
   - `.columns` and `.indexes` come only from the table definition.
6. Give databases and database schemas typed `.extensions` records built from
   direct extension records:
   - Only `ExtensionComponent` values are accepted at these boundaries.
   - Arbitrary components are allowed only inside an extension's
     `.components`.
   - Extension values participate in structural traversal after the direct
     ownership children but never appear in `.schemas` or `.tables`.
7. Implement one recursive contextual-composition helper in Dumbo:
   - Populate `databaseName` on schemas.
   - Populate `databaseSchemaName` on tables.
   - Populate `databaseSchemaName` and `tableName` on indexes.
   - Preserve the original child declaration.
   - Throw on an explicit placement conflict.
8. Implement schema explicit-name validation against the containing record key.
9. Update relationship inference to derive paths from database/schema/table
   records instead of bound child-name generics.
10. Isolate relationship conditional types in the relationship module; they
   must not force parent identity generics onto every component.
11. Remove:
    - Default database/schema/table sentinels from component code.
    - All bind helpers and bind inference types.
    - `tableTypeState`.
    - `databaseKind`, `schemaKind`, `tableKind`, and `indexKind` string
      discriminators used only for runtime type detection.

Gate: type tests prove table/column/relationship inference without passing
parent names through table and index generic arguments, while runtime tests
prove contextual child copies expose their resolved ownership fields.

### Phase 3 — Add Dumbo materialization

1. Add one Dumbo materializer that accepts an immutable component root,
   resolved root context, and an optional migration-enrichment callback:

```ts
materializeSchemaComponent(root, {
  context,
  migrationsFor(component, context),
});
```

2. Preserve the concrete component kind and domain data in the materialized
   result; this is cloning/enrichment, not type conversion.
3. Use a `WeakMap<declaration, materializedComponent>` during recursion so:
   - Shared references remain shared.
   - Cycles remain safe.
   - Migrations are emitted once.
4. Resolve database/schema/table paths while descending.
5. Populate the resolved ownership fields on materialized contextual copies:
   - Schema `databaseName`.
   - Table `databaseSchemaName`.
   - Index `databaseSchemaName` and `tableName`.
6. Keep effective context in internal materialized state and pass it directly
   to migration builders. Do not add parent-name generics back to declarations.
7. Provide an internal runtime-tree editor owned by Dumbo for Pongo:
   - Add an effective schema.
   - Add or replace a table in a schema.
   - Remove a table after drop.
   - Preserve live immutable public records.
   - Replace records atomically when registering or removing runtime children;
     do not mutate a supposedly readonly public collection.
8. Do not expose public mutation methods on schema declarations.

Gate: materializing one declaration into two different database/schema
contexts produces independent runtime trees and leaves the declaration
unchanged.

### Phase 4 — Make Dumbo columns render complete table DDL

1. Add portable Dumbo column types required by Pongo:
   - `Text`.
   - `JSON<Value>`.
   - `Boolean`.
   - Existing bigint and timestamp-with-time-zone support.
2. Render portable types by dialect:
   - PostgreSQL JSON as `JSONB`.
   - SQLite JSON as JSON/TEXT affinity suitable for SQLite JSON functions,
     never BLOB.
   - PostgreSQL Boolean as `BOOLEAN`.
   - SQLite Boolean as its supported integer/boolean representation.
3. Implement a complete `SQL_COLUMN` processor:
   - Identifier.
   - Dialect-rendered type.
   - `PRIMARY KEY`.
   - `NOT NULL`.
   - `UNIQUE`.
   - Literal or SQL-expression default.
4. Correct column default typings so defaults represent column values or SQL
   expressions, not column-type tokens.
5. Add a Dumbo `createTableSQL(table, tableReference)` builder using the
   ordered `table.columns` map.
6. Ensure the same tokenized SQL formats correctly under PostgreSQL, SQLite3,
   and D1 formatters.
7. Add a dialect-neutral current-timestamp expression usable as a column
   default.

Gate: SQL unit tests format a complete representative table correctly for
PostgreSQL and SQLite without handwritten column lists.

### Phase 5 — Rebuild Pongo declarations on Dumbo components

1. Define the fixed `PongoCollectionColumns<Document>` record:

| Column | Logical Dumbo type | Constraints/default |
| --- | --- | --- |
| `_id` | Text | primary key, not null |
| `data` | JSON of `Document` | not null |
| `metadata` | JSON record | not null, default `{}` |
| `_version` | BigInteger | not null, default `1` |
| `_partition` | Text | not null, default `png_global` |
| `_archived` | Boolean | not null, default `false` |
| `_created` | timestamp with time zone | not null, current timestamp |
| `_updated` | timestamp with time zone | not null, current timestamp |

2. Make `pongoSchema.collection()` pass those columns and its optional
   `databaseSchemaName` placement constraint to `tableComponent`.
3. Derive the table primary key from `_id`; remove `[] as never[]`.
4. Store the document type under a Pongo-only unique-symbol phantom field.
5. Define built-in Pongo index strategies with symbols:
   - JSON path.
   - Unique JSON path.
   - JSON document.
   - Custom SQL.
6. Make every Pongo index factory return an `IndexComponent` immediately.
7. Make `pongoSchema.schema()` return a specialized
   `DatabaseSchemaComponent`.
8. Make `pongoSchema.db()` return a specialized `DatabaseComponent`.
9. Represent direct-collection mode with one unnamed schema component.
10. When a collection is composed beneath a named Pongo schema, expose a
    contextual collection component carrying that schema's
    `databaseSchemaName`; never mutate the standalone collection declaration.
11. Validate an explicit collection `databaseSchemaName` against its
    containing schema.
12. In collection-only mode, validate explicit collection placement against
    the resolved default schema rather than auto-routing it.
13. Retain the compile-time and runtime XOR between `collections` and
    `schemas`.
14. Freeze declaration objects and their source records in development tests,
    then verify materialization never writes to them.
15. Remove:
    - Empty Pongo columns/relationships aliases.
    - `document: undefined as unknown as T`.
    - Raw index-definition/component unions.
    - Definition rebinding.
    - `PongoCollectionSchemaComponent` table/index reconstruction.
    - `PongoDatabaseSchemaComponent` naming ambiguity; use
      `PongoDatabaseComponent`.

Gate: a Pongo collection can be inserted directly into a Dumbo schema beside
a regular Dumbo table, and its columns and indexes remain fully typed.

### Phase 6 — Materialize Pongo database components

1. Resolve the effective database and default schema names before
   materialization.
2. Materialize a Pongo database through Dumbo's materializer.
3. Enrich component migrations by visiting symbols:
   - PostgreSQL schema component: create schema migration when required.
   - Pongo table: one create-table migration using Dumbo `createTableSQL`.
   - Pongo index: one driver-specific create-index migration.
4. Do not clone indexes manually in Pongo.
5. Do not flatten table and index migrations in driver functions.
6. Let structural traversal guarantee:
   - Schema creation before tables.
   - Table creation before its indexes.
   - Record order among sibling tables/indexes.
7. Generate migration names from effective logical names, never array
   positions.
8. Preserve released table migration names where they already identify the
   same logical operation. Replace unfinished positional index identities with
   stable index-name identities.
9. Built-in create-index SQL should be idempotent where supported. Custom SQL
   remains responsible for its explicitly supplied statement.

Gate: inspecting a materialized collection shows real columns, one local
table migration, and one migration on each child index.

### Phase 7 — Centralize driver configuration resolution

1. Add a pure resolver in Pongo core returning required internal values:

```ts
type ResolvedPongoDatabaseOptions = {
  databaseName: string;
  defaultSchemaName: string;
  migrationTable?: MigrationTableOptions;
  definition?: PongoDatabaseComponent;
  // remaining resolved connection/runtime options
};
```

2. Resolve database name once in this order:
   1. Per-`db()` request.
   2. Client default.
   3. Explicit name on the selected Pongo database declaration.
   4. Dumbo connection-string/database metadata.
   5. Dumbo driver default database.
   6. Pongo's internal fallback.
3. Do not select the first unnamed database declaration when `db()` has no
   name.
4. A projected typed database getter passes its selected declaration
   explicitly.
5. Resolve default schema once:
   1. Per-`db()` option.
   2. Client default.
   3. Dumbo driver metadata.
   4. Pongo internal fallback.
6. Resolve migration-table configuration:
   1. Individual `migrate()` call.
   2. Resolved database configuration.
   3. Client configuration.
7. Require each Pongo driver to expose its exact Dumbo driver.
8. Change `databaseFactory` to accept resolved required values; remove driver
   non-null assertions and driver-local fallback chains.
9. PostgreSQL-created pools receive the resolved database name.
10. Ambient PostgreSQL pools/clients reject a requested database that differs
    from the connected database.
11. SQLite3 and D1 bind one logical database name per Pongo client and reject
    later switching.

Gate: resolver unit tests cover every precedence edge and drivers contain no
independent database/default-schema fallback.

### Phase 8 — Rebuild runtime registration, caching, and projection

1. Keep the nested cache:

```ts
Map<schemaName, Map<collectionName, PongoCollection>>
```

2. Declared and lazy collections use the same lookup and runtime component
   registration path.
3. A lazy collection:
   - Creates a normal Pongo collection declaration with fixed columns.
   - Materializes it in the selected effective schema.
   - Registers it in the Dumbo-owned runtime tree.
   - Uses the same identity/cache path as a declared collection.
4. A call with runtime overrides remains transient, but every transient
   collection is tracked in a separate set and closed with the database.
5. Construct `db.schema` with `Object.defineProperties`, not `Object.assign`,
   so `component`, `definition`, and `migrations` remain live.
6. Construct typed database, schema, and client properties with descriptors;
   remove nested and client proxies.
7. Validate projected properties using `Reflect.has` against the actual target
   before defining them.
8. Exclude direct database aliases using `keyof PongoDb` at compile time.
9. Use null-prototype schema-scope objects and validate their actual members;
   do not reserve an unrelated hard-coded list.
10. Cache schema-scope objects so repeated property access has stable identity.
11. Ensure two schemas can contain collections with the same physical logical
    collection name while retaining separate cache identities.
12. On rename:
    - Resolve the destination's physical identity through the driver resolver.
    - Execute SQL against the current resolved identity.
    - Rebuild/update the collection SQL builder for the destination.
    - Atomically update the nested cache and runtime component tree.
    - Reject a destination already registered in the same schema.
13. On drop, remove the cached runtime collection/table entry after successful
    SQL execution.

Gate: runtime tests cover live metadata, declared/lazy identity, overrides,
close behavior, rename, drop, and definition immutability.

### Phase 9 — Centralize PostgreSQL and SQLite SQL identities

1. Reuse Dumbo's `ComponentContext` as the one logical input to storage
   resolvers. Do not introduce a Pongo table-identity copy with renamed
   fields. A table resolver validates that `databaseSchemaName` and
   `tableName` are present because it only operates on materialized table
   context.

2. PostgreSQL resolves:
   - Schema-qualified table references.
   - Schema-qualified index references where required.
   - Logical migration identity.
3. Pongo SQLite resolves every physical table and index reference through one
   shared module used by:
   - CRUD SQL builders.
   - Create-table migrations.
   - Create-index migrations.
   - Custom index SQL contexts.
   - Rename.
   - Drop.
4. Native `main` collections remain unprefixed.
5. Reserve `pongo_` for Pongo-mapped SQLite tables and indexes.
6. Use readable labeled boundaries and escape underscores inside logical
   components:

```text
crm.users -> pongo_crm_table_users
a.b_c     -> pongo_a_table_b__c
a_b.c     -> pongo_a__b_table_c
```

7. Indexes append `_index_` and their escaped logical index name. Keep name
   encoding internal. Pongo never decodes physical catalog names back into
   declarations; test observable resolved table/index names and collision
   cases instead of exposing a codec API.
8. Encode tables from `[schemaName, tableName]`.
9. Encode indexes from `[schemaName, tableName, indexName]`.
10. Map indexes because SQLite object names share a global namespace.
11. Keep generic Dumbo SQLite collision validation strict and unchanged;
    Pongo-specific physical mapping belongs only to the Pongo SQLite driver.

Gate: resolver tests prove distinct physical table/index names for
underscores, prefix-like names, dots, quotes, and Unicode.

### Phase 10 — Rebuild index migrations

1. PostgreSQL supports:
   - JSON-path index.
   - Unique JSON-path index.
   - JSON-document GIN index.
   - Custom SQL.
2. SQLite supports:
   - JSON-path index.
   - Unique JSON-path index.
   - JSON-document index.
   - Custom SQL.
3. Each index component owns exactly one materialized create-index migration.
4. Built-in builders use the index strategy symbol, not a string `indexKind`.
5. Custom SQL receives:

```ts
type IndexSQLContext = {
  databaseName: string;
  databaseSchemaName: string;
  tableName: string;
  indexName: string;
  tableReference: SQL;
  indexReference: SQL;
};
```

6. Logical names remain logical even when SQLite references are mapped.
7. Index migration names include schema, table, and index names, but not
   numeric position.
8. Validate duplicate logical index names before materialization.

Gate: SQL unit tests cover every built-in/custom form and actual integration
tests verify the indexes exist after repeat migrations.

### Phase 11 — Finish migration-ledger configuration

Keep one API:

```ts
migrationTable: {
  schemaName?: string;
  tableName?: string;
}
```

1. Remove legacy bare-component unions.
2. Resolve the ledger configuration once before starting the transaction.
3. Compute one SQL reference from `schemaName` and `tableName`.
4. Use that same reference for:
   - Table creation.
   - Applied-migration reads.
   - Migration inserts.
   - Hash updates.
5. Dumbo creates the configured migration table itself.
6. Default `tableName` to `dmb_migrations`.
7. When PostgreSQL has `schemaName`, create that schema before creating the
   migration table.
8. SQLite accepts absent schema or `main`; reject every other schema before
   executing SQL.
9. Preserve precedence from Phase 7 when Pongo calls the Dumbo migrator.

Gate: custom schema/table ledger integration tests run twice and prove all
operations use the same table.

### Phase 12 — Remove obsolete implementation and normalize naming

Delete or replace:

- Component URN types/factories/constants and `schemaComponentURN`.
- Prefix-based component detection.
- Default-name sentinels in component definitions.
- All bind/rebind helpers and conditional types.
- `TableTypeState`.
- `AdditionalData` component generics.
- WeakMap opaque migration handling.
- `extendSchemaComponent`.
- Extension alias-map patching.
- Pongo empty column/relationship records.
- Pongo table/index reconstruction.
- Hardcoded PostgreSQL and SQLite Pongo create-table column lists.
- Positional index migration identities.
- String index/database/table kind discriminators.
- Definition-versus-component guards.
- Descriptor functions still named `proxy*`.
- Driver non-null assertions for resolved options.

Rename remaining Pongo symbols so they describe their actual role:

```text
PongoDatabaseComponent
PongoSchemaComponent
PongoCollectionComponent
PongoIndexComponent
projectPongoDb
projectPongoClient
```

Run an unused-export search after removal. Do not retain deprecated aliases for
the unfinished names.

## 5. Test Plan

### Dumbo unit and type tests

- Canonical public names and removed exports.
- Typed component-record aliases.
- Arbitrary aliases that overlap object or collection API names.
- Direct ownership records versus arbitrary component children.
- Extension record composition.
- Extension attachment at database and database-schema levels.
- No extension-child promotion.
- Pre-order migration aggregation.
- Shared child migrations exactly once.
- Duplicate migration names fail.
- Cyclic graphs terminate.
- Predicate-based recursive discovery.
- Immutable declarations.
- Materialization into multiple contexts.
- Schema record-key versus explicit-name validation.
- Relationship inference without bound parent generics.
- Full column and create-table rendering for each dialect.

### Pongo type tests

- Tagged XOR rejects neither/both collections and schemas.
- Direct collection mode inference.
- Direct schema-group inference.
- Unnamed and explicitly named reusable schemas.
- Pongo collection assignable to Dumbo `TableComponent`.
- Pongo index assignable to Dumbo `IndexComponent`.
- Document inference from collection components.
- Optional collection `databaseSchemaName` remains a placement constraint and
  does not become a parent-name generic.
- Direct database aliases reject `keyof PongoDb`.
- Schema aliases do not promote collections to the database.
- No empty placeholder generic arguments in exported Pongo types.

### Pongo runtime tests

- Callable default and named schema scopes.
- Direct property projection.
- Live schema component/definition/migrations.
- Default-schema binding at materialization only.
- Contextual collections expose their resolved `databaseSchemaName`.
- Explicit collection/schema placement conflicts throw.
- Collection-only mode rejects, rather than auto-routes, a conflicting
  `databaseSchemaName`.
- Same collection name in two schemas.
- Nested cache identity.
- Lazy collection registration in the runtime tree.
- Transient override collections close correctly.
- Definitions remain frozen and unchanged.
- Projection collisions against real runtime objects.
- Rename updates physical identity, cache, SQL builder, and runtime tree.
- Drop removes runtime registration.

### Driver and SQL tests

- Database/default-schema/migration-table precedence.
- No accidental unnamed-definition selection.
- Exact Dumbo driver requirement.
- PostgreSQL pool receives resolved database.
- Ambient PostgreSQL mismatch.
- SQLite/D1 fixed logical database.
- All PostgreSQL and SQLite table/index SQL forms.
- Custom SQL logical names and resolved references.
- Reversible SQLite table/index names.
- Reserved `pongo_` prefix.
- Native `main` behavior.

### Integration and end-to-end tests

- PostgreSQL named schemas and schema creation order.
- SQLite logical schemas with same collection names.
- Real index creation for all built-in index strategies.
- Custom index SQL.
- Table-before-index migration order.
- Repeat migrations skip cleanly.
- Custom PostgreSQL ledger schema/table.
- Custom SQLite ledger table.
- Lazy collection auto-migration.
- Rename and drop in native and mapped SQLite schemas.

## 6. Verification Sequence

Run checks in this order and stop at the first failure:

1. Dumbo TypeScript build.
2. Dumbo unit tests.
3. Pongo TypeScript build.
4. Pongo unit tests.
5. SQLite unit tests.
6. SQLite integration tests.
7. SQLite end-to-end tests.
8. PostgreSQL unit tests.
9. PostgreSQL integration tests.
10. PostgreSQL end-to-end tests.
11. Root TypeScript build.
12. ESLint without fixes.
13. Prettier check without writes.
14. Dumbo package build.
15. Pongo package build.
16. Bundle/export tests.
17. Final `git diff --check`.
18. Final public-export and obsolete-symbol search.

The final report must list:

- Commands run.
- Passed/failed/skipped suites.
- Any environment-dependent PostgreSQL or D1 suites not executed.
- Remaining compatibility changes.
- Confirmation that the original declarations are unchanged after runtime
  materialization tests.

## 7. Acceptance Criteria

The work is complete only when:

- Pongo collection declarations contain their actual table columns.
- Pongo database, schema, collection, and index declarations are Dumbo
  components from construction onward.
- No public conversion adapter exists.
- No public component URNs or string-prefix type checks remain.
- No parent-name sentinels or bind wrappers remain.
- Contextual schema, table, and index copies expose resolved ownership fields
  without mutating standalone declarations.
- Declarations are immutable and reusable.
- Dumbo materializes resolved context and driver migrations once.
- Dumbo renders Pongo create-table SQL from table columns.
- Table and index migrations follow the structural hierarchy.
- Extensions aggregate migrations without promoting children.
- Extensions attach consistently to both databases and database schemas.
- SQLite logical names are reversible and used by every SQL path.
- Runtime caches, projection, rename, drop, and cleanup are coherent.
- Driver resolution happens exactly once.
- Migration-ledger creation and operations use one resolved reference.
- Full builds, tests, lint, and package builds pass, except explicitly reported
  environment-unavailable suites.

## 8. Assumptions

- Breaking removal of the unfinished component names, URN exports, sentinels,
  bind helpers, and definition wrappers is acceptable.
- The schema-feature branch has not established positional Pongo index
  migration names as a stable compatibility contract.
- Released table migration identities are preserved where their logical
  operation remains unchanged.
- Record keys are typed aliases; physical table names still come from table
  declarations.
- An unnamed schema receives its effective name only from materialization
  context.
- Optional schema/table/index parent fields are placement constraints and
  resolved contextual data, not component identity or generic parameters.
- Extension children remain intentionally hidden from database/schema
  ownership records.
- SQLite logical-schema portability justifies Pongo-specific physical mapping,
  but generic Dumbo SQLite behavior remains strict.
- PostgreSQL and SQLite dialect differences belong in Dumbo's SQL/column
  abstractions; Pongo owns only document-table semantics and JSON index
  strategies.
