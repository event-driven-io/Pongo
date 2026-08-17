# Spec: simplified schema component model

Branch: `schema_features`
Status: implemented, including immutable growth, component-owned lookup, and
Pongo runtime encapsulation

This document describes the model that the current branch implements. It
replaces the older parent-pointer and second-migration-traversal designs.

## Goal

Schema components are immutable values. A table, schema, extension, or database
component does not learn where it is placed by being attached to a parent.
Placement is passed downward when migrations are read. `withTable` and
`withSchema` rebuild containing schema/database values without mutating the
reusable declarations supplied by the caller.

There is one migration traversal:

```ts
component.migrations(context?)
```

Each component contributes only the context it owns:

- a database schema contributes `databaseSchemaName`;
- a table contributes `tableName`;
- database, extension, column, and index components use the parent context as
  received, except that an index requires table context before it can create DDL.

The model is intentionally smaller than the previous branch. There are no parent
pointers, runtime overlays, fallback migration-name readers, aliases for deleted
APIs, monkey patches, or casts used to hide broken inference.

## Base Component

`schemaComponent(kind, { components, context, migrations })` is the shared base.
It returns only:

```ts
type SchemaComponent<Kind> = Readonly<{
  [schemaComponentType]: Kind;
  migrations(context?: SchemaComponentContext): ReadonlyArray<SQLMigration>;
}>;
```

`components` is constructor input only. It is captured privately by the
migration closure and is not exposed on `SchemaComponent`.

Migration order is:

1. the component's selected own migrations;
2. child migrations in the order supplied by the owning factory;
3. one dedupe pass by migration name and SQL.

Same migration name plus same SQL collapses. Same name plus different SQL
throws.

The context is flat:

```ts
type SchemaComponentContext = Readonly<{
  defaults?: Readonly<{ schemaName?: string | undefined }> | undefined;
  databaseSchemaName?: string | SQLDefaultSchemaNameToken | undefined;
  tableName?: string | undefined;
}>;
```

`defaults.schemaName` is database policy. `databaseSchemaName` is the current
component placement. Keeping those separate lets Pongo bind a logical default
to a concrete schema without leaking that choice into database-level migrations
or unrelated components.

## Custom Migrations

For schemas, tables, and indexes, a component's custom `migrations` callback
replaces that component's generated own migration. Returning `[]` therefore
disables only that component's generated DDL. It does not remove child
components from traversal: `schemaComponent` still appends their migrations in
declaration order.

The factories make this selection explicit through their generated fallback
helpers: `generatedDatabaseSchemaMigrations`, `generatedTableMigrations`, and
`generatedIndexMigrations`. Database and extension components have no generated
own DDL, so their optional callback is simply their own migration source.

`ignoreHashMismatch: true` can be set on an intentionally dynamic migration. If
an already applied migration changes, the migrator skips it without failing and
without updating the recorded hash. If it has not been applied yet, it runs
normally.

## DDL Tokens

Components emit dialect-neutral SQL tokens:

- `SQLTableReference`
- `SQLIndexReference`
- `SQLCreateSchema`
- `SQLJSONDocumentIndexTarget`
- `SQLJSONPathTarget`
- `SQLDefaultSchemaNameToken`

Dialect formatters decide how those tokens render. SQLite named schemas map to
physical names such as `"crm.users"`; PostgreSQL renders schema-qualified
references. A named-schema creation token renders empty on SQLite, so the
migrator keeps filtering empty rendered SQL. Empty migrations are not recorded.

`createTableSQL` and `createIndexSQL` take plain definitions. They do not close
over components declared later.

## Migration Names

Generated migration names use:

```text
<type>:[<kind>:]<encoded-path>:<operation>
```

Rules:

- `type` is `schema`, `table`, or `index`.
- `kind` is optional and emitted only when the factory caller sets it.
- each path segment and the kind segment are percent-encoded independently;
- database names and extension aliases are not physical path segments and do not
  appear in generated names;
- there is no number segment;
- generated migration names are validated against the 255-character migration
  ledger limit before execution.

Examples:

```text
schema:crm:create
table:pongo_collection:crm:users:create
index:pongo_index:crm:users:users_email_idx:create
```

Changing the generated grammar is a deliberate break. Existing ledgers will
record the new generated names and re-run idempotent generated DDL.

## Database Shape

A Dumbo database has one containment shape:

- a nameless `defaultSchema`;
- a `tables` getter onto `defaultSchema.tables`;
- named `schemas`;
- direct `extensions`.

Direct tables and named schemas may be declared side by side:

```ts
const app = dumboSchema.database("app", {
  tables: { messages },
  schemas: {
    crm: dumboSchema.schema("crm", { users }),
  },
});

app.tables.messages;
app.defaultSchema.tables.messages;
app.schemas.crm.tables.users;
```

There is no empty-string schema key and no public
`dumboSchema.defaultSchema(...)` helper. The supported replacement for the old
default-schema helper is database `tables` mode:

```ts
dumboSchema.database("app", {
  tables: { messages },
});
```

A declaration that means PostgreSQL `public` must declare a named `public`
schema. A declaration that means the connection's native/default namespace uses
`tables`.

`databaseComponent` validates that named schema record keys match explicit
schema names.

## Schemas, Tables, and Indexes

Dumbo tables do not carry `databaseSchemaName`. Indexes do not carry
`databaseSchemaName` or `tableName`. Placement comes from context.

A table contributes its own `tableName` to child context. A named schema
contributes its explicit name. The private logical default schema contributes
`parent.defaults?.schemaName ?? SQLDefaultSchemaNameToken.from()`.

An index declared outside a table cannot create DDL and throws a clear placement
error. No assertion, cast, or synthetic table name supplies missing placement.

## Extensions

Extensions are flat. An extension contains exactly one of:

- `tables`;
- `schemas`;
- neither, for migration-only extensions.

Extensions do not contain nested extensions.

Table-scoped extensions attach to a named schema, or to a database where they
are placed in the database default schema. Schema-scoped extensions attach to a
database directly. A schema-scoped extension cannot attach to a database schema.

Extension-owned schemas are not flattened into `database.schemas`; they stay
under the extension that owns them:

```ts
database.extensions.eventStoreReadModels.schemas.readmodels.tables.users;
```

`DatabaseSchemaComponent.findTable(tableName)` searches that schema's direct
tables and table extensions. `DatabaseComponent.findTable(tableName, options)`
resolves the requested physical schema across the default schema, direct named
schemas, and extension-owned schemas, then delegates table lookup to the schema
component. Both levels reject ambiguous physical declarations. There is no
standalone traversal helper.

Pongo delegates generic lookup to the current Dumbo database component. It owns
only Pongo-specific decisions such as rejecting a relational table where a
collection is requested and creating a collection component on a miss.

## Immutable Database Growth

`DatabaseSchemaComponent.withTable(tables)` returns a new schema containing the
previous and added tables. `DatabaseComponent.withSchema(schemas)` immutably
upserts direct schemas by alias. `DatabaseComponent.withTable(tables)` updates
the logical default schema, while `withTable(tables, schemaName)` updates or
creates a direct named schema.

These operations preserve custom migrations and extensions, leave source
components and source records unchanged, and rebuild through the existing
factories so validation, context propagation, ordering, and deduplication remain
centralized. Extensions do not receive special lookup or mutation behavior.

## Pongo Declarations

Pongo accepts:

- a Pongo database declaration, which receives strongly typed direct collection
  and named-schema properties;
- a plain Dumbo `AnyDatabaseComponent`, which supports relational migrations and
  dynamic `db.collection<User>(...)` without changing the static database shape.

Pongo declarations still contain exactly one of:

```ts
pongoSchema.db("app", {
  collections: {
    users: pongoSchema.collection<User>("users"),
  },
});

pongoSchema.db("app", {
  schemas: {
    crm: pongoSchema.schema("crm", {
      users: pongoSchema.collection<User>("users"),
    }),
  },
});
```

In `collections` mode, root collections remain available as root properties,
regardless of physical placement:

```ts
database.users;
database.auditUsers;
```

In `schemas` mode, declared collections are available under their declared
schema:

```ts
database.crm.users;
```

Dynamic collections remain typed through the explicit call:

```ts
db.collection<User>("users", { databaseSchemaName: "crm" });
```

They update the runtime schema component, participate in migrations, and become
available through the runtime property surface. They do not retroactively widen
the database value's compile-time type.

Each Pongo database has one internal `PongoDatabaseComponent`. It owns:

- the current immutable Dumbo `AnyDatabaseComponent`;
- lookup through `component.findTable` and growth through `component.withTable`;
- canonical live `PongoCollection` caching by physical schema and table;
- stable named-schema collection views;
- root and named-schema runtime property exposure;
- migrations read from the current component.

`PongoDb` owns the pool, cache setup, transactions, SQL execution, collection
construction dependencies, and migration execution. It delegates collection
lookup/listing and property exposure to `PongoDatabaseComponent`.

`db.schema` is a non-callable `PongoDatabaseSchema` facade containing
`component`, `migrations`, and `migrate`. All three read the same current
component. There are no schema scopes, schema handles, projection functions, or
second runtime schema structure.

Repeated collection access without per-call runtime options returns the same
canonical wrapper, including implicit and explicit access to a configured
default schema. Calls with `cache`, `errors`, or a document `schema` create a
temporary configured wrapper; they neither replace the canonical wrapper nor
appear in `db.collections()`.

## Pongo Default Schema Binding

`defaultSchemaName` stays. It binds Pongo's logical default slot to a concrete
schema at database setup time, before migration names and SQL tokens are
produced.

If a configured default is present, declared default collections receive it as
`defaults.schemaName` when migrations are read. This emits the same
dialect-neutral `SQLCreateSchema` migration as an explicitly named schema:

```text
schema:readmodels:create
table:pongo_collection:readmodels:users:create
```

If no configured default is present, unresolved logical-default schema creation
emits no create-schema migration.

`client.db(name, options)` options are setup-time configuration. Once a database
is set up, calling `client.db(name, options)` again throws; reuse is
`client.db(name)` with no options.

## Public Surface

Generic migration concepts stay in Dumbo. `MigrationStyle` is exported by Dumbo
and imported by Pongo.

The following public surface was intentionally removed or made private:

- `dumboSchema.defaultSchema`
- `pongoSchema.defaultSchema`
- `pongoDocumentType`
- `IndexIdentifier`
- `MIGRATIONS_LOCK_ID`
- `MigrationRecord`
- `SchemaComponentRecord`
- generated index-name helper exports

`pongoDocumentType` was removed because exact Pongo document inference now comes
from Dumbo table typing:

```ts
TableRowType < Collection > ["data"];
```

The JSON index target factories stay public because Pongo index factories and
the SQL rendering path use them. `supportsSchemas` and `supportsFunctions` stay
as public database metadata capabilities. `toClientSchemaMetadata` stays as a
public Pongo schema metadata conversion utility.

## Verification Rules

Tests should be named for usage scenarios, not internal implementation details.

Core tests do not import dialect formatters. Rendered SQL belongs in dialect
packages beside the formatter that renders it. Core tests cover token
construction, component structure, migration names, and type-level behavior.

The normal gate from `/home/oskar/Repos/Pongo/src` is:

```sh
npm run build:ts
npm run fix
npm run test:unit
npm run test:int:sqlite
```

The completed refactor was also verified with the full available suites: 60
unit files with 1104 tests, 32 integration files with 391 tests, and 9 e2e files
with 465 passing tests and 5 skipped. `npm run build:ts`, `npm run fix`, and
`git diff --check` passed.

Metrics remain intentionally out of scope by Oskar's instruction.
