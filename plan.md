# Plan: simplify the schema component model

Implements [spec.md](spec.md). Detailed execution notes live in
[todo.md](todo.md). Nothing is committed by the agent; Oskar handles git.

## Current State

Implementation work through Step 8 is complete:

1. Migrator cleanup.
2. `schemaComponent` as the base migration traversal.
3. Context as the only Dumbo placement source.
4. Correct generated migration names.
5. Flat extensions without flattening extension-owned schemas into
   `database.schemas`.
6. One Dumbo database shape: default schema plus named schemas.
7. Pongo logical-default binding through `defaultSchemaName`.
8. Pongo typing/public-surface simplification and export audit.

Metrics are intentionally ignored for this branch per Oskar's instruction.

## Ground Rules

Every remaining change follows these rules:

- Keep simplifying. Do not introduce markers, brands, wrappers, compatibility
  shims, or helper abstractions unless Oskar explicitly approves them.
- If something looks weird, stop and ask.
- Generic migration and schema concepts belong in Dumbo. Pongo owns Pongo
  projection, Pongo collection components, and dynamic collection behavior.
- Tests are named by user-visible usage scenario, not internal implementation.
- Preserve the existing dirty working tree. Do not reset or revert unrelated
  changes.

## Implemented Decisions

### Schema Components

`schemaComponent(kind, { components, context, migrations })` is the shared base.
`components` is constructor input only and is not exposed. Migrations are read
through one traversal: own migrations, children, then dedupe by migration name
and SQL.

Placement is carried by `SchemaComponentContext`:

```ts
type SchemaComponentContext = Readonly<{
  defaults?: Readonly<{ schemaName?: string | undefined }> | undefined;
  databaseSchemaName?: string | SQLDefaultSchemaNameToken | undefined;
  tableName?: string | undefined;
}>;
```

Dumbo tables and indexes do not store placement. An index without table context
throws instead of synthesizing placement.

### DDL and Migration Names

Components emit dialect-neutral tokens. Dialect formatters render references,
schema creation, and JSON index targets. Empty rendered SQL is filtered by the
migrator and not recorded.

Generated migration names use:

```text
<type>:[<kind>:]<encoded-path>:<operation>
```

There is no number segment. The kind and each path segment are encoded
independently, and migration names are validated against the ledger's
255-character limit before execution.

### Dumbo Database Shape

A database always has:

- `defaultSchema`;
- `tables`, as a getter onto `defaultSchema.tables`;
- named `schemas`;
- direct `extensions`.

`tables` and `schemas` can be declared together. The old public
`dumboSchema.defaultSchema(...)` helper is gone; direct default-namespace tables
are declared with database `tables`.

### Extensions

Extensions are flat and contain `tables`, `schemas`, or only `migrations`.
Nested extensions are gone. Extension-owned schemas stay under
`database.extensions.<key>.schemas`; they are not flattened into
`database.schemas`.

### Pongo

Pongo accepts plain Dumbo database components without projecting static Pongo
properties. Pongo declarations project strong properties only for declared
Pongo collections/schemas.

Dynamic collections are typed by the call:

```ts
db.collection<User>("users", { databaseSchemaName: "crm" });
```

They update the runtime component and migrations, but not the static database
shape.

`defaultSchemaName` binds Pongo's logical default to a concrete schema through
`defaults.schemaName` when migrations are read. Once a database has been set up,
`client.db(name, options)` is rejected; reuse is `client.db(name)`.

### Public Surface

`MigrationStyle` stays in Dumbo. Pongo imports it from Dumbo.

Removed or made private in Step 8:

- `pongoDocumentType`
- `IndexIdentifier`
- `MIGRATIONS_LOCK_ID`
- `MigrationRecord`
- `SchemaComponentRecord`
- generated index-name helper exports

Kept:

- JSON index target factories;
- `supportsSchemas` and `supportsFunctions`;
- `toClientSchemaMetadata`.

## Remaining Work

### Documentation

This update replaces the stale design text in `spec.md` and `plan.md`, and marks
the documentation-only Step 9 state in `todo.md`. Metrics are not produced.

### Step 10: DDL Privilege Policy

This is discussion only until Oskar decides the policy. Nothing is implemented
under Step 10 yet.

Open decisions:

- option shape: prefer a union such as `privileges?: 'full' | 'restricted'`;
- scope: schema creation is real; database creation currently has no emitter;
- transport: context field versus migrator filtering;
- disabled behavior: omit privileged DDL uniformly, including migration-table
  schema creation;
- default: permissive current behavior versus restricted by default;
- boundary: whether PostgreSQL `CREATE EXTENSION` belongs under the same
  policy.

## Verification

For code changes, run from `/home/oskar/Repos/Pongo/src`:

```sh
npm run build:ts
npm run fix
npm run test:unit
npm run test:int:sqlite
```

For this documentation update, run:

```sh
npm run fix && npm run build:ts
```
