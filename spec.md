# Spec: Self-contained schema components and migration resolution

Branch: `schema_features`
Status: agreed design, ready for implementation

## 1. Problem

The `schema_features` branch made schema components ("nodes" of the database structure: database, schema, table, column, index, extension) strongly typed and database-agnostic. Migration resolution did not keep up, and now exists twice:

- `migrationsFor` in `src/packages/dumbo/src/core/schema/schemaComponent.ts` — walks the component tree collecting *declared* migrations, with no naming context.
- `databaseMigrations` in `src/packages/dumbo/src/core/schema/components/databaseMigrations.ts` — walks the same tree again, collecting declared migrations *plus* builder-generated DDL, threading a widening `Identifier` (`databaseName` → `+databaseSchemaName` → `+tableName` → `+indexName`) down as it goes.

Both walks maintain their own `visited` set and their own duplicate-name check. The complexity concentrates in `identify`, which has to decide, per component, whether the schema name comes from the component itself, from the parent map key, from the parent's `schemaName`, or is unknown — and bail out when it can't tell.

Root causes:

1. **A component doesn't know where it lives.** A table is defined before it is attached to a schema, so at definition time its schema qualifier is unknown. The identifier has to be reconstructed top-down on every traversal.
2. **A component can't emit its own DDL.** The tree is deliberately dialect-agnostic, so `CREATE TABLE` comes from a per-storage `DatabaseMigrationBuilder` passed in from outside. That makes `component.migrations` structurally incapable of being complete, which is precisely why the second traversal exists.
3. **`databaseName` is threaded everywhere and used nowhere.**

Consequences visible today: a table inside a database-level extension is silently dropped (the `'databaseSchemaName' in identifier` guard in `databaseMigrations.ts:139-146` fails, so no `CREATE TABLE` is emitted); `pongoCollectionMigrationName` needs the dialect's default schema name just to strip it back out again.

## 2. Goal

A schema component is a **self-contained value**. `component.migrations` returns that component's own migrations plus its children's, recursively — no visitor, no builder argument, no identifier threading. Everything a component cannot know at definition time is either resolved when it is attached to a parent, or deferred to the dialect-aware formatter at execution time.

### Non-goals

- No new dialect features (pgvector, PostGIS). The DDL token vocabulary must leave room for a dialect to contribute its own tokens, but only what dumbo has today gets implemented.
- No behavioural change to the migration runner itself (it already dedupes by name and hash).

## 3. Design decisions

### D1 — Attach by cloning (option B)

When a component is attached to a parent, the parent produces a **requalified clone**; the original stays untouched and reusable.

Rejected alternatives:
- *Mutate on attach* — components stop being values; attaching the same table twice silently rewires the first parent.
- *Attach at construction* (definition is a function the parent applies) — every standalone use needs a terminal `users({})` call and every signature has to distinguish definition from component. Rejected as tedious and inaccessible.

A clone cannot be a bare spread: the clone's schema qualifier differs, so both its DDL **and** its migration name differ and must be recomputed. Each component type therefore exposes a one-line requalifier that re-invokes its own factory:

| Component | Requalifier | Requalifies |
|---|---|---|
| table | `withDatabaseSchema(schemaName)` | its indexes |
| index | `withTable(schemaName, tableName)` | — |
| column | *none* — no qualifier of its own; rendered inside `CREATE TABLE`; user-declared migrations are opaque SQL | — |
| extension | `withDatabaseSchema(schemaName)` | its children, generically |
| database schema | — (it is the qualifier) | its tables and extensions |

The extension case is the only one needing a generic recursive helper, since it holds an arbitrary component map. That is one base-level function, not a visitor with an `identify`.

### D2 — Components become plain frozen objects

`createSchemaComponent`'s `Object.defineProperties` construction (enumerable value props, a non-enumerable `schemaComponentState` holding `localMigrations`, and an enumerable `migrations` getter) exists only to serve the lazy getter and hidden local-migration list. Both disappear. Components become plain frozen object literals, which also makes them safe to inspect, log and shallow-copy.

`localMigrationsOf` and the `schemaComponentState` symbol are deleted. Declared migrations live in a plain field; `migrations` is the recursive composition of that field and the children's.

### D3 — Dedupe by name, not by object identity

Both current walks compare with `visited.has(component)` and `previous !== migration`. Cloning breaks reference equality, so duplicate detection keys on `(component path, migration name)`. Two migrations with the same name and the same SQL collapse; the same name with different SQL still throws.

### D4 — Cross-component references are by name, never by object

A component may reference another (e.g. a projection referencing the read-model table it builds) only by a strongly typed **name**, in the same style as foreign keys. Resolution happens against the root at migration time. Holding an object reference would alias against the requalified clone and silently emit SQL for the wrong identifier.

### D5 — DDL as dialect-agnostic tokens (option i)

A component emits its DDL as SQL tokens; the dialect-aware formatter renders them. `SQLDefaultSchemaNameToken` — currently declared in `sqlToken.ts:71-74` and consumed nowhere — becomes the value of an unresolved schema qualifier and is resolved by the formatter at execution time.

Deleted as a result:
- `DatabaseMigrationBuilder` (type and all plumbing)
- `databaseMigrations`
- `pongoPostgreSQLMigrationBuilder`, `pongoSQLiteMigrationBuilder`
- `postgreSQLTableSQL` / `postgreSQLIndexSQL` / `postgreSQLDatabaseSchemaSQL` as *public migration-building* functions — their logic moves behind the formatter.

Dialect-specific DDL stays possible: the formatter is per-dialect, and the token vocabulary is open so a dialect can add its own tokens and typing later.

### D6 — A table's schema qualifier

Resolution order, decided at construction/attach time:

1. `databaseSchemaName` declared on the component → use it.
2. Otherwise, the schema it was attached to (via D1 clone) → use that name.
3. Otherwise → `SQLDefaultSchemaNameToken`, resolved by the formatter.

Existing conflict checks stay: a child declaring a schema different from its parent's throws.

### D7 — `databaseName` leaves the resolution chain

No migration name uses it, and no DDL can: Postgres does not cross-database-qualify `CREATE TABLE`, SQLite has no such concept. Removed from schema components, from migration identifiers, and the `'A database name is required to build migrations'` throw is deleted. `databaseComponent` keeps `databaseName` as metadata for connection and reporting only. `databaseComponent`'s validation of `schema.databaseName` and `databaseSchemaComponent.databaseName` are removed.

The only qualifier ever propagated is the schema name.

### D8 — Migration names mirror what was declared

```
no schema declared/attached  ->  pongoCollection:users:001:createtable
schema "reporting"           ->  pongoCollection:reporting:users:001:createtable
```

The `identifier.databaseSchemaName === defaultSchemaName` comparison in `pongoCollectionMigrationName` is deleted, and with it the `defaultSchemaName` parameter — the last place the dialect leaked into naming.

**Back-compat:** names stay byte-identical to `main` for the default case *only because* of D9. The one accepted divergence is a user explicitly writing the dialect's own default schema name (`databaseSchemaName: 'public'` on Postgres): that now yields `pongoCollection:public:users:001:createtable` and will re-run for such a database. Accepted.

### D9 — `defaultSchemaName` becomes optional in `pongoDb`

Today `pongoDb.ts:100` resolves `defaultSchemaName` eagerly and `pongoDb.ts:251` uses it as the fallback, so every collection lands in a schema component literally named `public` on Postgres. With D8 that would rename every existing migration.

New behaviour:
- `defaultSchemaName` **not given** → collections go into an *unnamed* default schema component whose qualifier is `SQLDefaultSchemaNameToken`. Names unchanged from `main`.
- `defaultSchemaName` **given** → an explicit override meaning "put every collection here unless told otherwise". Names carry that segment.

### D10 — Adding a collection normalises into the tree

`db.collection('users', { databaseSchemaName: 'readmodels' })` does not build a detached table. It get-or-creates the `readmodels` schema component, clones the table into it, and swaps in a new database component — the mechanism `pongoDb.ts:276-281` already implements as `withTable`. `CREATE SCHEMA` therefore comes from the schema component as usual; no table-level ensure-schema rule is needed.

This makes the database component an immutable value behind a mutable holder, and `db.schema.migrate()` reads `databaseComponent.migrations` at call time — the laziness the refactor was after.

`mergeSchemaComponentMaps` must allow **merging** two schema components sharing an alias (union of their tables) while still throwing on duplicate *table* names within a schema.

### D11 — Ordering

A collection added after `db.schema.migrate()` has run migrates its own component on first use. All migrations are written idempotently, and the runner already skips what was applied by name and hash, so a re-run is harmless.

### D12 — An extension has the same shape as a database

`extensionComponent` stops being an opaque bag of components and becomes a composable *fragment of a database*: `schemas`, `extensions`, `migrations`. `databaseComponent` merges extension-contributed schemas into `schemas`.

```ts
const eventStore = extensionComponent('emmett:eventStore', {
  schemas: {
    emt:        databaseSchemaComponent({ tables: { messages } }),
    readmodels: databaseSchemaComponent({ tables: { users } }),
  },
});

const db = databaseComponent({ extensions: { eventStore } });
db.schemas.readmodels.tables.users;   // typed, plain record merge
```

Typing is a record intersection — no inference over nested component maps. Because a real schema component exists, `CREATE SCHEMA readmodels` is emitted with no implicit-creation rule.

Placement rules:
- **Extension on a schema** → requalified with that schema name; a child declaring a different schema throws.
- **Extension on the database** → no requalification; each child keeps its declared schema or falls back to the default token. This also fixes the current silent drop.

Extensions are produced by factories over user options (emmett registers projections as `projections?: ProjectionRegistration<...>[]`), each projection contributing its table into whichever schema it names.

## 4. Work plan

Rules for every phase: test-first; build, linter and tests green before moving on; no phase may leave the repo broken for long. Tasks are executed through subagents.

### Phase 1 — Component core (sequential)
Plain frozen components (D2), recursive `migrations` (Goal), name-based dedupe (D3). Delete `schemaComponentState`, `localMigrationsOf`, `migrationsFor`.
*Green state:* declared migrations still compose; `databaseMigrations` temporarily still works on top.

### Phase 2 — Requalification (parallel per component type, after Phase 1)
`withDatabaseSchema` / `withTable` one-liners and the generic extension recursion (D1, D6). Table, index and extension can be done concurrently by separate subagents; the generic base helper lands first.

### Phase 3 — Drop `databaseName` (sequential, after Phase 2)
D7 across dumbo and pongo, including the removed validations and the removed throw.

### Phase 4 — DDL tokens and formatters (parallel: token vocabulary, then pg and SQLite formatters concurrently)
D5 and the `SQLDefaultSchemaNameToken` resolution. Delete `DatabaseMigrationBuilder`, `databaseMigrations` and both per-storage builders once both formatters pass.

### Phase 5 — Naming and `pongoDb` (sequential, after Phase 4)
D8, D9, D10, D11. This is the phase where back-compat is proven.

### Phase 6 — Extension as database fragment (sequential, after Phase 5)
D12, including the `mergeSchemaComponentMaps` merge semantics.

### Phase 7 — Event-store example (last)
A concrete event-store-shaped extension in this repo: a `messages` table in its own schema plus projection-contributed read-model tables in another, composed into a `pongoDb` and exercised end to end. It doubles as verification that the concept carries emmett's case, and is written so it can later move into emmett.

## 5. Testing

Every phase ships unit, integration and end-to-end coverage; nothing is marked "not applicable". Specifically required:

- **Migration name back-compat:** a golden test asserting that a default-schema pongo collection still produces `pongoCollection:users:001:createtable`, byte-identical to `main`.
- **Default token resolution:** the same component tree renders `public`-qualified DDL under the Postgres formatter and unqualified under SQLite.
- **Clone semantics:** attaching a table to a schema leaves the original untouched; the clone carries the new qualifier, requalified indexes and recomputed migration names.
- **Reuse:** the same table definition attached to two schemas yields two independent, correctly qualified components.
- **Dedupe:** identical migration name + identical SQL collapses; identical name + different SQL throws.
- **Database-level extension:** its tables now produce `CREATE TABLE` (regression test for the current silent drop).
- **Schema merge:** two extensions contributing the same schema alias merge their tables; a duplicate table name within a schema throws.
- **Ad-hoc collection:** `db.collection('users', { databaseSchemaName: 'readmodels' })` emits `CREATE SCHEMA readmodels` before its `CREATE TABLE`, and re-running is a no-op.
- **Late collection:** a collection added after `migrate()` migrates itself on first use.

## 6. Accepted risks

- Explicitly declaring the dialect's default schema name changes the migration name and re-runs that migration (D8).
- The clone and its original can drift if a caller holds the pre-attach object and reads `.migrations` from it. Mitigated by name-based references (D4) and by the public API always handing back the attached component.
- Moving DDL behind the formatter is the largest single piece of work in the plan and gates Phases 5-7.
