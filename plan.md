# Plan: Self-contained schema components

Implements [spec.md](spec.md). State lives in [todo.md](todo.md). Everything ships in **one PR**; there is no follow-up work.

## Ground rules

Every step, without exception:

1. **Test-first.** Write the failing test, run it, confirm it fails for the stated reason, then implement.
2. **Name tests from the usage perspective.** A name states what someone using the library can rely on, in their vocabulary, and must survive the implementation being rewritten. If it mentions a private symbol, a data structure or a call site, it is wrong.
3. **Gate**, run from `/home/oskar/Repos/Pongo/src`: `npm run build:ts` → `npm run fix` → `npm run test:unit`, plus `test:int` / `test:e2e` where the step says so. Never `npm run build`. Never assume a failure predates the step — verify.
4. **Review gate R.** Two questions: was a new abstraction introduced, and did a deleted concept leave a remnant that had to be hacked around? Either answer means STOP, summarise for Oskar, agree what to drop. A remnant is what makes the implementation drift from the spec.
5. **Net source lines must not grow** unless the step says up front that it will, and why.
6. **Nothing is committed.** Oskar handles git.

## Why this order

Steps 1–4 are deletions with no design risk: they retire concepts the spec has already ruled out, and shrink the surface every later step has to move through. Redundant concepts die as early as their dependents allow.

Steps 5–6 change the component API. Steps 7–10 move DDL behind the formatter — the largest piece, and the gate for everything in pongo. Steps 11–15 are pongo. Steps 16–17 close out.

One non-obvious sequencing decision: **the DDL tokens land before the components emit them** (S7–S8 before S9). That keeps every existing test green while the risky part — two dialects rendering the same tokens — is proven in isolation.

Red time is bounded per step: any step whose deletion strands tests rewrites those tests inside the same step.

## Current state

The working tree holds a partial implementation of the context-threading design: `parent`, `withParent` and `attachChildren` are gone, `createSchemaComponent` carries a `context` option, and `databaseMigrations.ts` threads two identifiers by hand as scaffolding. **Production compiles; the spec files do not.** S1 closes that.

---

## S1 — Retire placement-reading tests, restore the placement throw

```text
The build is red only in spec files. Every error asserts `parent`, `clone`,
`table.schema()` or `index.table()` — the API spec D1 removes permanently.

Delete, don't repair:
- `schemaComponent.unit.spec.ts`, describe `placing a component under a parent`
  (clone/parent-identity) and describe `resolving the schema a component
  belongs to` (`.schema()` / `.table()`)
- the `.schema()` assertions in `pongoDatabaseSchemaComponent.unit.spec.ts` and
  `pongoDb.unit.spec.ts`

Do NOT replace a `.schema()` assertion with one on the parent's map key. That
tests the map, not the component, and makes a weaker claim.

Keep and make pass — these assert spec D7's placement rule, which survives:
- `rejects declaring a collection for one schema and putting it in another`
- `rejects placing an index under a table other than its constraint`
- `rejects placing an index under a schema other than its constraint`
- `rejects placing a schema under a database other than its constraint`

The throw currently fails with "Missing expected exception" because
`resolveDatabaseSchemaName` was deleted with the parent chain. Restore it in
`databaseSchemaComponent`'s constructor — one loop over `tables`, same message
shape as `tableComponent`'s index guard. Delete the duplicate at
`pongoDatabaseSchemaComponent.ts:58-65`.

Gate: build, fix, unit. Expect fully green.
```

## S2 — Dead-code sweep

```text
Pure deletion, no behaviour change. Spec D16 and D20.

Delete `core/schema/components/logicalSchemaMapping.ts` in full:
`collectLogicalSchemaCollisions`, `assertLogicalSchemaMapping`,
`assertLogicalSchemaComponentMapping`, `LogicalSchemaCollision`, and the
`SchemaView` / `TableView` casts.

It is unreachable: `sqliteTableName` already maps every non-default schema to a
distinct physical name, and both DDL and DML go through it. Its own fixture
(`public.users` beside `audit.users`) maps to two distinct SQLite tables.
Prove that first with a test asserting the two mapped names differ, then delete
the test along with the concept and record that in todo.md.

Cascade:
- `validateLogicalSchemaMapping` in `storage/sqlite/core/schema/migrations.ts`,
  and `logicalSchemaMapping.unit.spec.ts`
- `findComponents`, `findComponent`, `SchemaComponentPredicate` — zero
  production callers once the above goes. Rewrite the pongo `sqlBuilder` specs
  that use `findComponents(database, isPongoCollectionComponent)[0]` to reach
  the collection through the typed maps.
- the 4 collision tests at `schemaComponent.unit.spec.ts:1008-1097`
- `supportsSchemas` and `supportsFunctions` from `DatabaseCapabilities` and both
  metadata objects. Keep `supportsMultipleDatabases` — read at
  `pongoDatabaseCache.ts:89`.

`assertNativeName` STAYS. It is what actually keeps the mapping injective.

Gate: build, fix, unit, int.
```

## S3 — The erased child list becomes an array

```text
Spec D3. `components` changes from `Readonly<Record<string, AnySchemaComponent>>`
to `ReadonlyArray<AnySchemaComponent>`.

Nothing outside the recursion reads it after S2, and the recursion only
iterates. Each factory builds it as
`[...Object.values(tables), ...Object.values(extensions)]`.

Delete `mergeSchemaComponentMaps` and its duplicate-key throw. A key reused for
both a column and an index stops being a collision — both children are present
and both migrate. Delete the test asserting that throw, record it in todo.md,
and do not replace it.

`schemaComponentMap` stays: the typed maps are user-facing and keyed.

Gate: build, fix, unit.
```

## S4 — The factory owns its literal

```text
Spec D2. Delete `createSchemaComponent`, its `fields` bag, its `context`
option, `scopedContext`, and `Object.freeze` on the component itself.

Each of the six factories — database, databaseSchema, table, index, column,
extension — builds and returns its own object literal, naming `component` in
the closure so `this` is never needed:

  const component = {
    [schemaComponentType]: kind,
    ...own fields...,
    components: children,
    migrations: (context = {}) =>
      componentMigrations(component, children, { ...context, ...whatIKnow }),
  };
  return component;

`componentMigrations(component, children, context)` is the ONE piece of shared
code: run the declaration, then every child's `migrations(context)`, dedupe by
name (spec D4). Module-private to `schemaComponent.ts`.

Only `databaseSchemaComponent` and `tableComponent` extend the context — with
`databaseSchemaName` and `tableName`. `databaseComponent` extends nothing once
S5 lands; until then it may still pass `databaseName`.

`createSchemaComponent` is not public API — `schemaComposition.type.spec.ts:52-53`
asserts its absence with `@ts-expect-error`. Expect the `as unknown as` casts to
fall away with the bag; `columnSchemaComponent`'s may survive because of its
conditional return type.

Gate: build, fix, unit.
```

## S5 — Drop `databaseName` from the chain

```text
Spec D9.

Delete: `databaseName` from `DatabaseSchemaComponent` and its options; the
cross-database validation at `databaseComponent.ts:59-68` (keep the record-key
check); `databaseName` from every identifier type; the
'A database name is required to build migrations' throw; `databaseName` from
`pongoDb.ts`'s identifier and from `withTable.ts`.

`databaseComponent.databaseName` stays as connection and reporting metadata.

Test first: a type spec proving `databaseSchemaComponent` no longer accepts
`databaseName`, and a test that migrations are identical with and without a
database name.

Gate: build, fix, unit, int.
```

## S6 — Schema names are required; `defaultSchema` exists

```text
Spec D7 and D8. The largest API change in the plan.

- `schemaName: string | SQLDefaultSchemaNameToken` — always present
- `dumboSchema.schema(name, tables, extensions?)` — the nameless overload is
  DELETED, likewise for `pongoSchema.schema`
- `dumboSchema.defaultSchema(tables, extensions?)` — new, carries the token
- `SchemaComponentContext.databaseSchemaName` becomes
  `string | SQLDefaultSchemaNameToken`
- the key-vs-name check at `databaseComponent.ts:69-73` becomes total

Test first:
- `dumboSchema.schema({ tables })` does not compile (`@ts-expect-error`)
- `dumboSchema.defaultSchema({ tables })` does
- `{ crm: dumboSchema.schema('audit', {...}) }` throws
- a schema carrying the token contributes no segment to a migration name

This touches every fixture that built a nameless schema. Rewrite them here — do
not leave them for a later sweep.

Gate: build, fix, unit, int.
```

## S7 — `SQLTableReference` and `SQLCreateSchema` tokens

```text
Spec D6, part 1.

Read the existing processor registry FIRST. Do not add a second dispatch
mechanism.

Tokens in `core/sql/tokens/sqlToken.ts`, processors registered per dialect.
`postgreSQLTableReference`, `sqliteTableReference` and
`postgreSQLDatabaseSchemaSQL` emit tokens instead of strings.

Test first, both dialects: qualified reference, default-token reference,
explicitly-`public` reference on Postgres, create-schema.

Gate: build, fix, unit.
```

## S8 — `SQLIndexReference` and JSON target tokens

```text
Spec D6, part 2.

`SQLIndexReference`, `SQLJSONDocumentIndexTarget`, `SQLJSONPathTarget` plus
processors. `postgreSQLIndexSQL` / `sqliteIndexSQL` rebuilt on tokens.

If the two bodies come out identical, hoist to core and delete both.

Test first, both dialects: reference, GIN vs plain, path extraction, unique,
multi-column, custom `sql` callback.

Gate: build, fix, unit.
```

## S9 — Components emit their own DDL

```text
Spec D6, part 3. The step the whole plan exists for.

`tableComponent`, `indexComponent` and `databaseSchemaComponent` emit their own
create-table / create-index / create-schema from their own `migrations`
function, reading the threaded context for the qualifier. `createTableSQL` is
already the shared table-DDL builder both dialects call — change what it emits,
do not add a parallel one.

Delete:
- `core/schema/components/databaseMigrations.ts`
- `DatabaseMigrationBuilder`
- `DatabaseIdentifier`, `DatabaseSchemaIdentifier`, `TableIdentifier`,
  `IndexIdentifier` — they collapse into `SchemaComponentContext`
- `postgreSQLTableSQL`, `postgreSQLIndexSQL`, `postgreSQLDatabaseSchemaSQL`,
  `sqliteTableSQL`, `sqliteIndexSQL` as public migration builders
- pongo's two `databaseMigrations.ts`, `pongoPostgreSQLMigrationBuilder`,
  `pongoSQLiteMigrationBuilder`, and the `migrationBuilder` option on `pongoDb`

Required regression test: a table inside a DATABASE-level extension produces
`CREATE TABLE` under the default schema. It is silently dropped today.

Both `sqlBuilder.unit.spec.ts` files read `.migrations()`.

Review gate R must show a large net deletion. If it does not, stop.

Gate: build, fix, unit, int.
```

## S10 — The migration table is a real table component

```text
Spec D19. `migrationTableComponentFor` becomes a real `tableComponent` in a
real schema, emitting its DDL the way every other table does.

Delete `schemaComponent()` and `genericComponentType` — the last untyped
component kind. `migrationTableComponentFor` was their only production caller.

Golden test first: the emitted DDL is byte-identical to `main`'s, including
`IF NOT EXISTS`, column order, and the `application` / `sql_hash` defaults.

Gate: build, fix, unit, int.
```

## S11 — Migration naming moves into dumbo

```text
Spec D10.

Golden test first, literal string: `pongoCollection:users:001:createtable`.
Then schema-qualified, schema-component, index and plain-dumbo names, and the
accepted divergence (explicit `public` on Postgres) asserted deliberately.

Add a `migrationNamePrefix` option; pongo passes its three prefixes. Delete
`packages/pongo/src/storage/migrationNames.ts` and all three functions,
including the `defaultSchemaName` parameter.

Review gate R, specific question: is `migrationNamePrefix` net-negative?

Gate: build, fix, unit, int.
```

## S12 — SQLite physical names use the logical name

```text
Spec D17. `dumbo_crm_table_users` becomes `"crm.users"`.

The default schema keeps the bare name. `escapeName` and
`SQLiteMappedNamePrefix` are deleted. `assertNativeName` stays but now rejects
a default-schema identifier containing a dot instead of one starting with
`dumbo_`.

Test first: `crm.users` maps to `crm.users`; the default schema maps to `users`;
a default-schema table named `a.b` is rejected; an index in `crm` maps to
`crm.users_email_idx`.

This renames existing SQLite tables in non-default schemas. The break is
accepted in the spec — state it in the step summary, do not try to migrate it.

Gate: build, fix, unit, int, e2e.
```

## S13 — `defaultSchemaName` optional in `pongoDb`

```text
Spec D11.

Not given -> collections go into `dumboSchema.defaultSchema(...)`, names
unchanged from `main`. Given -> explicit override, names carry the segment.

`pongoDb.ts:100` stops resolving it eagerly.

Test first: unnamed default, explicit override, per-collection override, and a
scope guard proving one collection's override doesn't leak to another.

Gate: build, fix, unit, int.
```

## S14 — Collections normalise into the tree

```text
Spec D12 and D13.

`withTable` get-or-creates the schema component. Schema components sharing a
key merge (union of tables); a duplicate table name within a schema still
throws.

Delete `composePongoDatabase`, the `withValue` stash and its duplicate throw,
`pongoSchemaComponentType`, `pongoDatabaseComponentType`,
`isPongoSchemaComponent`, `isPongoDatabaseComponent`, and `withValue` itself.
`pongoCollectionComponentType` survives only if `pongoDb.ts:255` still needs it;
if it can be a type-level brand instead, make it one.

Test first: ad-hoc schema creation, merge, duplicate-table throw, late
collection, idempotent re-run.

Gate: build, fix, unit, int, e2e.
```

## S15 — Extension as a database fragment

```text
Spec D15. `extensionComponent` gains `schemas` and `extensions`;
`databaseComponent` merges extension-contributed schemas, typed as a record
intersection.

Type spec first: `db.schemas.readmodels.tables.users` resolves.
Then: a schema-attached extension resolves that schema; a database-attached one
keeps its children's own schemas; two extensions contributing the same schema
key merge; a projection factory contributes a table into the schema it names.

No conditional recursion in the types. If it starts creeping in, stop and ask.

Gate: build, fix, unit, int.
```

## S16 — Event-store example

```text
Spec §5's end-to-end proof. An `eventStore` extension factory over projection
registrations: `messages` in schema `emt`, one read-model table per projection
in its own schema, composed into a `pongoDb`.

E2E on Postgres and on SQLite. A name-based reference (spec D5) resolves to the
correctly qualified identifier. Migrating twice is a no-op.

Written so it can later move into emmett.

Gate: build, fix, full suite.
```

## S17 — Final sweep

```text
- Every deleted symbol verified gone, including re-exports and `dist` barrels
- Dead code, orphaned specs and stale index entries cleaned
- Docs and samples updated for `dumboSchema.defaultSchema` and required names
- `metrics/final.md`: before/after per directory and the net delta
- `npm run build:ts`, `npm run fix`, `npm run test` — pristine, no skips
- Summary for Oskar. Nothing committed.
```

---

## Review gate R

```text
Review the step just completed against spec.md. Answer only these:

1. Was a new abstraction introduced — a new exported type, options bag,
   registry, indirection layer or config hook? Name it and say what it
   replaced. If it replaced nothing, that is a STOP.
2. Did a deleted concept leave a remnant that had to be hacked around — a
   guard, a cast, a compatibility shim, a test asserting the old shape? Name
   it. Any remnant is a STOP.
3. Net non-test source lines: before, after, delta. Growth the step did not
   declare in advance is a STOP.
4. Does anything in the step contradict a decision in spec.md? Quote both.

Verdict: PASS or STOP. On STOP, do not continue — summarise for Oskar.
```
