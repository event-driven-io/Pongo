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

Execution order is **S1, S2, S3, S5, S6, S7, S8, S9, S4, S10 … S17.** Step IDs are stable; only S4's position moved, and its section sits between S9 and S10 to match.

Steps 1–3 are deletions with no design risk: they retire concepts the spec has already ruled out, and shrink the surface every later step has to move through. Redundant concepts die as early as their dependents allow.

Steps 5–6 change the component API. Steps 7–10 move DDL behind the formatter — the largest piece, and the gate for everything in pongo. Steps 11–15 are pongo. Steps 16–17 close out.

Two non-obvious sequencing decisions:

**The DDL tokens land before the components emit them** (S7–S8 before S9). That keeps every existing test green while the risky part — two dialects rendering the same tokens — is proven in isolation.

**S4 runs after S9, not before S5.** `databaseMigrations.ts` reads a component's own declared migrations, and only its own, by spreading it with an emptied child list: `{ ...component, components: [] }.migrations()`. That works solely because `migrations` resolves its children through `this`. D2 replaces `this` with a closure over the factory's own `children`, so the spread stops removing anything and the clone returns its whole subtree — breaking the per-component `declared, driver, declared, driver` interleaving that `databaseMigrations.unit.spec.ts` asserts and that `pongoDb.ts` runs every pongo migration through. The two clean fixes were to hack around the missing `this` in a file that is about to be deleted, or to move the deletion forward without the tokens S9 needs. Waiting is the third: S9 deletes `databaseMigrations.ts` outright, and S4 then has no dependents left. Nothing in S5–S9 needs `createSchemaComponent` gone.

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
- ~~`supportsSchemas` and `supportsFunctions` from `DatabaseCapabilities` and
  both metadata objects.~~ NOT DONE — reverted on Oskar's call during S2.
  `supportsSchemas` is where the `dumbo_<schema>_table_` decision belongs, and
  `supportsFunctions` gates a conditional type that makes `functionExists`
  required, so deleting it downgrades PostgreSQL's metadata. See todo.md S2.
  `supportsMultipleDatabases` stays either way — read at
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

The default-schema test moves into the processor, but keep both halves —
`SQLDefaultSchemaNameToken` AND `=== postgreSQLMetadata.defaultSchemaName`.
Pongo passes `'public'` as a real schema name until S13, which is where the
string half is deleted.

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

Two corrections agreed with Oskar while the step ran:

- `CREATE INDEX IF NOT EXISTS`, matching `createTableSQL`. Custom `sql`
  callbacks write their own statement and are untouched.
- A unique JSON-document index is btree on PostgreSQL, not GIN. GIN cannot be
  unique, but jsonb has a btree operator class, so `CREATE UNIQUE INDEX ...
  (data)` is valid and enforces whole-document uniqueness. The old code
  hardcoded GIN and silently dropped `isUnique`. `SQLJSONDocumentIndexTarget`
  therefore carries `isUnique` and the PostgreSQL processor picks the access
  method. Assert it against a live database through `pg_am`, not just the
  rendered string.

Once `sqliteIndexReference` emits a token, `sqliteIndexName`'s `dumbo_` guard
fires at format time, not at reference-construction time — the same shift S7
made for tables. Update the index half of
`reserves the mapped-name prefix for native tables and indexes` in pongo's
`sqlite/core/sqlBuilder/sqlBuilder.unit.spec.ts` to format inside
`assert.throws`; S7 already did that to its table half.

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
- `postgreSQLTableSQL`, `postgreSQLDatabaseSchemaSQL`, `sqliteTableSQL` as
  public migration builders. `postgreSQLIndexSQL` and `sqliteIndexSQL` are
  already gone — S8 hoisted them into `createIndexSQL`, which stays and becomes
  what `indexComponent` calls
- pongo's two `databaseMigrations.ts`, `pongoPostgreSQLMigrationBuilder`,
  `pongoSQLiteMigrationBuilder`, and the `migrationBuilder` option on `pongoDb`

A table inside a DATABASE-level extension produces `CREATE TABLE` under the
default schema. FIXED IN S6, which removed the `databaseSchemaName !== undefined`
guard as a D7 consequence and covers it with
`qualifies a table in a database extension with the default schema token`. Do
not write it again; keep it passing through the rewrite.

`databaseSchemaComponent` owns the CREATE SCHEMA. Decided with Oskar 2026-08-10.
It is in `core/`, so it has no dialect and emits `SQLCreateSchema` — a STATEMENT
token, not a name token, because two of its three renderings are nothing:

  PG named   -> CREATE SCHEMA IF NOT EXISTS crm
  PG default -> nothing (already exists)
  SQLite     -> nothing (no schemas; the name folds into the table name)

A name token cannot do that — `CREATE SCHEMA IF NOT EXISTS ${name}` leaves the
literal text behind and SQLite gets broken SQL. The whole statement has to
vanish, so the whole statement is the token. That is the only reason
`SQLCreateSchema` exists; in S7 its single caller was already
PostgreSQL-specific and it earned nothing there.

`sqlMigration` drops statements that render empty. That is what retires
`postgreSQLDatabaseSchemaSQL`'s `SQL | undefined`: the component emits the token
unconditionally, the formatter renders nothing for the two cases above, and the
migration carries no statement. Delete the function and pongo's default-schema
branch with it — no caller tests for the default schema any more.

Both `sqlBuilder.unit.spec.ts` files read `.migrations()`.

Deleting `databaseMigrations.ts` also removes the last reader of the `this`
binding on `migrations` — the `{ ...component, components: [] }.migrations()`
spread. That is what unblocks S4, which runs next.

Review gate R must show a large net deletion. If it does not, stop.

Gate: build, fix, unit, int.
```

EXECUTED WITH S11 AND HALF OF S13 FOLDED IN. A component that emits its own
DDL has to name it, so S11's naming had to come with it; and a name that stays
byte-identical for the default case needs pongo to stop handing down `'public'`
/ `'main'` as a real schema name, which is S13's naming half. Agreed with Oskar
2026-08-10. What S9 did NOT take from S13: the dialect string halves in
`isDefaultSchema`, `sqliteTableName` and `sqliteIndexName` all stay, so an
explicitly named `public` / `main` still renders as the default schema in SQL
and keeps its physical name. Only the migration name diverges.

LEFT OPEN, to settle before the branch ends - see todo.md for the detail:
the prefix shape and whether the prefix rides on the component instead of the
read context; the default schema's record key; the `?? ?? token` chains that
belong once in `createSchemaComponent`.

## S4 — The factory owns its literal

Numbered S4 because that is where it was planned; **executed here, after S9**.
See "Why this order".

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
`databaseSchemaName` and `tableName`. `databaseComponent` extends nothing;
`databaseName` left the chain in S5.

`createSchemaComponent` is not public API — `schemaComposition.type.spec.ts:52-53`
asserts its absence with `@ts-expect-error`. Expect the `as unknown as` casts to
fall away with the bag; `columnSchemaComponent`'s may survive because of its
conditional return type.

Delete `declares against the component it is read from, not the one it was
built from` in `schemaComponent.unit.spec.ts`. It asserts the `this` binding
directly — a spread copy with a different child list produces a different
migration name — and D2 deletes that binding on purpose. Record it in todo.md.

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

## S11 — Migration naming moves into dumbo — **DONE IN S9**

Kept for the record. `pongo/storage/migrationNames.ts` is deleted and naming
lives in `dumbo/core/schema/components/migrationNames.ts`. What the prompt below
called a `migrationNamePrefix` option is currently a `migrationNamePrefixes`
field on the read context, which is the wrong home - the open question recorded
in todo.md.

```text
Spec D10.

Golden test first, literal string: `pongoCollection:users:001:createtable`.
Then schema-qualified, schema-component, index and plain-dumbo names, and the
accepted divergence (explicit `public` on Postgres) asserted deliberately.

Add a `migrationNamePrefix` option; pongo passes its three prefixes. Delete
`packages/pongo/src/storage/migrationNames.ts` and all three functions,
including the `defaultSchemaName` parameter and `schemaSegment`. The dumbo
replacement tests the token only — one check, not S6's pair.

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

Keep both halves of the default-schema test here — `SQLDefaultSchemaNameToken`
AND `=== sqliteMetadata.defaultSchemaName`. Pongo still passes `'main'` as a real
schema name until S13; dropping the string half now renames every default-schema
table.

Test first: `crm.users` maps to `crm.users`; the default schema maps to `users`;
a default-schema table named `a.b` is rejected; an index in `crm` maps to
`crm.users_email_idx`.

This renames existing SQLite tables in non-default schemas. The break is
accepted in the spec — state it in the step summary, do not try to migrate it.

Every `dumbo_..._table_...` literal moves with it. As of S7 they are in
`core/sql/tokens/schemaTokens.unit.spec.ts`,
`sqlite/core/schema/schemaComponentSQL.unit.spec.ts` and its `.int.spec.ts`,
`sqlitePhysicalNames.unit.spec.ts`, pongo's
`sqlite/core/sqlBuilder/sqlBuilder.unit.spec.ts` and
`sqlite/sqlite3/migrations.int.spec.ts`.

Gate: build, fix, unit, int, e2e.
```

## S13 — `defaultSchemaName` optional in `pongoDb` — **NAMING HALF DONE IN S9**

Done in S9: `defaultSchemaName` is optional, `pongoDb.ts` no longer resolves it
eagerly, and an unnamed default schema carries `SQLDefaultSchemaNameToken`.
Still to do here: delete the three dialect string halves listed below, which
S9 deliberately left in place so that an explicitly named `public` / `main`
keeps its physical table and index names.

```text
Spec D11.

Not given -> collections go into `dumboSchema.defaultSchema(...)`, names
unchanged from `main`. Given -> explicit override, names carry the segment.

`pongoDb.ts:100` stops resolving it eagerly.

CLEARS S6's DUAL ENCODING. S6 made every dialect ask
`SQLDefaultSchemaNameToken.check(x) || x === <dialect default string>`, because
pongo still hands down `'public'` / `'main'` as a real schema name. This step
removes that source, so the token becomes the only encoding. S7 already
consolidated most of those conditions into the processors, so as of S7 the
string half survives in exactly three places — delete all three:
- `isDefaultSchema` in postgresql `sql/processors/schemaProcessors.ts`
- `sqliteTableName` and `sqliteIndexName` in `sqlitePhysicalNames.ts`
- `schemaSegment` in pongo's `migrationNames.ts`, if S11 has not already
  deleted that file
`postgreSQLDatabaseSchemaSQL` is not on that list — S9 deletes it, and its copy
of the test goes with it.

Consequence, and it is a behaviour change: an EXPLICITLY given `public` / `main`
is then a named schema and carries its segment. That is the divergence S11
asserts deliberately — the two steps must agree on it.

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
