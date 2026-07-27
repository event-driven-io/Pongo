# Plan: Database/Schema-First Components for Dumbo, Pongo, and Emmett

## Goal

Use the existing Dumbo hierarchy as the shared schema model:

```text
database -> schemas -> tables / collections / indexes / features
```

The same database definition should drive migrations, runtime Pongo access, and
future Emmett event store/projection setup.

## Core Model

- `database` is the top-level composition boundary.
- `schema` is a logical database schema/namespace.
- `table`, `collection`, `index`, and future functions are schema objects.
- `feature` means a grouped set of database schema objects, not a replacement
  for database/schema/table.

Features are scoped:

- database feature: may own objects across schemas.
- database-schema feature: owns objects inside one schema.

Example:

```ts
const database = dumboSchema.database('app', {
  crm: dumboSchema.schema('crm', {
    users: dumboSchema.table('users', ...),
  }),
}, {
  features: {
    eventStore: eventStoreFeature(...),
  },
});
```

## Implemented Slice

- Added generic component discovery helpers.
- Added explicit typed `features` maps to database and schema components.
- Added scoped feature helpers:
  - `databaseFeatureSchemaComponent(...)`
  - `databaseSchemaFeatureSchemaComponent(...)`
- Pongo collection definitions can carry a logical database schema.
- `db.collection<T>('users', { schema: 'crm' })` creates/selects a
  schema-qualified collection component lazily.
- Default and schema-qualified lazy Pongo collections are distinct.

## Pongo Direction

Pongo should move toward first-class database/schema helpers:

```ts
const database = pongoSchema.database('app', {
  crm: pongoSchema.schema('crm', {
    users: pongoSchema.collection<User>('users'),
  }),
});
```

Selection rules:

- A collection inside `pongoSchema.schema('crm', ...)` belongs to `crm`.
- `db.collection<User>('users', { schema: 'crm' })` lazily creates/selects
  `crm.users`.
- `db.collection<User>('users')` uses the default database schema.
- Internally every collection should normalize to:

```ts
{
  databaseName,
  databaseSchemaName,
  collectionName,
}
```

Typed access should eventually follow the database/schema definition:

```ts
db.crm.users
```

Existing typed `pongoSchema.client(...)` support remains compatible.

## SQLite Logical Schemas

SQLite has no physical database schemas. Keep only these modes:

- strict: default; logical schemas are accepted but physical object names must
  not collide.
- prefix: map logical schema into physical names, e.g. `crm.users` ->
  `crm_users`.

## Indexes

Indexes belong under table/collection definitions.

Pongo helper candidates:

```ts
pongoSchema.index.path('email');
pongoSchema.index.unique('email');
pongoSchema.index.compound(['tenantId', 'email']);
pongoSchema.index.uniqueCompound(['tenantId', 'email']);
pongoSchema.index.jsonPath('email');
pongoSchema.index.uniqueJsonPath('email');
```

Driver-specific helpers should be explicit:

```ts
pongoSchema.index.pg.jsonbGin();
pongoSchema.index.pg.fullText(['title', 'body']);
pongoSchema.index.sqlite.fullText(['title', 'body']);
```

## Remaining Work

1. Add `pongoSchema.database(...)` and `pongoSchema.schema(...)` on top of the
   existing Dumbo database/schema model.
2. Preserve typed Pongo collections through database/schema helpers.
3. Generate Pongo migrations from collection metadata including schema and
   indexes.
4. Update SQL builders to use normalized schema-qualified collection identity.
5. Add SQLite prefix mapping and reuse it in migrations and runtime SQL.
6. Add Emmett feature components using scoped database/database-schema features.
