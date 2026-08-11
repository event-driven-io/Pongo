# Spec: Self-contained schema components and migration resolution

Branch: `schema_features`
Status: agreed design, ready for implementation

This replaces the parent-pointer design. See `qa.md` Q48–Q61 for the decisions that overturned it.

## 1. Problem

The `schema_features` branch made schema components ("nodes" of the database structure: database, schema, table, column, index, extension) strongly typed and database-agnostic. Migration resolution did not keep up, and now exists twice:

- `SchemaComponent.migrations` in `core/schema/schemaComponent.ts` — walks the component tree collecting _declared_ migrations, with no naming context.
- `databaseMigrations` in `core/schema/components/databaseMigrations.ts` — walks the same tree again, collecting declared migrations _plus_ builder-generated DDL, reconstructing a widening identifier (`databaseName` → `+databaseSchemaName` → `+tableName` → `+indexName`) as it descends.

Both walks keep their own duplicate-name check. The complexity concentrates in deciding, per component, where the schema qualifier comes from — the component itself, the parent map key, the parent's `schemaName`, or nowhere — and bailing out when it can't tell.

Root causes:

1. **A component doesn't know where it lives.** A table is defined before it is put into a schema, so at definition time its schema qualifier is unknown.
2. **A component can't emit its own DDL.** The tree is deliberately dialect-agnostic, so `CREATE TABLE` comes from a per-storage `DatabaseMigrationBuilder` passed in from outside. That makes `component.migrations` structurally incapable of being complete, which is why the second walk exists.
3. **`databaseName` is threaded everywhere and used nowhere.**
4. **"No schema" has two encodings** — a missing schema component, and a schema component with `schemaName: undefined` — so every consumer needs an `undefined` branch.

Visible consequences today: a table inside a database-level extension is silently dropped (the `databaseSchemaName !== undefined` guard at `databaseMigrations.ts:94-97` fails, so no `CREATE TABLE` is emitted); `pongoCollectionMigrationName` needs the dialect's default schema name only to strip it back out; `logicalSchemaMapping` rejects valid SQLite schemas that the physical-name mapping already disambiguates.

## 2. Goal

A schema component is an **immutable value that is never rewritten**. Putting it into a parent does not clone it, stamp it, or freeze it — the parent holds the same object.

`component.migrations(context)` returns that component's own migrations plus its children's, recursively. Each component extends the context with what it alone knows — a schema contributes its schema name, a table its table name — before passing it down. There is one walk and it is the components' own: no visitor, no builder argument, no second traversal.

**Context threading is the mechanism.** The previous version of this spec said "no identifier threading" and specified a stored `parent` back-pointer instead. Withdrawn (Q49): the back-pointer forced attach-time cloning, which forced every child map to be repointed, which produced `attachChildren`, `withParent`, `isAliasedComponents` and the component-level freeze. Threading context down at read time gets the same result with none of that.

### Non-goals

- No new dialect features (pgvector, PostGIS). The DDL token vocabulary must leave room for a dialect to add its own tokens, but only what dumbo has today gets implemented.
- No behavioural change to the migration runner (it already dedupes by name and hash).
- `components/relationships/` is out of scope — 971 lines of type-level validation, orthogonal to migration resolution.

## 3. Design decisions

### D1 — Components are immutable values; placement never rewrites them

A component put into a parent is the **same object**. The parent's erased child list and its typed maps (`tables`, `indexes`, `columns`, `schemas`, `extensions`) hold that same object, so there is nothing to keep in sync and no attach step to write.

Deleted: `attachChildren`, `withParent`, `isAliasedComponents`, the `parent` field, the per-kind accessors `tableComponent.schema()` and `indexComponent.table()`, and `Object.freeze` on the component itself. Records built from user input (`schemaComponentMap`) stay frozen — that is about not aliasing caller-owned objects, not about component identity.

A component therefore **cannot report where it lives**. `table.schema()` does not exist. Verified against every consumer before adopting this (Q49): pongo's DML path never asked — `pongoDb.ts:248-249` already knows `databaseSchemaName` locally and builds the identifier itself before calling `sqlBuilderFor`; both SQL builders take an identifier argument and never read placement off a component. The only readers were tests written against the withdrawn design.

Rejected alternatives:

- _Attach by cloning with a parent pointer_ (the previous D1) — every transform had to repoint both the erased and the typed child maps, producing `attachChildren`'s duck-typed mutation through a `Record<string, unknown>` cast.
- _Mutate `parent` on attach_ — components stop being values; putting the same table in two parents silently rewires the first (Q48).
- _Parent as the context object_ — breaks at depth 2. A schema calls `table.migrations(schema)`; the table calls `index.migrations(table)`; the index needs the schema name and cannot reach it, because the table holds no back-pointer. Passing both is a context object again (Q14).

### D2 — `migrations` is a function on a plain object literal, written by the factory

Each factory builds and returns its own object literal. There is no generic constructor assembling one from a kind, an options bag and a fields bag.

```ts
export const databaseSchemaComponent = (options) => {
  const tables = options.tables ?? {};
  const extensions = options.extensions ?? {};
  const children = [...Object.values(tables), ...Object.values(extensions)];

  const component = {
    [schemaComponentType]: databaseSchemaComponentType,
    schemaName: options.schemaName,
    tables: schemaComponentMap(tables),
    extensions: schemaComponentMap(extensions),
    components: children,
    migrations: (context: SchemaComponentContext = {}) => {
      const scoped = { ...context, databaseSchemaName: options.schemaName };

      return dedupeMigrations([
        sqlMigration(schemaMigrationName(scoped), [
          SQL`${SQLCreateSchema.from({ databaseSchemaName: options.schemaName })}`,
        ]),
        ...(options.migrations?.(scoped) ?? []),
        ...children.flatMap((child) => child.migrations(scoped)),
      ]);
    },
  };

  return component;
};
```

Deleted: `createSchemaComponent`, its `fields` bag, its `context` option, `scopedContext`, the `this: AnySchemaComponent` binding, and the `as unknown as` casts the bag required. `createSchemaComponent` is not public API — `schemaComposition.type.spec.ts:52-53` asserts its absence with `@ts-expect-error` and it appears zero times in `dist` — so removing it breaks no consumer.

One helper survives as shared code, and it does exactly one thing — D4's dedupe:

```ts
dedupeMigrations(migrations: ReadonlyArray<SQLMigration>): ReadonlyArray<SQLMigration>
```

Nothing else is shared. Each factory writes the merge itself, inline in its own `migrations` method, in this order: its own DDL if it emits any, then the caller's `migrations` option, then every child's `migrations(context)`. A factory that extends the context binds the extended value to a local first and hands that same local to both the option and the children.

**There is no declaration concept at all.** No `componentMigrations`, no declaration function held in a local and passed to a helper, no component or child list threaded through one. A factory reads its own `options` and its own children and nothing else. `SchemaComponentDeclaration` is deleted with the rest of it: its only two readers were its own declaration and the `migrations` option on `SchemaComponentOptions`, whose signature is written inline there instead. Naming a one-use function type was what made "the declaration" look like a thing the design had.

Rejected while settling this (Q62): expressing a component's own DDL as an extra child so that `migrations` collapses to a bare `flatMap` over `components`. It works, and it removes the merge entirely, but it puts a member in `components` that the caller never declared — `users.components` becomes `[<create-table emitter>, id, email]` — which breaks what `components` means, breaks the deep-equality assertions that read it, and needs a component kind for the emitter at the same moment D19 deletes the last untyped one.

`migrations` is a **method, not a getter**, and it is **always a function**; a plain array is not accepted and can be added as sugar later.

### D3 — The erased child list is an array, not a keyed record

```ts
components: ReadonlyArray<AnySchemaComponent>
```

Nothing outside the recursion reads it, and the recursion only ever iterates. Making it an array deletes `mergeSchemaComponentMaps`, its duplicate-key throw and the test asserting that throw: a key reused for both a column and an index is no longer a collision — both children are present and both migrate. The typed maps keep their keys, and `schemaComponentMap` stays for them.

Building the list once at construction is what makes it impossible to forget a child map when a kind gains one — the reason the erased list survives at all (D18).

### D4 — Dedupe by name, not by object identity

Duplicate detection keys on migration name. Same name + same SQL collapses; same name + different SQL throws. `haveSameSQL` in `sqlMigration.ts` compares serialised SQL — not the runner's SHA-256 hash, which is async and needs a dialect formatter that `migrations()` does not have.

### D5 — Cross-component references are by name, never by object

A component may reference another (e.g. a projection referencing the read-model table it builds) only by a strongly typed **name**, in the style of foreign keys. Resolution happens against the root at migration time.

### D6 — DDL as dialect-agnostic tokens

A component emits its DDL as SQL tokens; the dialect-aware formatter renders them. `createTableSQL` is already the shared table-DDL builder both dialects call — this changes what it emits, not that it exists.

Deleted as a result:

- `DatabaseMigrationBuilder` and all its plumbing
- `databaseMigrations`, and the four identifier types it defines — `DatabaseIdentifier`, `DatabaseSchemaIdentifier`, `TableIdentifier`, `IndexIdentifier` — which collapse into `SchemaComponentContext`
- `pongoPostgreSQLMigrationBuilder`, `pongoSQLiteMigrationBuilder`, pongo's two `databaseMigrations.ts`, and the `migrationBuilder` option on `pongoDb`
- `postgreSQLTableSQL` / `postgreSQLIndexSQL` / `postgreSQLDatabaseSchemaSQL` as _public migration-building_ functions — their logic moves behind the formatter

Dialect-specific DDL stays possible: the formatter is per-dialect and the token vocabulary is open.

### D7 — A schema always has a name; the default schema is a real schema

`dumboSchema.schema` **requires** a name. There is no unnamed schema component and no schema-less table.

```ts
schemaName: string | SQLDefaultSchemaNameToken   // always present, never undefined
```

- `dumboSchema.schema('crm', { users })` — a named schema.
- `dumboSchema.defaultSchema({ users })` — the default schema, carrying `SQLDefaultSchemaNameToken`.

"No schema" means "the default schema", with exactly one encoding: a schema component carrying the token. The formatter resolves it — no prefix on SQLite, no prefix on Postgres (resolved through `search_path`).

Consequences:

- `SchemaComponentContext.databaseSchemaName` is `string | SQLDefaultSchemaNameToken`. There is no unknown-qualifier state, so the `databaseSchemaName !== undefined` guard at `databaseMigrations.ts:94-97` disappears and with it the silently-dropped table of §1.
- `databaseComponent` gains **no** `tables` map. Dumbo stays schema-aware: a database holds schemas and extensions, nothing else.

**Placement conflicts throw at construction.** A table declaring `databaseSchemaName: 'crm'` put into schema `audit` throws. The check lives in `databaseSchemaComponent`, not in the builders: `pongoSchema.schema` and `dumboSchema.schema` each call the constructor directly rather than routing through one another, so a builder-level check would be two copies with a third door open. `tableComponent` already keeps the equivalent index guard. The duplicate at `pongoDatabaseSchemaComponent.ts:58-65` is deleted.

`databaseSchemaName` on a table is **not** a resolution step. It is declaration-time placement input: `pongoSchema.collection('users', { databaseSchemaName: 'crm' })` exists so the flat `{ collections }` form can say where a collection belongs, and pongo's grouping consumes it before the tree exists.

An index resolves its qualifier from the same threaded context. Indexes are supported on tables only.

### D8 — Schemas are keyed by their own name

The multi-schema form stays a keyed record, and the key must equal the schema's name:

```ts
dumboSchema.database('app', { crm: dumboSchema.schema('crm', { users }) })
```

A key that disagrees with the name throws. The check already exists at `databaseComponent.ts:69-73`; with names mandatory it becomes total rather than firing only when a name happened to be present.

A map key is **never** read as a schema name. The single-schema overload (`dumboSchema.database('app', dumboSchema.schema('crm', {...}))`) derives the key from the name and is the form to prefer when there is one schema.

### D9 — `databaseName` leaves the resolution chain

No migration name uses it and no DDL can: Postgres does not cross-database-qualify `CREATE TABLE`, SQLite has no such concept. Removed from schema components, from migration identifiers, and the `'A database name is required to build migrations'` throw is deleted. `databaseComponent` keeps `databaseName` as metadata for connection and reporting only. `databaseComponent`'s validation of `schema.databaseName` and `databaseSchemaComponent.databaseName` are removed.

The only qualifier ever propagated is the schema name.

### D10 — Migration names mirror what was declared

```
default schema      ->  pongoCollection:users:001:createtable
schema "reporting"  ->  pongoCollection:reporting:users:001:createtable
```

A schema carrying `SQLDefaultSchemaNameToken` contributes **no segment**, so names stay byte-identical to `main` for the default case. The `identifier.databaseSchemaName === defaultSchemaName` comparison in `pongoCollectionMigrationName` is deleted and with it the `defaultSchemaName` parameter — the last place the dialect leaked into naming. `pongo/storage/migrationNames.ts` is deleted; naming moves into dumbo behind a `migrationNamePrefix` option.

**Accepted divergence:** a user explicitly writing the dialect's own default schema name (`databaseSchemaName: 'public'` on Postgres) now yields `pongoCollection:public:users:001:createtable` and will re-run for such a database.

**How wide that divergence turned out, found while implementing S9.** `pongoSchema.db` takes either `collections` or `schemas`, so a definition that wants both an unqualified default schema and named ones has to write `pongoSchema.schema('public', ...)` — and every collection in it takes the segment. The divergence therefore fires for a common definition shape, not only for the user who typed `public` on purpose. It also reaches the runtime: `db.collection('users', { databaseSchemaName: 'public' })` and `db.collection('users')` are now two collections over one physical table. Closing this needs `pongoSchema.defaultSchema` to be usable inside `db({ schemas })`, which needs the default schema's record key settled — open, recorded in todo.md.

**Where the prefix lives is unsettled.** S9 implemented `migrationNamePrefix` as a field on the context a component's migrations are read with, so `pongoDb` names the whole tree. That makes the reader decide what a component is: an event-store extension table inside a pongo database comes out as `pongoCollection:events:001:createtable`. The prefix belongs on the component, set by the factory that built it. Two shapes are on the table — keep `pongoCollection` as a per-component word for byte-compatibility with released databases, or rename to `pongo:users:collection:001:createtable`, namespace then path then kind, which lets the kind come from the component type. A compatibility decision, still open.

### D11 — `defaultSchemaName` is an optional override in `pongoDb`

- **not given** → collections go into `dumboSchema.defaultSchema(...)`, carrying the token. Names unchanged from `main`.
- **given** → an explicit override meaning "put every collection here unless told otherwise". Names carry that segment.

Done in S9 for the naming half. The dialect string tests — `isDefaultSchema` on Postgres, `sqliteTableName` and `sqliteIndexName` on SQLite — deliberately stay, so an explicitly named `public` / `main` still renders as the default schema in SQL and keeps its physical names. Only its migration name diverges.

### D12 — Pongo is sugar over dumbo

`PongoDatabaseComponent` exposes `collections` flat, plus `schemas` when schemas are declared. It adds typed accessors and pongo marker types; it adds no structure dumbo does not have. Pongo owns the collection-to-schema mapping: it creates the default schema when none is given, and adds a named schema alongside it when a collection declares its own `databaseSchemaName`.

Of pongo's three marker symbols, only `pongoCollectionComponentType` has a production reader once D6 deletes pongo's migration builders — `pongoDb.ts:255`. `pongoSchemaComponentType`, `pongoDatabaseComponentType`, `isPongoSchemaComponent`, `isPongoDatabaseComponent` and `withValue` are deleted; any surviving discrimination is a type-level brand, never a value on the component.

### D13 — Adding a collection normalises into the tree

`db.collection('users', { databaseSchemaName: 'readmodels' })` does not build a detached table. It get-or-creates the `readmodels` schema component, puts the table into it and swaps in a new database component — the mechanism `pongoDb.ts:276-281` already implements as `withTable`. `CREATE SCHEMA` therefore comes from the schema component as usual.

This makes the database component an immutable value behind a mutable holder, and `db.schema.migrate()` reads `databaseComponent.migrations()` at call time.

`composePongoDatabase` is deleted. `pongoSchema.db` already returns a real `databaseComponent` in both branches; in the `{ schemas }` form the composer takes it apart and rebuilds identical copies, and in the `{ collections }` form `pongoSchema.db` builds `schemas: {}` and stashes raw collections via `withValue` purely so the composer can group them later. D11 and this decision remove its reason to exist.

### D14 — Ordering

A collection added after `db.schema.migrate()` has run migrates its own component on first use. All migrations are idempotent and the runner already skips what was applied by name and hash, so a re-run is harmless.

### D15 — An extension has the same shape as a database

`extensionComponent` stops being an opaque bag of components and becomes a composable _fragment of a database_: `schemas`, `extensions`, `migrations`. `databaseComponent` merges extension-contributed schemas into `schemas`.

```ts
const eventStore = extensionComponent('emmett:eventStore', {
  schemas: {
    emt: dumboSchema.schema('emt', { messages }),
    readmodels: dumboSchema.schema('readmodels', { users }),
  },
});

const db = databaseComponent({ extensions: { eventStore } });
db.schemas.readmodels.tables.users; // typed, plain record intersection
```

Typing is a record intersection — no inference over nested component maps.

Placement rules:

- **Extension on a schema** → its children migrate with that schema's context; a child declaring a different schema throws.
- **Extension on the database** → its children keep their own schemas. A table directly inside a database-level extension migrates under the default schema rather than being dropped, which fixes the §1 bug.

Two schema components sharing a key merge (union of their tables); a duplicate table name within a schema still throws.

### D16 — `logicalSchemaMapping` is deleted

`assertLogicalSchemaMapping` rejects one physical table name reused across logical schemas, registered as SQLite's `validateComponent`. It is unreachable dead weight: `sqliteTableName` already maps every non-default schema to a distinct physical name, and both DDL and DML go through it (`databaseObjectSQL.ts:14-15`, `pongo/storage/sqlite/sqlite3/index.ts:51`, `pongo/storage/sqlite/d1/index.ts:52`). Its own fixture — `public.users` alongside `audit.users` — maps to two distinct SQLite tables.

Deleted: `logicalSchemaMapping.ts` entirely (`collectLogicalSchemaCollisions`, `assertLogicalSchemaMapping`, `assertLogicalSchemaComponentMapping`, `LogicalSchemaCollision`, the `SchemaView`/`TableView` casts), `validateLogicalSchemaMapping` in `sqlite/core/schema/migrations.ts`, and `logicalSchemaMapping.unit.spec.ts`.

That leaves `findComponents`, `findComponent` and `SchemaComponentPredicate` with **zero production callers**, so they go too. The erased child list stops being a publicly walkable API.

`assertNativeName` **stays** — it is what actually keeps the physical-name mapping injective.

### D17 — The SQLite physical-name mapping uses the logical name

Today: `dumbo_` plus `_`-doubling escapes, e.g. `crm.users` → `dumbo_crm_table_users`. That reserves the entire `dumbo_` prefix in the default schema and produces unreadable names for any identifier containing an underscore.

SQLite quoted identifiers accept `.`, so the physical name becomes the logical name:

```
default schema  ->  "users"
schema "crm"    ->  "crm.users"
index in "crm"  ->  "crm.users_email_idx"
```

Injective without escaping, readable in the sqlite shell, and it reserves only "a default-schema identifier containing a dot" instead of a whole prefix — which `assertNativeName` enforces in place of the prefix check.

**Accepted break:** this renames existing SQLite tables in non-default schemas. Databases using only the default schema are unaffected — which is every database that never set `defaultSchemaName` or a per-collection `databaseSchemaName`.

### D18 — Context is one flat type

```ts
export type SchemaComponentContext = Readonly<{
  databaseSchemaName?: string | SQLDefaultSchemaNameToken;
  tableName?: string;
}>;
```

Fields are optional because a database has no schema name yet and a schema has no table name. A column therefore carries two fields it never reads — an accepted cost.

The alternative — a generic context each component extends, so a table sees `databaseSchemaName` as present and typed — is better typed but collapses to `unknown` the moment it crosses the erased child list. Making it work requires each kind to recurse over its own typed maps, and that is **rejected** (Q58): if a kind later gains a child map and someone forgets to add it to `migrations`, those children silently never migrate. One list built at construction cannot be forgotten.

### D19 — The migration table is a real table component

`migrationTableComponentFor` hand-writes `CREATE TABLE IF NOT EXISTS` with `AutoIncrement`/`Varchar`/`Timestamp` column tokens through the generic `schemaComponent()` bag — its only production caller. Under D6 it becomes a real `tableComponent` in a real schema, emitting its DDL the same way every other table does.

Deleted: `schemaComponent()`, `genericComponentType`, and with them the last untyped component kind.

### D20 — Dead capability flags are removed

`supportsSchemas` and `supportsFunctions` are declared in `DatabaseCapabilities` and set in both metadata objects, and read nowhere. Both are deleted. `supportsMultipleDatabases` is read at `pongoDatabaseCache.ts:89` and stays.

### Deliberately not touched

`InferColumnType`, `TableColumnType`, `InferTableRow`, `InferSchemaTables` and `InferDatabaseSchemas` in `tableTypesInference.ts` have zero consumers but reach the public barrel, so they may be deliberate user-facing API. Left alone.

## 4. Ground rules for implementation

See `plan.md` for the steps and `todo.md` for state.

- Test-first. Build, linter and tests green before moving on.
- **Redundant concepts are deleted as early as their dependents allow.** A step that only adds machinery is a smell; every step should end with less than it started with, or say plainly why not.
- No step may leave the repo red for longer than itself. Where a deletion would strand a large test surface, the step that deletes the concept also rewrites those tests.
- After each step, a review gate checks two things: no new abstraction was introduced, and no deleted concept left a hacked-around remnant. A remnant is what makes the implementation drift from this spec.

## 5. Testing

Every phase ships unit, integration and end-to-end coverage; nothing is marked "not applicable".

**Test names describe the use case, not the implementation.** A name states what someone using the library can rely on, in their vocabulary, and must still read correctly after the implementation is rewritten. "declaring the same migration in two places applies it once" is a use case; "collapses two structurally identical migrations built separately" is our internals leaking.

Specifically required:

- **Migration name back-compat:** a golden test asserting a default-schema pongo collection still produces `pongoCollection:users:001:createtable`, byte-identical to `main`.
- **Default token resolution:** the same tree renders unqualified DDL under both formatters; a named schema renders qualified under Postgres and dot-mapped under SQLite.
- **Reuse:** the same table definition put into two schemas yields correct SQL for both, and the definition itself is unchanged — asserted by object identity, since nothing clones.
- **Placement is not readable off a component:** asserted structurally, because a reintroduced back-pointer would silently reintroduce cloning.
- **Dedupe:** identical name + identical SQL collapses; identical name + different SQL throws.
- **Database-level extension:** its tables produce `CREATE TABLE` under the default schema — regression test for the §1 silent drop.
- **Schema merge:** two extensions contributing the same schema key merge their tables; a duplicate table name within a schema throws.
- **Required schema name:** `dumboSchema.schema({ tables })` does not compile; `dumboSchema.defaultSchema({ tables })` does.
- **Key/name disagreement:** `{ crm: dumboSchema.schema('audit', {...}) }` throws.
- **SQLite name mapping:** `crm.users` maps to `"crm.users"`; a default-schema table named `a.b` is rejected.
- **Migration table:** the migration table's own DDL is byte-identical to `main`'s.
- **Ad-hoc collection:** `db.collection('users', { databaseSchemaName: 'readmodels' })` emits `CREATE SCHEMA readmodels` before its `CREATE TABLE`, and re-running is a no-op.
- **Late collection:** a collection added after `migrate()` migrates itself on first use.

## 6. Accepted risks

- Explicitly declaring the dialect's default schema name changes the migration name and re-runs that migration (D10).
- The SQLite physical-name mapping change renames tables in non-default schemas (D17).
- A component cannot report its placement (D1). If a future consumer needs it, the answer is to pass context at the call site, not to reintroduce a back-pointer.
- Moving DDL behind the formatter is the largest single piece of work and gates the pongo phases.
