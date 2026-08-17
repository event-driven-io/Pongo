# No-Scope Pongo Simplification Plan

## Objective

Preserve Pongo's strongly typed property access and developer experience:

```ts
client.app;
db.users;
db.crm.customers;
```

while removing the duplicate schema-scope runtime API and making the Dumbo
`DatabaseComponent` the only schema/table declaration state owned by a Pongo
database.

The resulting design must have:

- one immutable Dumbo database component as the complete declaration tree;
- one evolving component reference per live Pongo database;
- one runtime cache of live `PongoCollection` objects;
- one lazy runtime view reading statically declared collections and schemas
  directly from that component;
- no `PongoSchemaScope`, callable schema accessor, Pongo schema overlay, or
  collection-level placement metadata;
- an XOR `collections` or `schemas` input for `pongoSchema.db`, with later
  coexistence expressed through `DatabaseComponent.withSchema/withTable`;
- no exported standalone projection functions or property installers;
- no generated/custom migration duplication.

This document is an implementation plan. It does not authorize source changes
by itself.

## Target Usage

### Unified Pongo declaration

`collections` represents tables in the database's logical default schema.
`schemas` represents named Dumbo database schemas. `pongoSchema.db` accepts
exactly one of them; immutable component operations compose both afterward.

```ts
const app = pongoSchema
  .db('app', {
    collections: {
      users: pongoSchema.collection<User>('users'),
    },
  })
  .withSchema({
    crm: pongoSchema.schema('crm', {
      customers: pongoSchema.collection<Customer>('customers'),
    }),
    audit: pongoSchema.schema('audit', {
      entries: pongoSchema.collection<AuditEntry>('entries'),
    }),
  });
```

The returned value is an ordinary typed Dumbo `DatabaseComponent`:

```ts
app.tables.users;
app.schemas.crm.tables.customers;
app.schemas.audit.tables.entries;
```

There is no separate `app.collections` declaration copy.

### Typed runtime access

Declared aliases remain directly accessible and strongly typed:

```ts
const client = pongoClient({
  driver,
  schema: {
    definition: pongoSchema.client({ app }),
  },
});

client.app.users;          // PongoCollection<User>
client.app.crm.customers; // PongoCollection<Customer>
client.app.audit.entries; // PongoCollection<AuditEntry>
```

Default collections and named schemas can coexist on the same database object.

Dynamic access remains explicit and typed by the caller:

```ts
db.collection<Session>('sessions');
db.collection<Lead>('leads', { databaseSchemaName: 'crm' });
```

Dynamic additions update `db.schema.component` and migrations but do not add
new statically typed properties.

### Database schema operations

`db.schema` is a plain object, not a callable function:

```ts
db.schema.component;
db.schema.migrations;
await db.schema.migrate();
```

Named collection placement uses the existing explicit operation:

```ts
db.collection('users', { databaseSchemaName: 'crm' });
```

There is no replacement wrapper for `db.schema('crm')`. Per-schema wrapper
identity and wrapper caching disappear together with that API.

## Ownership Boundaries

### Dumbo owns

- the database's default schema, direct tables, named schemas, and extensions;
- schema/table placement;
- physical table lookup through `findTable` and `findTables`;
- immutable updates through `withTable` and `withSchema`;
- schema creation and component migration traversal;
- validation of component structure and physical declarations.

### Pongo owns

- recognizing whether a Dumbo table is a Pongo collection;
- creating a Pongo collection component after a physical lookup miss;
- replacing its current database component through `withTable`;
- constructing and caching live `PongoCollection` instances;
- binding declared Pongo aliases to live collections;
- validating names that collide specifically on the projected Pongo API;
- running the current component's migrations against its pool.

Dumbo must not construct or cache `PongoCollection` objects. They require a
live database, pool, SQL builder, serializer, cache, errors, and runtime schema
options and therefore belong to Pongo.

## Target Data Model

### Collection component

Remove `databaseSchemaName` from `PongoCollectionComponent` and from
`pongoSchema.collection` options.

Target conceptual type:

```ts
type PongoCollectionComponent<
  Document extends PongoDocument,
  Name extends string,
  Indexes extends PongoCollectionIndexes,
> = TableComponent<PongoCollectionColumns<Document>, Name, Indexes> &
  Readonly<{
    [pongoCollectionComponentType]: true;
  }>;
```

A collection component describes a table. Its containing
`DatabaseSchemaComponent` describes its placement. A reusable collection can be
placed in different schemas without cloning it or changing metadata on it.

### Database declaration

Keep the high-level declaration input as an XOR:

```ts
type PongoDatabaseDefinition<Collections, Schemas> =
  | Readonly<{ collections: Collections; schemas?: never }>
  | Readonly<{ collections?: never; schemas: Schemas }>;
```

Both generic records default to an empty readonly record. Compose the returned
standard database component when both placements are needed:

```ts
pongoSchema.db({ collections: { users } });
pongoSchema.db({ schemas: { crm } });
pongoSchema.db({ collections: {} });

const mixed = pongoSchema
  .db({ collections: { users } })
  .withSchema({ crm });
```

`pongoSchema.db` delegates directly to Dumbo:

```ts
databaseComponent({
  databaseName,
  tables: 'collections' in definition ? definition.collections : undefined,
  schemas: 'schemas' in definition ? definition.schemas : undefined,
  extensions,
});
```

The returned Pongo database declaration must retain the exact table, schema,
extension, and database-name generic arguments of that `DatabaseComponent`.
Do not add a marker, duplicate declaration record, owner map, or normalized
Pongo-only tree.

Collapse the surrounding public types accordingly:

```ts
type PongoDatabaseComponent<
  Collections extends PongoDatabaseCollections,
  Schemas extends PongoDatabaseSchemas,
  Name extends string | undefined,
  Extensions extends DatabaseExtensions,
> = DatabaseComponent<Name, Collections, Schemas, Extensions>;

type PongoDbSchema = AnyDatabaseComponent;
```

Generic APIs that need to preserve a concrete definition continue using
`Definition extends AnyDatabaseComponent`; they must not widen the actual
argument before deriving projected properties. Update `PongoClientSchema` so
its database record contains Dumbo database components directly.

Delete the old `PongoDatabaseShape`, the two mode-specific definition types,
and the union-based `PongoDbSchema`. Do not retain a nominal intersection such
as `& Readonly<object>` when it adds no information.

### Database schema input

Pongo continues accepting a plain Dumbo `AnyDatabaseComponent`. Projection
typing and runtime binding select only direct tables satisfying
`PongoCollectionComponent`; ordinary relational tables remain part of the
Dumbo component but are not exposed as Pongo properties.

## Static Type Projection

Replace mode-based conditional types with direct mapping from the standard
Dumbo component fields.

### Default collections

Map direct `Definition['tables']` entries whose values extend
`PongoCollectionComponent`:

```ts
type DeclaredPongoCollections<Tables> = {
  [Alias in keyof Tables as Tables[Alias] extends PongoCollectionComponent
    ? Exclude<Alias, keyof PongoDb>
    : never]: Tables[Alias] extends PongoCollectionComponent<infer Document>
    ? PongoCollection<Document>
    : never;
};
```

Use the existing row/document inference if it is more precise than inferring
the component's document generic directly. Keep this as a type-only mapping;
do not add runtime descriptors or wrapper types to the component itself.

### Named schemas

Map each direct schema to a plain object containing only its direct Pongo table
aliases:

```ts
type DeclaredPongoSchemas<Schemas> = {
  [SchemaAlias in keyof Schemas as HasPongoCollections<
    Schemas[SchemaAlias]['tables']
  > extends true
    ? Exclude<SchemaAlias, keyof PongoDb>
    : never]: DeclaredPongoCollections<Schemas[SchemaAlias]['tables']>;
};
```

Schemas with no directly declared Pongo collections are not projected. This
keeps plain relational Dumbo schemas off the Pongo runtime API and keeps runtime
and static behavior aligned. Extension-contributed tables remain discoverable
through `db.collection(...)`, as they are today, but are not promoted to static
properties.

### Database projection type

The projected database type becomes an unconditional intersection:

```ts
type PongoDbWithSchema<Definition extends AnyDatabaseComponent> =
  PongoDb &
  DeclaredPongoCollections<Definition['tables']> &
  DeclaredPongoSchemas<Definition['schemas']>;
```

Remove the conditional checks for a Pongo-only `collections` or `schemas`
field. Update client database maps to use this unified type.

### Collision typing

Continue excluding database API member names from projected keys. Runtime must
also reject collisions rather than silently hiding a collection or schema.
Type exclusion alone is not sufficient because JavaScript callers and widened
records can bypass literal inference.

## Runtime Component View

Strong property access is a lazy runtime view over the immutable Dumbo
component supplied when the database is created. Use the same proxy pattern as
the established Pongo client/database implementation on `main`, updated to read
the Dumbo component fields directly.

### Database construction

`PongoDatabase` constructs its regular database API and returns one canonical
`Proxy` around it. The proxy is the database value captured by collection and
transaction operations; do not keep a separately observable raw database
instance.

The proxy `get` behavior is intentionally narrow:

1. Preserve regular `PongoDb` API members.
2. For a string key matching a direct entry in the initial component's
   `tables`, return `db.collection(table.tableName)` only when that table is a
   Pongo collection component.
3. For a string key matching a direct named schema containing Pongo
   collections, return that schema's stable collection-property view.
4. Return `undefined` for unknown declaration keys.

Use ordinary property access. Do not use `Reflect`, property descriptor maps,
`Object.defineProperty`, `ownKeys`, a generic traversal framework, or an
accessor-installation pass.

The proxy reads the initial component for statically declared property access.
Dynamic additions update the current component but remain available only
through `db.collection(...)`, matching their static typing.

### Named schema views

Create one stable proxy view for each directly declared named schema that has a
direct Pongo collection. Its `get` handler reads only `schema.tables[alias]` and
resolves matching Pongo tables through `db.collection(table.tableName, {
databaseSchemaName })`.

These values are the required runtime representation of paths such as
`db.crm.users`; they expose no schema operations, component, migrations, or
collection-list API. They are not schema scopes or handles. Keeping each view
once is required by the public identity contract `db.crm === db.crm`.

When a direct schema uses `SQLDefaultSchemaNameToken`, pass no explicit schema
name to `db.collection`. A literal schema name is passed unchanged.

Do not promise descriptor-level behavior such as enumerating declared aliases
with `Object.keys` or freezing the schema view. Typed property access, correct
resolution, and stable identity are the contract.

### Client construction

`pongoClient` uses the same narrow pattern: return one proxy whose string-key
lookup reads `clientSchema.dbs` and resolves a declared alias through the
existing database cache. Do not install database accessors or export a client
projection helper.

### Why this is not another runtime model

The proxy owns no declaration copy, component state, migration state, or live
collection cache. Static types and runtime lookups both read the same fields:

```text
Definition.tables
Definition.schemas[key].tables
```

The only additional retained values are the stable named-schema property views
required by `db.crm === db.crm`. There is no parallel database/schema instance
tree.

## Pongo Database Runtime

### Current component

Keep one evolving reference:

```ts
const initialComponent =
  options.schema?.definition ?? databaseComponent({});
let component: AnyDatabaseComponent = initialComponent;
```

Use `initialComponent` for statically declared proxy access. Use `component`
for all current lookup, migration, and schema inspection behavior.

Do not use `pongoSchema.db(...)` to manufacture an empty runtime definition;
the empty value can be a direct Dumbo `databaseComponent({})`.

### Collection component resolution

Keep one cohesive local operation, named by behavior such as
`getOrAddCollectionComponent`:

1. Resolve the physical schema as the requested schema or configured default.
2. Call Dumbo `findTable(component, context)` with the configured default.
3. If found, require `isPongoCollectionComponent` and return it.
4. If not found, ensure insertion will not overwrite an existing record alias
   that points at another physical table.
5. Create `pongoSchema.collection<Document>(collectionName)` with no placement
   option.
6. Replace the current component with default or named
   `component.withTable(...)`.
7. Return the created component and physical identifier.

Dumbo remains responsible for missing named schema creation through
`DatabaseComponent.withTable(tables, schemaName)`.

The alias-overwrite guard remains Pongo-owned while `withTable` is an upsert.
Without it, `db.collection('customerDirectory')` could silently replace a
declared alias `customerDirectory` that refers to physical table `users`.

### Live collection cache

Keep the runtime cache of `PongoCollection` instances. It represents live
objects, not schema declarations, and is not replaced by Dumbo components.

Preserve these behaviors:

- repeated default collection access returns one instance;
- repeated named collection access returns one instance;
- configured-default access and explicit access to that same physical schema
  share the expected instance;
- different physical schemas can contain collections with the same name;
- runtime cache/error/schema overrides intentionally create an uncached runtime
  collection;
- `db.collections()` and database close operate over all cached live
  collections.

Do not combine the cache with declared accessor objects or component maps.

### Plain schema property

Replace `PongoSchemaAccessor` with a named, non-callable public contract:

```ts
interface PongoDatabaseSchema {
  readonly component: AnyDatabaseComponent;
  readonly migrations: ReadonlyArray<SQLMigration>;
  migrate(options?: PongoMigrationOptions): Promise<RunSQLMigrationsResult>;
}
```

Use the same treatment for the collection-level schema property through a
named `PongoCollectionSchema` contract. These interfaces name existing public
objects; they do not add factories, state, wrappers, or a second component
tree.

Do not reintroduce `main`'s mutable `PongoDatabaseSchemaComponent`. Its
collection list and mutable definition would duplicate the Dumbo database
component that now owns schema and table composition. `PongoDatabaseComponent`
continues to mean the typed Pongo specialization of Dumbo's declaration
component.

Construct one plain object with getters for the current component and current
migrations. Reuse one local `currentMigrations()` function in both the getter
and `migrate()` so configured-default context construction is not duplicated.

Delete:

- `PongoSchemaScope`;
- the callable part of `PongoSchemaAccessor`;
- `defaultSchemaHandle`;
- `schemaHandles`;
- `schemaHandle`;
- the function cast and `Object.defineProperties` used to decorate it.

## Client Declared Databases

Preserve strongly typed database aliases such as `client.app`. The client proxy
reads the declared database directly from `clientSchema.dbs` and calls
`client.db(database.databaseName ?? alias)`. The existing database cache
preserves identity. Test this only through public client behavior.

## Projection Collision Rules

With default collections and named schemas available together, validate the
single JavaScript property namespace explicitly.

Reject:

- a default collection alias colliding with a `PongoDb` API member;
- a named schema alias colliding with a `PongoDb` API member;
- a default collection alias and named schema alias that are equal;
- a client database alias colliding with a `PongoClient` API member.

Allow:

- the same collection alias in two different named schemas;
- the same physical table name in different physical schemas;
- a default collection and named-schema collection sharing an alias, because
  their property paths are `db.users` and `db.crm.users`;
- ordinary relational tables beside Pongo collections in a plain Dumbo
  component, provided physical Dumbo validation succeeds.

Collision validation belongs in Pongo only when it concerns projected Pongo
properties. Physical schema/table duplication and schema key/name validation
remain in Dumbo.

## Migration Semantics

This is a separate behavior decision but must be corrected before final
verification because the current branch changed it while responding to the
reported index integration failures.

### Recommended rule: local ownership

Every concrete component always retains and traverses its child components.
Supplying custom migrations replaces only that component's generated own
migration:

```text
own migrations = custom migrations ?? generated own migrations
result = own migrations followed by child migrations
```

Consequences:

- custom schema migrations replace generated `CREATE SCHEMA` for that schema;
- tables and extensions declared under that schema still migrate;
- custom table migrations replace generated `CREATE TABLE` for that table;
- declared indexes still migrate afterward;
- custom index migrations replace generated `CREATE INDEX` for that index;
- database and extension custom migrations run before children because those
  components have no generated DDL of their own;
- no `ownsMigrations`, baseline, skip-children context, or additive
  generated-plus-custom special case is introduced.

This resolves the integration failure correctly: the custom table migration
creates the table, and the index child remains enabled. If the index also has a
custom migration, only that custom index migration creates it; Dumbo does not
also emit a redundant generated index migration.

If subtree ownership is desired instead, it must be approved as a different
explicit contract. Do not infer subtree suppression merely from the presence
of a custom callback while simultaneously claiming that child components
compose independently.

## Test-First Implementation Sequence

Each implementation phase starts with usage-named tests that fail for the
missing target behavior. Do not add tests whose purpose is only to prove that
an obsolete internal type or helper was removed.

### Phase 1: Unified Dumbo-backed Pongo declarations

Add or update runtime tests named by usage:

- `database.withSchema exposes default tables and named schemas together`
- `pongoSchema.db({ collections }) stores collections in the default schema`
- `pongoSchema.db({ schemas }) stores named schemas`
- `pongoSchema.db({ collections: {} }) creates an empty database component`
- `a parent Pongo schema determines collection placement`
- `one collection component can be reused in different schemas`

Add or update type tests:

- `database.withSchema preserves default collection and named schema types`
- `a collection component carries document and index types without placement metadata`
- `a Pongo database declaration is assignable to DatabaseComponent`

Then implement:

- XOR declaration options followed by immutable component composition;
- direct `databaseComponent({ tables, schemas })` delegation;
- removal of collection-level `databaseSchemaName`;
- removal of the copied `collections` field and mode-specific database shape.

Update all repository declaration call sites from collection-level placement to
parent schema placement before moving on. Do not preserve a compatibility path
that reconstructs the old flat placement mode.

### Phase 2: Unified static projection types

Add type tests named by public access:

- `db.users is typed from a default declared collection`
- `db.crm.customers is typed from a named declared schema`
- `db exposes default collections and named schemas together`
- `the same alias in two schemas retains each document type`
- `plain Dumbo relational tables are not projected as Pongo collections`
- `schemas without direct Pongo collections are not projected`
- `database API member collisions retain the database API type`

Then replace mode-conditional mappings with mappings over
`DatabaseComponent['tables']` and `DatabaseComponent['schemas']`.

### Phase 3: Component-backed runtime views

Add public database behavior tests:

- `db.users returns the collection declared in the default schema`
- `db.crm.customers returns the collection declared in crm`
- `db exposes default collections and named schemas together`
- `db.crm returns the same declared schema object on repeated access`
- `repeated projected collection access returns the cached collection`
- `two schemas can project the same collection alias independently`
- `a plain Dumbo relational table is not projected`
- `a default collection alias cannot collide with a database API member`
- `a schema alias cannot collide with a database API member`
- `a default collection alias cannot collide with a schema alias`

Then:

- replace exported `projectPongoDb` with the canonical database proxy;
- remove collection-mode/schema-mode branching;
- resolve root and schema aliases directly from the initial Dumbo component;
- filter both default and named tables with
  `isPongoCollectionComponent`;
- create one stable operation-free proxy view per projected named schema;
- remove tests that import `projectPongoDb` directly after equivalent public
  behavior is covered.

### Phase 4: Remove the callable schema scope

Start with usage tests:

- `db.schema.component reflects a dynamically added default collection`
- `db.schema.component reflects a dynamically added named collection`
- `db.schema.migrations includes declared and dynamically added collections`
- `db.schema.migrate runs the current database component migrations`

Add a type test:

- `db.schema exposes component migrations and migrate as a plain object`

Then delete `PongoSchemaScope`, handle caches, callable accessor construction,
and scope-specific tests. Update callers to use `db.collection(name, {
databaseSchemaName })`.

Do not add a test named `does not expose PongoSchemaScope`; the usage tests
define the intended API.

### Phase 5: Keep dynamic registration entirely on Dumbo components

Retain and, where necessary, rename usage tests:

- `db.collection('users') adds users to the default schema component`
- `db.collection('users', { databaseSchemaName: 'crm' }) adds users to crm`
- `two dynamic collections accumulate in one named schema`
- `adding a collection creates its missing named schema`
- `repeated collection access reuses the component and runtime collection`
- `declared collections are reused by physical schema and table name`
- `a relational table cannot be opened as a Pongo collection`
- `a dynamic collection cannot overwrite another table alias`
- `extensions remain searchable without being copied into direct maps`

Then simplify the resolver to `findTable` plus `withTable` and remove any
remaining Pongo-owned schema/table aggregation or migration concatenation.

### Phase 6: Client database properties

Add or retain public usage tests:

- `client.app returns the declared database`
- `client.app returns the same database instance repeatedly`
- `client.app exposes default and named declared collections`
- `a database alias cannot collide with a client API member`

Return one narrow client proxy backed directly by `clientSchema.dbs` and the
existing database cache. Remove direct projection-helper tests and exports;
do not add an accessor installer.

### Phase 7: Correct migration ownership

Before implementation, confirm the local-ownership rule in this plan.

Add or update unit tests:

- `schema custom migrations replace its generated schema migration and keep table children`
- `table custom migrations replace its generated table migration and keep index children`
- `index custom migrations replace its generated index migration`
- `database custom migrations run before its schema children`
- `extension custom migrations run before its table or schema children`
- `withTable preserves custom migration ownership and child traversal`

Update the PostgreSQL and SQLite integration scenario expectations so a custom
table create and custom index create are each recorded once. Verify the index
exists; do not expect an additional generated migration for the same object.

Then implement `custom ?? generated` at schema, table, and index component
factories while always passing children to `schemaComponent`.

### Phase 8: Dead-code and consistency pass

Search for and remove all obsolete concepts:

```bash
rg "PongoSchemaScope|defaultSchemaHandle|schemaHandles|schemaHandle"
rg "projectPongoDb|projectPongoClient"
rg "PongoDbCollectionsDefinition|PongoDbSchemasDefinition"
rg "'collections' in definition|'schemas' in definition"
rg "collection\.databaseSchemaName|PongoCollectionComponent.*databaseSchemaName"
rg "ownsMigrations"
```

Expected results are empty except documentation deliberately describing the
removed design or migration notes that are still being revised in the same
change.

Also verify:

- no standalone projection or property-installer helper remains exported;
- no tests import private runtime view operations;
- no duplicate component tree, owner map, scope map, or migration list exists;
- no mixed `{ collections, schemas }` input bypasses the XOR declaration;
- no type-level projection path differs from runtime direct-table selection;
- no named relational Dumbo table is accidentally exposed as a Pongo
  collection;
- comments describe enduring constraints rather than refactoring history.

## Expected File Areas

Primary Pongo changes:

- `src/packages/pongo/src/core/schema/index.ts`
- `src/packages/pongo/src/core/schema/schema.unit.spec.ts`
- `src/packages/pongo/src/core/schema/schema.type.spec.ts`
- `src/packages/pongo/src/core/database/pongoDb.ts`
- `src/packages/pongo/src/core/database/pongoDb.unit.spec.ts`
- `src/packages/pongo/src/core/typing/operations.ts`
- `src/packages/pongo/src/core/pongoClient.ts`
- `src/packages/pongo/src/core/pongoClient.unit.spec.ts`
- declaration call sites in Pongo storage tests, E2E tests, samples, and CLI
  configuration tests.

Migration-semantic changes, after approval:

- `src/packages/dumbo/src/core/schema/components/databaseSchemaComponent.ts`
- `src/packages/dumbo/src/core/schema/components/tableComponent.ts`
- `src/packages/dumbo/src/core/schema/components/indexComponent.ts`
- `src/packages/dumbo/src/core/schema/components/componentMigrations.unit.spec.ts`
- `src/packages/dumbo/src/core/schema/schemaComponent.unit.spec.ts`
- PostgreSQL and SQLite migration integration tests.

Avoid changing unrelated SQL builders, drivers, collection operations, or
serialization code unless a compile error demonstrates a direct dependency on
the removed declaration shape.

## Verification

Run focused tests after each phase, then run repository-wide checks from
`src` as requested:

```bash
cd src
npm run build:ts
npm run fix
```

After formatting fixes, rerun `npm run build:ts` to ensure the formatter did not
hide a type failure. Run the focused Pongo schema/database/client tests and
Dumbo component migration tests, followed by the relevant PostgreSQL and
SQLite migration integrations.

The final verification must prove:

- default and named declared collections are simultaneously strongly typed;
- runtime property paths match those types;
- projected schema objects and collections have stable identity;
- dynamic collections update only the current Dumbo component and runtime
  cache;
- source declarations remain unchanged and reusable;
- configured default schemas still resolve consistently for lookup,
  migrations, and CRUD SQL;
- no generated/custom DDL duplication remains under the approved migration
  rule;
- no dead scope, mode, projection-export, or placement metadata remains.

## Completion Criteria

The work is complete only when:

1. `pongoSchema.db` accepts exactly one of default collections or named schemas,
   and `withSchema`/`withTable` composes the other placement afterward.
2. Its result is one ordinary Dumbo `DatabaseComponent` with exact inferred
   `tables` and `schemas` records.
3. `db.users` and `db.crm.users` are both statically typed and work at runtime.
4. `PongoSchemaScope` and the callable schema accessor are gone.
5. `db.schema` implements the named `PongoDatabaseSchema` contract as a plain
   current-component and migration object.
6. Collection components no longer carry database-schema placement.
7. Pongo dynamic registration is `findTable` plus `component.withTable`.
8. Runtime live-collection caches remain the sole non-component collection
   state.
9. Database and client proxies read declaration components directly and are
   tested only through public behavior.
10. The approved migration ownership rule is covered by unit and integration
    tests.
11. Global TypeScript build and formatting checks pass from `src`.
12. Searches confirm that no obsolete scope, mixed-input mode, exported
    projection, or placement compatibility code remains.
