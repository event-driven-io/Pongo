# Immutable Database Component Growth

## Summary

Replace Pongo's runtime schema overlay with immutable component rebuilding.

Dumbo components remain reusable immutable declarations. `withTable` and
`withSchema` return new components containing the previous declarations plus
the additions. Pongo owns one evolving `DatabaseComponent` reference and
replaces that reference whenever a dynamic collection is created.

No cloning API, mutable component tree, parent pointer, scope map, secondary
migration traversal, or Pongo-specific migration aggregation is needed.

Static TypeScript properties remain based on the original declaration.
Dynamically added collections are visible through `db.collection(...)`,
`db.schema(...).collection(...)`, `db.schema.component`, and migrations, but do
not appear as newly inferred properties.

## Immutable Component APIs

Introduce a shared record merge type equivalent to:

```ts
type MergeRecords<Current, Added> = Omit<Current, keyof Added> & Added;
```

This models actual replacement semantics more accurately than
`Current & Added`.

### `DatabaseSchemaComponent.withTable`

Add:

```ts
withTable<const Added extends DatabaseSchemaTables>(
  tables: Added,
): DatabaseSchemaComponent<
  MergeRecords<Tables, Added>,
  SchemaName,
  Extensions
>;
```

Usage:

```ts
const next = schema.withTable({
  users: usersTable,
});
```

Behavior:

- Accept the same table-record shape as
  `DatabaseSchemaComponentOptions.tables`.
- Return a new schema component.
- Preserve `schemaName`, `kind`, extensions, and the original custom migration
  callback.
- Preserve all existing table component references.
- Add or replace entries by alias using normal record merge semantics.
- Rebuild through `databaseSchemaComponent(...)`, so existing validation,
  child ordering, context propagation, baseline handling, and migration
  deduplication remain authoritative.
- Leave the source component and both source records untouched.
- Freeze the resulting component maps through the existing
  `schemaComponentMap`.
- Continue rejecting different aliases that resolve to the same physical
  `tableName`.

The factory must retain its normalized construction inputs in its closure so
`withTable` can faithfully rebuild the component. These inputs are
implementation data, not another public tree or instance abstraction.

### `DatabaseComponent.withSchema`

Add:

```ts
withSchema<const Added extends DatabaseSchemas>(
  schemas: Added,
): DatabaseComponent<
  DatabaseName,
  Tables,
  MergeRecords<Schemas, Added>,
  Extensions
>;
```

Behavior:

- Accept the same schema-record shape as `DatabaseComponentOptions.schemas`.
- Return a new database component.
- Always upsert by alias: add absent schemas and replace schemas supplied under
  existing aliases through the same record merge.
- Preserve database name, default tables, extensions, and custom database
  migrations.
- Rebuild through `databaseComponent(...)`, retaining schema-key validation and
  migration ordering.
- Never mutate the original database or schema records.

Replacing an existing alias is required so `withTable(..., schemaName)` can
replace that schema with the result of its `withTable`.

### `DatabaseComponent.withTable`

Add overloads for the default and named schemas:

```ts
withTable<const Added extends DatabaseTables>(
  tables: Added,
): DatabaseComponent<
  DatabaseName,
  MergeRecords<Tables, Added>,
  Schemas,
  Extensions
>;

withTable<
  const Added extends DatabaseTables,
  const SchemaName extends string,
>(
  tables: Added,
  schemaName: SchemaName,
): DatabaseComponent<
  DatabaseName,
  Tables,
  UpsertSchemaTables<Schemas, SchemaName, Added>,
  Extensions
>;
```

Default-schema behavior:

- Call `defaultSchema.withTable(tables)`.
- Rebuild the database with the updated default schema's tables.
- Preserve the logical `SQLDefaultSchemaNameToken`; do not bind a physical
  default inside Dumbo.

Named-schema behavior:

- If `schemas[schemaName]` exists, call its `withTable` and replace it through
  `withSchema`.
- If it does not exist, create `databaseSchemaComponent({ schemaName })`, call
  its `withTable`, and add the result through `withSchema`.
- Determine existence only from the database's direct `schemas` record. The
  operation does not inspect or branch on extensions.
- A literal schema-name argument produces a typed schema property.
- A runtime `string` remains valid but cannot honestly add a statically known
  property; its result widens only the affected schema-record portion.
- Schema aliases remain canonical: the added record key and explicit
  `schemaName` must agree.

### Extensions

Extensions do not change the semantics of `withSchema` or `withTable`:

- `withSchema` always upserts the direct `schemas` record.
- Named `withTable` reads that same record, creates a normal schema when its
  alias is absent, calls the schema's `withTable`, and delegates to
  `withSchema`.
- Neither operation searches extension-owned schemas or creates a special
  augmentation schema.
- Extension components and their contributed schemas remain unchanged and are
  preserved by reference in the rebuilt database.
- If a direct schema and an extension independently contribute the same
  physical schema, ordinary component traversal and migration deduplication
  apply. `withTable` does not add ownership flags or reorder children to hide
  that composition.

Do not add `generateCreateSchema`, extension mutation APIs, generic node
wrappers, parent pointers, path-replacement frameworks, or another traversal.

## Pongo Runtime Integration

Replace `pongoDatabaseSchemas` with one evolving component:

```ts
let component: AnyDatabaseComponent =
  options.schema?.definition ?? pongoSchema.db({ collections: {} });
```

Collection resolution becomes:

1. Resolve the requested physical placement using `requestedSchemaName`,
   `defaultSchemaName`, and the existing default-schema token rules.
2. Search the current component with Dumbo's `findTable`.
3. If a table exists, reject it unless
   `isPongoCollectionComponent(table)` succeeds.
4. If no table exists, construct one `pongoSchema.collection(...)`.
5. Add it to the current component:

```ts
component = component.withTable(
  { [collectionName]: created },
  requestedSchemaName,
);
```

Omit the schema-name argument for the logical default namespace.

`DatabaseComponent.withTable` handles schema existence and upsert. Pongo does
not inspect extensions or maintain separate schema-creation behavior.

Keep the existing runtime `PongoCollection` caches. They cache configured
collection objects, connection behavior, serializers, errors, and cache
overrides; they are not schema declaration overlays.

## Migrations and Schema Access

`db.schema.component` becomes a getter returning the current component:

```ts
component: {
  enumerable: true,
  get: () => component,
}
```

`db.schema.migrations` becomes:

```ts
get: () =>
  component.migrations(
    typeof defaultSchemaName === "string"
      ? { defaults: { schemaName: defaultSchemaName } }
      : undefined,
  ),
```

`migrate()` reads the same current component migrations.

Delete from Pongo:

- `pongoDatabaseSchemas`;
- `defaultScope`;
- `namedScopes`;
- runtime overlay collection maps;
- overlay-specific schema creation;
- declared/default/named migration concatenation;
- Pongo's `dedupeMigrations` dependency.

Dumbo's single component traversal remains responsible for migration ordering
and deduplication.

## Public Schema Scope and Projection

Keep `db.schema(name)` because it is public collection-placement syntax:

```ts
db.schema("crm").collection("users");
```

Its object contains no schema declaration state. It only delegates to:

```ts
db.collection("users", {
  databaseSchemaName: "crm",
});
```

Keep scope-object caching because the current API guarantees repeated calls
return the same object. Rename local variables if useful to distinguish this
API wrapper from the deleted schema overlay.

Keep the declared-property projection behavior:

```ts
db.users;
db.crm.users;
```

Projection operates once from the original typed declaration and only installs
getters. It does not own schema state or migrations.

Rename `projectPongoDb` to something explicit such as
`installDeclaredPongoAccessors` if this improves clarity, but do not remove it
unless the projected-property API is intentionally removed.

Dynamic additions do not install new projected getters.

Change `PongoSchemaAccessor.component` to `AnyDatabaseComponent`. After
immutable runtime additions, the current component is a regular database
component and should not falsely claim to retain Pongo's original
declaration-only `collections` metadata.

## Validation and Edge Cases

Preserve current behavior for:

- aliases differing from physical table names;
- configured `defaultSchemaName`;
- logical default and explicitly named collections sharing a physical
  namespace;
- relational Dumbo tables passed to Pongo;
- extension-contributed tables and schemas;
- duplicate physical tables;
- collection names colliding across different physical schemas;
- schema/table/index migration order;
- custom and baseline migrations;
- runtime collection options that intentionally produce separate runtime
  collection objects.

Before adding a dynamic table, always search by physical table name. This
prevents replacing an existing differently aliased declaration.

If the proposed table alias already exists but points to a different physical
table, fail clearly instead of silently overwriting it. Pongo may select a
deterministic internal alias for a dynamic component when necessary, but that
alias must not become a projected API property.

## Tests

### Dumbo component tests

Add compile-time and runtime coverage proving:

- `schema.withTable({ users })` infers old and new aliases.
- The original schema remains unchanged.
- Schema name, extensions, custom migrations, and kind survive rebuilding.
- Duplicate physical table validation still runs.
- `database.withSchema({ crm })` infers old and new schemas.
- Replacing one schema preserves unrelated schemas.
- Default `database.withTable({ users })` updates `tables` and
  `defaultSchema.tables`.
- Named `database.withTable({ users }, "crm")` updates an existing schema.
- Named `withTable` creates a missing schema.
- Runtime-string schema names remain callable without claiming literal
  properties.
- Extensions and custom database migrations survive every rebuild.
- Migration order remains database, default schema, named schemas, and
  extensions as currently specified.

### Pongo database tests

Rewrite overlay-oriented assertions to prove:

- `db.schema.component` changes identity after first dynamic registration.
- The original declaration passed to Pongo remains unchanged.
- The current component contains dynamically added tables.
- Repeated collection access reuses the same component and runtime collection.
- Multiple additions to one schema accumulate.
- Default and named collections remain distinct.
- A missing named schema emits one schema migration.
- Adding to an already declared schema emits no additional schema migration.
- Configured default-schema migration names remain unchanged.
- Relational tables still produce the existing "not a Pongo collection" error.
- Static projected getters continue resolving declared collections.
- Dynamic collections do not create new projected properties.
- `db.schema(name)` identity and delegation remain unchanged.

### Verification

Run focused checks first:

```sh
npx vitest run src/packages/dumbo/src/core/schema/components/databaseSchemaComponent.unit.spec.ts
npx vitest run src/packages/dumbo/src/core/schema/components/databaseComponent.unit.spec.ts
npx vitest run src/packages/pongo/src/core/database/pongoDb.unit.spec.ts
npx vitest run src/packages/pongo/src/core/schema/schema.type.spec.ts
```

Then run repository gates:

```sh
npm run fix
npm run build:ts
npm test
```

## Documentation

Update `spec.md` to replace the runtime-overlay model with immutable component
growth.

Update `ref_plan.md` decision 18 and all overlay references. State that
declarations remain immutable, while each Pongo database owns an evolving
immutable database-component value.

Update `todo.md` with implementation and verification evidence. Do not rewrite
unrelated completed history.

## Acceptance Criteria

The refactor is complete when:

- Dumbo exposes the typed immutable APIs described above.
- Reusable input components and records are never mutated.
- Pongo has one current database component and no schema overlay.
- Every dynamic collection is discoverable through `db.schema.component`.
- `db.schema.migrations` is exactly the current component's migration
  traversal.
- Extensions remain reusable and unchanged; schema upsert does not special-case
  their contents.
- Static projection remains declaration-based and separate from schema
  ownership.
- Focused tests, TypeScript build, and the full test suite pass.
