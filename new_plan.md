# Revised plan for migration naming, S15, and S16

## Verified baseline

This plan is based on the current branch at `bbadfcf1` (`Extracted
pongoDatabaseSchemas helper to make easier database management`) and a review
of the current uncommitted diff, component factories, migration runner, type
tests, PostgreSQL/SQLite integration tests, and the requirements in `spec.md`,
`plan.md`, and `todo.md`.

The current uncommitted attempt is 726 added lines and 136 removed lines across
19 files. It mixes three separate changes:

1. moving migration-name prefixes from the reader context to component options;
2. implementing S15 extension schema composition;
3. implementing an S16 event-store fixture and widening Pongo's projected DB
   types to understand mixed Dumbo/Pongo schemas.

That attempt is not a usable base:

- `MigrationNamePrefixes` and `pongoMigrationNamePrefixes` retain the rejected
  reader/factory prefix model;
- `PongoDatabaseShape`, `KnownKeys`, and conditional table filtering widen the
  Pongo type surface and currently do not compile for the S16 projection;
- reconstructing a `databaseSchemaComponent` while merging schema keys drops
  schema-level custom migrations because a component exposes only its complete
  `migrations()` result, not a separable own declaration;
- `schemasFromExtensions` overwrites duplicate schema keys instead of merging
  them, while `databaseComponent` implements a different merge rule;
- the S16 fixture hard-codes `emt` as a namespace and does not prove the
  name-based reference requirement it claims to cover.

The accepted `pongoDatabaseSchemas` helper in `pongoDb.ts` remains. It is the
focused owner of Pongo's mutable runtime database component and dynamic
collection insertion. Only its migration-prefix handling is removed.

## Decisions

### 1. Generated migration-name grammar

Component-generated DDL migrations use this order:

```text
<component-type>:<component-kind>:<database-path>:<sequence>:<operation>
```

The exact generated names are:

| Component | Default schema | Named schema |
| --- | --- | --- |
| schema | `schema:relational:001:create` | `schema:relational:readmodels:001:create` |
| regular table | `table:relational:users:001:create` | `table:relational:readmodels:users:001:create` |
| Pongo collection | `table:pongo_collection:users:001:create` | `table:pongo_collection:readmodels:users:001:create` |
| event-store table | `table:event_store:messages:001:create` | `table:event_store:infra:messages:001:create` |
| regular index | `index:relational:users:email_idx:001:create` | `index:relational:readmodels:users:email_idx:001:create` |
| Pongo index | `index:pongo_index:users:email_idx:001:create` | `index:pongo_index:readmodels:users:email_idx:001:create` |

Rules:

- the component type is always first: `schema`, `table`, or `index`;
- the component kind is always present, so a schema name can never be confused
  with a kind;
- `relational` is the normal Dumbo kind; there is no `dumbo`, `default`, or
  `standard` namespace;
- Pongo supplies `pongo_collection` and `pongo_index` through component options;
- another library supplies its own meaningful kind through the same options,
  for example `event_store`;
- the physical database path follows the kind: optional schema, then table,
  then index as applicable;
- `SQLDefaultSchemaNameToken` contributes no path segment;
- every built-in create migration is numbered `001` and uses the operation
  `create`; the type and kind already say what is being created;
- database name, extension name, package name, and record alias are not part of
  the migration name because none identifies the physical database object;
- the existing colon separator remains; this step does not add escaping or an
  identifier parser.

The numbering is load-bearing. It keeps names human-readable and leaves room
for a component to add `002:<operation>` later without changing the path or
kind contract.

### 2. Kind is an option, not inferred state

There will be no marker lookup, registry, context override, or inspection of a
wrapped component.

`databaseSchemaComponent`, `tableComponent`, and `indexComponent` receive an
optional `kind` in their existing options. Each factory closes over the value:

- schema default: `relational`;
- table default: `relational`;
- index default: `relational`.

Pongo passes `kind: 'pongo_collection'` when it creates the collection table
and `kind: 'pongo_index'` from each Pongo index factory. An event-store factory
passes `kind: 'event_store'` for its messages table.

`kind` is deliberately not added to `SchemaComponentContext` or generic
`SchemaComponentOptions`: columns, extensions, and generic groups do not emit
these generated DDL names. It is also not made a type parameter because no
current consumer needs type-level access to the string.

### 3. User-declared migration names remain unchanged

Only the generated schema/table/index DDL migration names use the grammar
above. Names supplied through `sqlMigration(name, ...)` remain exactly as the
caller wrote them.

This preserves the current contract:

- same declared name plus same SQL deduplicates across the tree;
- same declared name plus different SQL throws;
- reusable migrations can intentionally share an identity across components.

Automatically qualifying those names would silently break all three
behaviours.

### 4. Extension schema keys have one owner

An extension remains a database fragment with `schemas`, `extensions`, and
`migrations`, but schema keys must be unique across the composition. A schema
declared directly by a database and a schema contributed by an extension
cannot use the same key. Two extensions cannot contribute the same key either.
Both cases throw with the key and extension name in the error.

This replaces the old S15 requirement to merge components sharing a schema
key. The replacement is necessary, not cosmetic: rebuilding two self-contained
schema components from their public `tables` and `extensions` drops their
schema-level custom migrations. Preserving them would require reintroducing an
own-migration/declaration API or creating a wrapper that replays complete
migration trees. Both contradict the branch's self-contained component design.

Callers that need several features in one schema compose their tables first and
construct one schema component. The S16 event-store factory follows that rule
by collecting all read-model tables before creating its `readmodels` schema.

### 5. Strong typing stops at the Dumbo component boundary for S16

S15 preserves strong static typing on the composed database component:

```ts
database.schemas.readmodels.tables.users
```

S16 does not make extension-contributed mixed Dumbo/Pongo schemas grow new
properties on `PongoDbWithSchema`. The Pongo runtime accesses the collection
through the existing public API:

```ts
db.collection<User>('users', { databaseSchemaName: 'readmodels' })
```

That call still returns `PongoCollection<User>`. This avoids changing
`PongoDatabaseDefinition`, adding `KnownKeys`, filtering arbitrary table maps,
or weakening existing assertions. Static Pongo property projection remains
limited to schemas declared directly through the existing Pongo definition.

### 6. S16 uses a real path, not `emt` as branding

The event-store messages table is placed in the default schema through
`dumboSchema.defaultSchema`. Its identity comes from `kind: 'event_store'`, so
its table migration is:

```text
table:event_store:messages:001:create
```

There is no `emt`, `emmett`, `pongo`, or `dumbo` path segment unless it is an
actual physical schema name chosen by the caller. The read-model collection is
physically in the named `readmodels` schema, so its path correctly contains
`readmodels:users`.

## Execution plan

### Step 0: return to the accepted baseline

Restore the 19 currently modified source/spec files to `bbadfcf1`. Do not
change or revert `bbadfcf1` itself; in particular, retain the internal
`pongoDatabaseSchemas` helper.

Before new implementation, run from `src/`:

```text
npm run build:ts
npm run test:unit
```

This establishes that failures introduced after that point belong to the new
work. The useful assertions from the rejected S15/S16 attempt are listed below
and must be rewritten before implementation; they are not discarded.

### Step 1: write migration-name tests first

Update `dumbo/src/core/schema/components/componentMigrations.unit.spec.ts` to
assert the complete grammar before changing production code:

- schema, table, and index use type, kind, path, `001`, and `create` in order;
- default schema omits only the schema path segment;
- named schema includes its real name;
- database name does not affect generated names;
- a custom table kind is local to that table and does not affect sibling
  tables, schemas, or indexes;
- a custom index kind is local to that index;
- a user-declared migration such as `users:backfill` is unchanged;
- duplicate declared names retain the current dedupe/conflict behaviour.

Add focused Pongo unit expectations in
`pongo/src/core/schema/schema.unit.spec.ts`:

- a Pongo collection generates `table:pongo_collection:...:001:create`;
- every `pongoSchema.index` variant generates
  `index:pongo_index:...:001:create` when placed under a collection;
- a regular Dumbo table placed in the same database keeps `relational`;
- Pongo schema factories generate ordinary `schema:relational` names, proving
  there is no `pongo_schema` concept.

Run the focused tests and confirm they fail only on the old names.

### Step 2: implement the naming contract

Change `dumbo/src/core/schema/components/migrationNames.ts`:

- delete `MigrationNamePrefixes` and `defaultMigrationNamePrefixes`;
- keep the three concrete naming functions rather than adding a naming class,
  resolver, builder, registry, or public generic formatter;
- change their inputs from prefixes to the component's `kind`;
- emit the exact grammar and the `001:create` suffix for schema, table, and
  index;
- keep the existing default-schema token check and path omission.

Change the three DDL-emitting component factories:

- `databaseSchemaComponent.ts`: accept `kind?: string`, default to
  `relational`, and pass it to `databaseSchemaMigrationName`;
- `tableComponent.ts`: accept `kind?: string`, default to `relational`, and
  pass it to `tableMigrationName`;
- `indexComponent.ts`: accept `kind?: string`, default to `relational`, and
  pass it to `indexMigrationName`.

Change `schemaComponent.ts`:

- remove `migrationNamePrefixes` from `SchemaComponentContext`;
- do not add `kind` to the context;
- leave migration traversal, deduplication, assertions, and user-declared
  migration handling unchanged.

Change Pongo factories in `pongo/src/core/schema/index.ts`:

- pass `kind: 'pongo_collection'` in the single collection-table creation
  path;
- pass `kind: 'pongo_index'` from path, unique, JSON-document, and custom SQL
  index creation paths;
- do not pass a special kind to Pongo schema/database factories;
- do not add or inspect markers for migration naming.

Change `pongo/src/core/database/pongoDb.ts`:

- delete `pongoMigrationNamePrefixes` and its import;
- make `pongoDatabaseSchemas.migrations()` call `component.migrations()`
  directly;
- keep collection lookup, dynamic insertion through `withTable`, and the
  public `pongoSchema.collection<User>(...)` API unchanged.

Remove obsolete exports and update all exact-name expectations found by:

```text
rg "MigrationNamePrefixes|migrationNamePrefixes|pongoMigrationNamePrefixes|dumboSchema:|dumboTable:|dumboIndex:|pongoSchema:|pongoCollection:|pongoIndex:" packages
```

Run:

```text
npm run build:ts
npm run fix
npm run test:unit
```

Stop if implementing the kind requires wrapping, spreading, replacing, or
mutating an already-created component. The option must reach the original
factory call.

### Step 3: write the reduced S15 contract as tests

Use Vitest `expectTypeOf`; do not use TypeScript suppression comments.

In `dumbo/src/core/schema/schemaComposition.type.spec.ts`, define a concrete
extension with a default-schema messages table and a named read-model schema.
Assert:

- `extension.schemas.readmodels.tables.users` retains the exact table type;
- `database.schemas.readmodels.tables.users` retains the same exact type after
  attaching the extension;
- direct database schemas remain typed alongside extension schemas;
- nested extension values remain reachable through `extension.extensions`;
- no type recursively walks table/component child maps.

In `schemaComponent.unit.spec.ts` and
`components/componentMigrations.unit.spec.ts`, preserve or rewrite every useful
assertion from the rejected attempt:

- an extension exposes its declared `schemas` and `extensions` records;
- a database exposes a schema contributed by an extension;
- extension migrations execute in the same order as their schemas and nested
  extensions;
- a database-level extension's schemas retain their own paths;
- a schema-level extension may contribute only that same physical schema;
- a schema-level extension contributing another schema throws;
- duplicate schema keys across direct schemas/extensions throw;
- duplicate schema keys across two extensions throw;
- duplicate table aliases inside one schema continue to throw;
- same migration name/same SQL still deduplicates;
- same migration name/different SQL still throws.

The previous “merge two extensions into one schema” assertion is replaced by
the duplicate-key assertion because lossless component merging is outside the
self-contained component contract.

### Step 4: implement S15 without reconstructing components

Change `extensionComponent.ts` only as far as needed:

- options are `{ schemas?, extensions?, migrations? }`;
- the returned component exposes frozen `schemas` and `extensions` records;
- `components` contains direct schemas followed by nested extensions;
- `migrations(context)` remains the existing own-plus-children traversal and
  dedupe;
- schemas from nested extensions are exposed only when their keys are unique;
- a duplicate key throws rather than overwriting or rebuilding a schema.

Typing may use one non-recursive `SchemasFromExtensions<Extensions>` record
intersection. It must only read each extension's already-declared `schemas`
field. Do not add recursive conditional inference, `KnownKeys`, schema/table
filtering, marker-based projection, or runtime type metadata.

Change `databaseComponent.ts`:

- start with the exact direct `schemas` record;
- add each extension's already-built schema component by key;
- throw on a duplicate key;
- expose the combined frozen record as `schemas`;
- keep `components` as direct schemas followed by extensions, so each original
  component remains the owner of its own migration closure;
- do not rebuild `databaseSchemaComponent` values;
- do not create a runtime database wrapper or second migration traversal.

Change `databaseSchemaComponent.ts` only for schema-attached validation:

- inspect each attached extension's exposed schemas;
- allow the parent schema name or the same default-schema token;
- throw when an extension contributes a different schema;
- do not merge or copy the extension's tables into the parent's `tables`
  record.

Update `dumboSchema.extension` to forward the options object directly. Keep the
public call shape small:

```ts
dumboSchema.extension('eventStore', {
  schemas: { ... },
  extensions: { ... },
  migrations: () => [ ... ],
})
```

Do not introduce `runtimeDatabaseComponent`, `PongoDBSchemasDefinition`, a
schema state object, a resolver, a declaration layer, or a composition helper.

Run:

```text
npm run build:ts
npm run fix
npm run test:unit
npx vitest run postgresql "migrations.int.spec"
npx vitest run sqlite "migrations.int.spec"
```

### Step 5: write S16 from the public API

Build one small event-store extension fixture in the Pongo migration
integration specs. It should be written so it can later move to Emmett, but it
must use only public Dumbo/Pongo declarations:

- messages table in `dumboSchema.defaultSchema`, with
  `kind: 'event_store'`;
- one `readmodels` schema assembled once from the projection registrations;
- a Pongo `users` collection in that schema;
- no hard-coded `emt` schema and no provider prefix in the database path;
- no `runtimeDatabaseComponent`, marker-based naming, or projected Pongo DB
  type widening.

Type proof:

- use `expectTypeOf` on the extension/database component to prove the users
  collection's document and table types;
- use `expectTypeOf` on
  `db.collection<User>('users', { databaseSchemaName: 'readmodels' })` to prove
  the runtime collection type;
- do not assert that `db.readmodels.users` exists when the schema came only
  from an extension.

Runtime proof on PostgreSQL and SQLite:

- inspect the generated migration names before running them;
- assert `table:event_store:messages:001:create`;
- assert `schema:relational:readmodels:001:create`;
- assert `table:pongo_collection:readmodels:users:001:create`;
- run migration twice;
- assert the messages table exists in the dialect's default schema;
- insert and read a user through the typed `db.collection<User>` result;
- assert the migration ledger contains each non-empty generated migration once;
- preserve all existing migration integration assertions.

The old S16 sentence about resolving a name-based cross-component reference is
removed from this step. The repository currently has strongly typed
relationship-name validation, but no root-time migration reference resolver.
Adding one here would be a separate feature and would violate the request not
to introduce a resolver abstraction merely to satisfy an example.

### Step 6: update the durable documents

After code and tests are green, update:

- `spec.md` D10 with the final type/kind/path/sequence/operation grammar and
  generated-name compatibility consequence;
- `spec.md` D15 with unique schema ownership instead of lossful schema merging;
- `spec.md` D5/S16 wording so the example does not claim unimplemented runtime
  reference resolution;
- `plan.md` S11, S15, and S16 with the actual implemented contracts;
- `todo.md` with completed items, exact test commands/results, and anything
  intentionally deferred.

Do not mark S15 or S16 complete until both dialect integration tests pass.

### Step 7: final verification and review gate

Run from `src/`, in this order:

```text
npm run build:ts
npm run fix
npm run test:unit
npm run test:int:postgresql
npm run test:int:sqlite
npm run test:e2e:postgresql
npm run test:e2e:sqlite
```

Then verify removed concepts are gone:

```text
rg "MigrationNamePrefixes|migrationNamePrefixes|pongoMigrationNamePrefixes|runtimeDatabaseComponent|KnownKeys|schemasFromExtensions" packages
```

Review the final diff for these stop conditions:

- no `as unknown as` added for schema composition or Pongo projection;
- no non-null assertions added to make schema/table lookup compile;
- no assertion, test case, or public `<User>` call removed or weakened;
- no mutation or property definition on an existing component;
- no reader-selected kind;
- no schema component reconstructed from another component's public fields;
- no second migration traversal;
- no new public abstraction beyond the three existing component option fields;
- production-line growth is limited to the S15 fields, duplicate-key checks,
  and the non-recursive type intersection required for extension schemas.

If any stop condition is hit, stop implementation and report the exact type or
runtime constraint before changing the design.

## Compatibility consequence

Every generated DDL migration name changes. Existing databases will see these
as new migrations. The generated SQL is idempotent (`IF NOT EXISTS`, or renders
nothing for a default schema), so objects are not recreated, but new ledger
rows are written under the new names.

This plan intentionally adds no legacy aliases, fallback prefix reader, or
migration-history rewrite. Such compatibility machinery would preserve the
very prefix model being removed. This consequence must be accepted before
implementation starts.
