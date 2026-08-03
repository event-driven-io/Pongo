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

### D1 — Attach by cloning with a parent pointer

When a component is attached to a parent, the parent produces a **clone carrying a `parent` reference**; the original stays untouched and reusable.

Rejected alternatives:
- *Mutate on attach* — components stop being values; attaching the same table twice silently rewires the first parent. Also requires the parent to know every child kind it must stamp.
- *Attach at construction* (definition is a function the parent applies) — every standalone use needs a terminal `users({})` call and every signature has to distinguish definition from component. Rejected as tedious and inaccessible (Q7).
- *Per-kind requalifiers re-invoking each factory* (`withDatabaseSchema` on table, `withTable` on index, plus a capability-sniffing generic map) — rejected as recreating the traversal maze it was meant to remove (Q18–Q19).
- *Resolve-at-read, passing context down through the getter* — rejected for the same reason (Q18).

The clone is one generic recursive function. It needs no knowledge of component kinds:

```ts
const withParent = (component, parent) => {
  const clone = { ...component, parent };
  clone.components = Object.freeze(
    mapValues(component.components, (c) => withParent(c, clone)),
  );
  return Object.freeze(clone);
};
```

`parent` is assigned once during construction — the clone must exist before its children can point at it — and the object is frozen immediately after. The original is never touched and nothing can observe a half-built clone, so a mutable field yields an immutable value.

Reparenting is recursive because grandchildren go stale otherwise: a bare spread gives the table clone a correct `parent`, but its index still points at the original, unparented table. Indexes stay independent components — they are separate statements and can be altered on their own (Q21) — so they must be reparented, not absorbed into the table's DDL.

**Attaching is not something schemas do to tables; it is what every component does to its own children.** `createSchemaComponent` runs its `components` through `withParent` at construction, so a table attaches its indexes exactly as a schema attaches its tables:

```ts
component.components = Object.freeze(
  mapValues(options.components ?? {}, (c) => withParent(c, component)),
);
```

Without this, an unattached table's index has no parent at all and resolves its table name to `undefined` — verified by dry run before implementation (Q29). There is therefore no per-kind attach step to write anywhere.

Each kind exposes a named accessor over the generic field, one line each, so authoring code reads properly (Q23–Q24):

```ts
// indexComponent
table() { return this.parent; }
// tableComponent
schema() { return this.parent; }
```

An index resolves its qualifier as `this.table()?.schema()?.schemaName`. `withParent` never needs to know which kind it is cloning.

**No accessor properties anywhere.** `{ ...component }` *invokes* getters and stores their values, so a single surviving getter would be silently frozen at the original's parent — a wrong migration, not an error. Every member is a plain data property; the ones that compute are functions (Q25, Q27). Descriptor-copying the clone (`Object.getOwnPropertyDescriptors`) would preserve getters, but was rejected as clever-over-simple for the sake of two one-line accessors (Q25).

### D2 — Components are plain frozen objects and `migrations` is a function

`createSchemaComponent`'s `Object.defineProperties` construction (enumerable value props and a non-enumerable `schemaComponentState` holding `localMigrations`) disappears. Components become plain frozen object literals, safe to inspect, log and shallow-copy — which is what makes `withParent` a spread.

Laziness is not the problem; the tree traversal is (Q17). Resolution stays deferred, and does exactly what was asked for in A3 — "take my migrations and add migrations of my children":

```ts
migrations() {
  return [
    ...(options.migrations?.(this) ?? []),
    ...Object.values(this.components).flatMap((c) => c.migrations()),
  ];
}
```

`migrations` is a **method, not a getter** (D1, Q26–Q27): read sites gain `()` but the spread stays honest. It must resolve through `this`, never through the `component` binding captured by the factory closure — the captured-binding variant compiles, runs, and silently emits unqualified SQL for every clone (verified by dry run, Q29).

**No property is added to carry the declaration.** The function passed as `options.migrations` stays in the factory closure; the component exposes exactly one `migrations` member (Q28). It is **always a function** of the component; a plain array is not accepted for now and can be added as sugar later (Q22). Because it runs at read time against an already-parented clone, it sees the correct qualifier — which is why nothing has to rewrite SQL at attach time.

Hand-written migrations use the same reference tokens as generated ones (Q16), so they resolve in the formatter too and need no special handling.

Deleted: `migrationsFor`, both `visited` sets, the `schemaComponentState` symbol, `InternalSchemaComponent`, `localMigrationsOf`, and the `declaredMigrations` field currently declared on `SchemaComponent` at `schemaComponent.ts:17` and never assigned. A component does **not** retain its own migrations as data. Nothing is added in their place.

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

Resolution order, evaluated when `migrations()` is called:

1. `databaseSchemaName` declared on the component → use it.
2. Otherwise, `this.schema()?.schemaName` reached through the D1 parent pointer → use that name.
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
Plain frozen components with `migrations` as a method composing own-plus-children (D2), name-based dedupe (D3). Delete `schemaComponentState`, `InternalSchemaComponent`, `localMigrationsOf`, `migrationsFor` and the unassigned `declaredMigrations` field.
*Green state:* declared migrations still compose; `databaseMigrations` temporarily still works on top.

### Phase 2 — Parent pointers (sequential, after Phase 1)
The generic `withParent` clone applied by the factory to its own children, the per-kind named accessors, and qualifier resolution through the chain (D1, D6). One base helper, then one line per kind — no per-component requalifiers and no per-kind attach step.

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
- **Clone semantics:** attaching a table to a schema leaves the original untouched; the clone carries the parent pointer, reparented indexes and recomputed migration names.
- **Grandchild reparenting:** an index under a cloned table resolves `this.table().schema().schemaName` to the *new* schema, never the original's.
- **Self-attachment:** an *unattached* table's index still resolves its own table — the factory attaches children, so no component is ever built with dangling grandchildren.
- **No accessors:** no component exposes an accessor property; asserted structurally, because a stray getter breaks the clone silently rather than loudly.
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
