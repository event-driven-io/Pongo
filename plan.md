# Implementation plan — Self-contained schema components

Companion to [spec.md](spec.md) and [qa.md](qa.md). Everything in the spec ships in **one PR**; there is no follow-up work. State lives in [todo.md](todo.md).

## Ground rules for every step

- **Test-first.** Write the failing test, run it, see it fail for the right reason, then implement.
- **Name tests from the usage perspective, never the implementation.** A test name states what
  someone using the library can rely on, in their vocabulary. It must survive the implementation
  being rewritten. "collapses two structurally identical migrations built separately" describes our
  internals; "declaring the same migration in two places applies it once" describes the use case.
  If a name mentions a private symbol, a data structure, a call site or a line number, it is wrong.
- **Green gate after every step**, run from `/home/oskar/Repos/Pongo/src`:
  ```
  npm run build:ts
  npm run fix
  npm run test:unit
  ```
  plus `npm run test:int` / `npm run test:e2e` where the step touches them. All must pass before the next step. Never assume a failure predates the step — verify before dismissing it.
- **Review gate after every step** (prompt R below): a subagent checks that no new abstraction was introduced and that the net line count went **down**. If it went up or an abstraction appeared, **stop**, summarise for Oskar, and discuss whether to drop it.
- **No commits.** Oskar handles git.

## Why this order

The dependency chain is forced. Components can't carry parent pointers (Phase 2) until they're plain frozen values resolving at read time (Phase 1). `databaseName` can't be pulled out (Phase 3) until the parent chain proves the schema name is the only qualifier that matters. DDL can't move into components (Phase 4) until it has a dialect-agnostic form. Naming and `pongoDb` (Phase 5) depend on DDL living in components. Extensions-as-fragments (Phase 6) depend on the schema merge Phase 5 introduces. The example (Phase 7) verifies all of it.

The one non-obvious sequencing decision: **the DDL tokens land as tokens *before* the components start emitting them** (S7-S8 before S9). That keeps `databaseMigrations` working — and every existing test green — while the risky part, two dialects rendering the same tokens, is proven in isolation.

## The shape we settled on

Phases 1 and 2 exist to produce exactly this, and nothing more:

```ts
// construct — every component attaches its OWN children; there is no per-kind attach step
export const createSchemaComponent = (kind, options = {}, parent = undefined) => {
  const component = {
    [schemaComponentType]: kind,
    parent,
    components: {},
    migrations() {
      return [
        ...(options.migrations?.(this) ?? []),
        ...Object.values(this.components).flatMap((c) => c.migrations()),
      ];
    },
  };
  component.components = Object.freeze(
    mapValues(options.components ?? {}, (c) => withParent(c, component)),
  );
  return Object.freeze(component);
};

// attach — kind-blind, recursive so grandchildren cannot go stale
export const withParent = (component, parent) => {
  const clone = { ...component, parent };
  clone.components = Object.freeze(
    mapValues(component.components, (c) => withParent(c, clone)),
  );
  return Object.freeze(clone);
};

// per kind, one line each
schema() { return this.parent; }   // tableComponent
table()  { return this.parent; }   // indexComponent
```

Verified by dry run before implementation (qa.md Q29). Three rules the code must not break:

- **No accessor properties anywhere.** Spread invokes getters and stores their values, so one stray getter silently freezes a clone at the original's parent. Everything that computes is a function.
- **`migrations()` resolves through `this`,** never through the `component` binding captured by the factory closure. The captured-binding variant compiles, runs, and emits unqualified SQL for every clone.
- **No property carries the declaration.** `options.migrations` stays in the closure; the component gains nothing (qa.md A28).

Everything else in Phases 1-3 is deletion. If a step adds machinery beyond these fragments, it is wrong.

## Facts the implementation must respect

Established by reading the branch; getting these wrong will cost a rewrite:

1. **A processor registry already exists** — `core/sql/processors/sqlProcessorRegistry.ts`, with per-dialect registration (see `storage/postgresql/core/sql/processors/`). DDL tokens plug in there. **Do not build a second dispatch mechanism.**
2. **SQLite has no schemas.** `sqliteTableSQL` folds the schema into the table name via `sqliteTableName(identifier)` (`storage/sqlite/core/schema/sqliteObjectNames.ts`), and SQLite emits no `CREATE SCHEMA` at all. Postgres qualifies with `schema.` unless it is the default. This asymmetry is exactly what the tokens exist to absorb.
3. **`createTableSQL`** (`core/schema/components/createTableSQL.ts`, 14 lines) already builds `CREATE TABLE IF NOT EXISTS <ref> (<cols>)` from a table component plus a reference. Reuse it; do not rewrite it.
4. **`withTable`** (`core/schema/components/withTable.ts`, 37 lines) already implements get-or-create-schema-then-add-table and is already called from `pongoDb.ts:276`. D10 is largely a rename plus merge semantics.
5. **Index DDL differs per dialect in three places**: reference naming, JSON-document indexes (pg `USING GIN`, SQLite plain), and JSON-path extraction (pg `#>>` + `PostgreSQLJSON.path`, SQLite `json_extract` + `SQLiteJSON.path`).
6. **Migration names are pongo-specific today** (`src/packages/pongo/src/storage/migrationNames.ts`). Once dumbo components emit their own migrations, the name has to be produced in dumbo. S10 handles this with a single `migrationNamePrefix` option — the one new option in the whole plan, and it deletes a file, so the review gate should net out negative.
7. **`declaredMigrations` is declared on `SchemaComponent` at `schemaComponent.ts:17` and never assigned.** It is a half-landed rename, not a feature. S1 deletes it rather than finishing it.

## Step map

| # | Step | Phase | Green gate |
|---|---|---|---|
| S0 | Baseline metrics | — | build + fix |
| S1 | Plain frozen components, `migrations` as a method | 1 | unit |
| S2 | Name-based dedupe | 1 | unit |
| S3 | Generic `withParent` clone, applied by the factory | 2 | unit |
| S4 | Named accessors, qualifier resolution | 2 | unit + int |
| S6 | Drop `databaseName` from the chain | 3 | unit + int |
| S7 | `SQLTableReference` + `SQLCreateSchema` tokens | 4 | unit |
| S8 | `SQLIndexReference` + JSON target tokens | 4 | unit |
| S9 | Components emit their own DDL; builders deleted | 4 | unit + int |
| S10 | Migration naming moves to dumbo; back-compat golden | 5 | unit + int |
| S11 | `defaultSchemaName` optional in `pongoDb` | 5 | unit + int |
| S12 | Collection normalises into tree; schema merge | 5 | unit + int + e2e |
| S13 | Extension = database fragment | 6 | unit + int |
| S14 | Event-store example | 7 | unit + int + e2e |
| S15 | Final sweep | — | everything |

---

## Prompt R — the review gate (run after every step)

Run this as a subagent immediately after the green gate of each step. Substitute `<N>` and `<step title>`.

````text
You are reviewing a single refactoring step in /home/oskar/Repos/Pongo on branch schema_features.

Step just completed: S<N> — <step title>

Read metrics/baseline.md for the starting numbers, and spec.md for what the step was meant
to achieve.

Determine, using `git diff --stat` against the previous step's recorded state plus your own
reading of the diff:

1. NET LINE COUNT. Did total non-test source lines go DOWN? Report before, after, delta.
   Test lines are reported separately and are allowed to grow.
2. NEW ABSTRACTIONS. Did this step introduce any new interface, type alias used as an
   indirection layer, factory, registry, wrapper function, options bag, or configuration
   hook that did not exist before? An abstraction that REPLACES two or more existing ones
   is fine — say so explicitly and show the count. An abstraction that is purely additive
   is a FAILURE.
3. DELETIONS. List what was actually deleted. If the step's plan named files or symbols to
   delete and they still exist, that is a FAILURE.
4. Did anything get moved rather than removed — same code, new file? Call it out.

Do NOT fix anything. Do NOT edit files.

Return a verdict of PASS or STOP, then the numbers, then at most five bullet points of
evidence. Choose STOP if non-test lines grew, if an additive abstraction appeared, or if a
planned deletion did not happen.
````

If the verdict is STOP, halt implementation, summarise the finding for Oskar, and agree what to drop before continuing.

---

## Phase 0 — Baseline `[done]`

### S0 — Record the baseline

Complete. `metrics/baseline.md` holds the starting numbers: 22,825 non-test source lines across the two packages, 41,991 test lines, 169 exports from `core/schema/index.ts` and 128 from `core/schema/components/index.ts`. `build:ts` and `fix` were both clean before any change, so every later failure is ours.

---

## Phase 1 — Component core

### S1 — Plain frozen components with `migrations` as a method

The keystone. Everything else assumes components are ordinary frozen values that resolve at read time.

````text
Working in /home/oskar/Repos/Pongo/src/packages/dumbo/src/core/schema/.

Read schemaComponent.ts in full, plus schemaComponent.unit.spec.ts (~747 lines — it is the
main safety net; understand what it asserts before changing anything). Read spec.md D2.

GOAL: a schema component is a plain frozen object literal. `options.migrations` is a FUNCTION
of the component, kept in the factory CLOSURE. `component.migrations()` is a METHOD returning
that function's result followed by the children's `migrations()`, recursively.

Laziness is not the problem we are solving — the tree traversal is (qa.md A17). Keep
resolution deferred; delete the traversal.

Read "The shape we settled on" in plan.md before writing anything. Three rules:
- NO accessor properties. `migrations` is a method, not a getter (qa.md A25-A27).
- `migrations()` resolves through `this`, never through the closure's `component` binding.
- NOTHING is added to the object to hold the declaration (qa.md A28) — no `declare` field.

TEST FIRST. Add to schemaComponent.unit.spec.ts:
- a component with no children returns exactly what its own function returned, in order;
- a component with children returns own-then-children, depth-first, in child insertion order;
- a three-level tree composes transitively;
- the function receives the component itself, and runs at CALL time, not at construction;
- the component is frozen and carries no non-enumerable properties;
- NO own property of the component is an accessor — assert via
  `Object.getOwnPropertyDescriptor(...).get === undefined` across `Object.getOwnPropertyNames`.
  A stray getter breaks S3's clone silently, so this is asserted structurally, not by review;
- `Object.keys(component)` contains no surprises — this is what makes the S3 spread safe.
Run the tests; they must fail. Report the failure.

THEN IMPLEMENT in schemaComponent.ts:
- Replace `createSchemaComponent`'s Object.defineProperties construction with a plain frozen
  object literal carrying a `migrations()` method.
- `SchemaComponentOptions.migrations` becomes `(component) => ReadonlyArray<SQLMigration>`.
  It stays in the closure. A component with no migrations of its own passes nothing — do NOT
  add an options bag, a default function field or a builder to arrange this.
- A plain array is NOT accepted as `options.migrations` for now (qa.md A22). Update every
  call site that passes an array to pass a function instead.
- `SchemaComponent.migrations` becomes `() => ReadonlyArray<SQLMigration>`; every read site
  gains `()`. This is mechanical and wide — chase the compiler until it is silent.
- DELETE: the `schemaComponentState` symbol, `InternalSchemaComponent`, `localMigrationsOf`,
  `migrationsFor` and its `visited` set, and the `declaredMigrations` field on the
  `SchemaComponent` type (declared at line 17, never assigned — it is a half-landed rename).
- Update every caller: components/withTable.ts, components/databaseMigrations.ts,
  schemaComposition.type.spec.ts, and anything the compiler points at. `migrationsFor` has
  ~21 references and `databaseMigrations` ~19 — chase every one, and leave no stale re-export
  in any index.ts.
- Keep `databaseMigrations` working for now. It gets deleted in S9, not here.

Do NOT change duplicate-name detection in this step; S2 owns that.
Do NOT introduce parent pointers in this step; S3 owns that.

ACCEPTED DEBT, agreed with Oskar: databaseMigrations.ts runs its own traversal and needs a
node's OWN migrations, interleaved before the driver's DDL for that node — a contract its unit
spec asserts ("keeps declared migrations before driver migrations on each component"). Once the
declaration lives only in the closure there is no way to ask for it, so that one call site reads
`{ ...component, components: {} }.migrations()`. Seeding the result from `database.migrations()`
instead was tried and FAILS that spec: it hoists every declared migration above every generated
one. Do not add an own-migrations accessor to fix this (qa.md A28). S9 deletes the file, the
builder and the traversal, and the interleaving then falls out for free.

CONSTRAINTS: smallest reasonable change; no new abstractions, helper layers or wrapper
functions; no new comments unless the code is genuinely tricky; do not remove existing
comments; do not commit, add or stage anything.

Then from /home/oskar/Repos/Pongo/src: `npm run build:ts`, `npm run fix`, `npm run test:unit`.
All green before you stop.
````

### S2 — Dedupe by name, not identity

````text
Working in /home/oskar/Repos/Pongo/src/packages/dumbo/src/core/schema/.

GOAL (spec.md D3): duplicate migration detection keys on the migration NAME, not on object
identity, because cloning (S3) breaks reference equality.

TEST FIRST, in schemaComponent.unit.spec.ts:
- two structurally identical migrations (same name, same SQL) produced by two separate
  migration functions collapse to one entry — this is the case that currently throws and must not;
- same name with DIFFERENT SQL still throws, with the existing message shape;
- the surviving entry keeps its first-seen position in the output order;
- a diamond (the same child reachable via two parents) yields each migration once.
Run them; the identical-but-not-identical case must fail.

THEN IMPLEMENT:
- Dedupe by name inside the `migrations()` composition. Compare by name plus rendered
  SQL to decide collapse-vs-throw. Read sqlMigration.ts first; if a stable comparable form is
  needed, reuse an existing helper rather than adding one.
- Apply the same rule inside databaseMigrations.ts so the two agree until S9 deletes it.

Then: `npm run build:ts`, `npm run fix`, `npm run test:unit` from src/.
````

---

## Phase 2 — Parent pointers

### S3 — The generic `withParent` clone, applied by the factory

````text
Working in /home/oskar/Repos/Pongo/src/packages/dumbo/src/core/schema/schemaComponent.ts.

GOAL (spec.md D1): attaching a component to a parent produces a CLONE carrying a `parent`
reference. The original is untouched and stays reusable. Every component attaches its OWN
children at construction — attaching is not something schemas do to tables.

`withParent` must know nothing about component kinds — no switch, no capability sniffing, no
per-kind requalifier, and no re-invocation of the kind's factory. Rejected alternatives are
recorded in qa.md Q18-Q19 and A-of-Q26; do not reintroduce them.

Both halves, verified by dry run (qa.md Q29):

  export const withParent = (component, parent) => {
    const clone = { ...component, parent };
    clone.components = Object.freeze(
      mapValues(component.components, (c) => withParent(c, clone)),
    );
    return Object.freeze(clone);
  };

  // inside createSchemaComponent, after the literal, before the freeze:
  component.components = Object.freeze(
    mapValues(options.components ?? {}, (c) => withParent(c, component)),
  );

`parent` is assigned once during construction — the clone must exist before its children can
point at it — and frozen immediately after.

Recursion is required because grandchildren go stale otherwise: a bare spread gives the table
clone a correct `parent`, but its index still points at the ORIGINAL, unparented table.
Indexes stay independent components; they are separate statements and can be altered on their
own (qa.md A21), so they are reparented, never absorbed into the table's DDL.

Re-parenting an already-attached component is allowed and silent — the source is a frozen
value that cannot be harmed, so there is nothing to guard (qa.md A26).

TEST FIRST, in schemaComponent.unit.spec.ts:
- the clone is a different object from the original and the original's `parent` is unchanged;
- the clone's `parent` is the given parent;
- a GRANDCHILD of the clone has a `parent` that is the CLONE's child, not the original's —
  this is the test that justifies the recursion, write it explicitly;
- an UNATTACHED component's own children already have it as their parent — this is the test
  that justifies the factory half, and the case whose absence broke the dry run;
- the clone and every descendant are frozen, `components` maps included;
- the original's `migrations()` are unaffected by the clone existing;
- the same definition cloned under two different parents yields two independent trees;
- re-parenting a clone leaves the clone it came from unchanged.

THEN IMPLEMENT. Check whether a `mapValues`-shaped helper already exists in the repo before
writing one; `schemaComponentMap` may already cover the freeze.

Then: `npm run build:ts`, `npm run fix`, `npm run test:unit` from src/.
````

### S4 — Named accessors and qualifier resolution

````text
Working in /home/oskar/Repos/Pongo/src/packages/dumbo/src/core/schema/components/.

GOAL (spec.md D1 and D6): authoring code reads `this.table.schema.schemaName`, not
`this.parent.parent.schemaName`, while `withParent` stays kind-agnostic.

Attachment itself is already done — S3's factory half means `databaseSchemaComponent` needs no
attach code at all. This step is the accessors, the resolution rule, and a deletion.

TEST FIRST:
- `tableComponent(...).schema()` is undefined when unattached and is the schema component once
  attached;
- `indexComponent(...).table().schema().schemaName` resolves through two links;
- a table with `databaseSchemaName` declared keeps it even when attached elsewhere — unless
  the two disagree, in which case it throws, reusing the existing message from
  tableComponent.ts lines 88-106;
- an unattached table with no declared schema resolves to SQLDefaultSchemaNameToken, not to
  undefined and not to a dialect string;
- columnSchemaComponent gets NO accessor: assert a column exposes no `table` member.

Then, in databaseSchemaComponent's unit spec, that the wiring is real:
- `databaseSchemaComponent({ schemaName: 'reporting', tables: { users } })` exposes a CLONE at
  `.tables.users`, not the object passed in, and that clone's `.schema()` is the schema;
- the caller's `users` is unchanged and still resolves to the default token;
- its indexes resolve `this.table().schema().schemaName` to 'reporting';
- extensions passed to the schema are attached the same way;
- a schema with NO schemaName leaves its tables on the default token and does not throw.

THEN IMPLEMENT:
- `schema() { return this.parent; }` on tableComponent.
- `table() { return this.parent; }` on indexComponent.
  Plain methods, NOT getters — a getter here breaks S3's clone silently (qa.md A27).
- One qualifier-resolution helper shared by table and index, implementing D6's order:
  declared -> parent chain -> SQLDefaultSchemaNameToken. One function, not one per kind.
- DELETE the ad-hoc conflict loop at databaseSchemaComponent.ts lines 58-69 — the resolution
  helper now owns that check. This is a deletion the review gate will look for.
- Add NO attach code to databaseSchemaComponent. If it seems to need any, stop: S3 is wrong.

Then: `npm run build:ts`, `npm run fix`, `npm run test:unit`, `npm run test:int` from src/.
Integration tests exercise real migration output, so this is the first step where drift shows.
````

---

## Phase 3 — Drop `databaseName`

### S6 — Remove `databaseName` from the resolution chain

Pure subtraction. Do it before the DDL work so Phase 4 has less to carry.

````text
Working across /home/oskar/Repos/Pongo/src/packages/dumbo and .../pongo.

GOAL (spec.md D7): the schema name is the only qualifier ever propagated. `databaseName` stays
on databaseComponent as connection/reporting metadata and appears nowhere else.

TEST FIRST:
- assert `databaseSchemaComponent` no longer accepts or exposes `databaseName` — a type-level
  spec in the *.type.spec.ts style already used in this repo;
- assert building migrations for a databaseComponent with NO databaseName works and produces
  the same migrations as one with a name — this is the removed throw;
- assert a table's migrations are byte-identical regardless of the database name.

THEN IMPLEMENT — delete, do not deprecate:
- `databaseName` from DatabaseSchemaComponent, its options, and databaseSchemaComponent.ts
  lines 77-79;
- the cross-database validation in databaseComponent.ts lines 59-68 (keep the schema-name /
  record-key conflict check at lines 69-73);
- `databaseName` from DatabaseIdentifier, DatabaseSchemaIdentifier, TableIdentifier and
  IndexIdentifier in databaseMigrations.ts — DatabaseIdentifier itself likely becomes empty
  and should go;
- the `'A database name is required to build migrations'` throw at databaseMigrations.ts:59-61;
- `databaseName` from the identifier built at pongoDb.ts:~262 and from withTable.ts.
- Follow the compiler until it is silent; update every affected spec.

Then: `npm run build:ts`, `npm run fix`, `npm run test:unit`, `npm run test:int` from src/.
````

---

## Phase 4 — DDL as dialect-agnostic tokens

### S7 — Table reference and create-schema tokens

The riskiest phase starts with the smallest slice: get one token rendering correctly on both dialects before touching anything structural.

````text
Working in /home/oskar/Repos/Pongo/src/packages/dumbo/src/core/sql/ and the two storage
dialects.

READ FIRST: core/sql/processors/sqlProcessorRegistry.ts, core/sql/processors/sqlProcessor.ts,
storage/postgresql/core/sql/processors/, and both databaseObjectSQL.ts files. A per-dialect
token processor registry ALREADY EXISTS. Use it. Adding a second dispatch mechanism fails
the review gate.

GOAL (spec.md D5): a table reference and a create-schema statement become dialect-agnostic
tokens, resolved by each dialect's processor. The asymmetry the tokens must absorb:
- Postgres: `schema.table`, or bare `table` when the schema is the default; CREATE SCHEMA
  IF NOT EXISTS, or nothing at all for the default schema.
- SQLite: no schemas — the schema is folded into the table NAME via sqliteTableName(); CREATE
  SCHEMA renders to nothing.

TEST FIRST, in the existing formatter unit specs for both dialects:
- SQLTableReference with schema 'reporting' renders `"reporting"."users"` on pg and the
  sqliteTableName-folded identifier on SQLite;
- SQLTableReference with the schema unset (SQLDefaultSchemaNameToken) renders bare `"users"`
  on pg and the SQLite equivalent of an unprefixed table;
- SQLTableReference explicitly naming 'public' on pg renders bare `"users"`, preserving
  today's postgreSQLTableReference behaviour;
- SQLCreateSchema for 'reporting' renders CREATE SCHEMA IF NOT EXISTS on pg and empty on
  SQLite; for the default schema it renders empty on both.

THEN IMPLEMENT:
- Add the two tokens next to the existing ones in core/sql/tokens/sqlToken.ts. The schema
  field is `string | SQLDefaultSchemaNameToken` — this is the first consumer of the token
  Oskar added and never plugged in.
- Register a processor per token per dialect, alongside the existing column/array processors.
- Rewrite `postgreSQLTableReference` / `sqliteTableReference` / `postgreSQLDatabaseSchemaSQL`
  to emit the token. They stay as functions for this step only; S9 deletes them.

Then: `npm run build:ts`, `npm run fix`, `npm run test:unit` from src/.
````

### S8 — Index reference and JSON target tokens

````text
Working in the same places as S7.

GOAL: the remaining dialect-specific DDL fragments become tokens. From the two
databaseObjectSQL.ts files, exactly three things differ per dialect beyond the table
reference:
1. index reference — pg uses the bare index name, SQLite uses sqliteIndexName();
2. JSON-document index — pg `USING GIN (col)`, SQLite a plain index on the column;
3. JSON-path extraction — pg `(col #>> PostgreSQLJSON.path(p))`, SQLite
   `json_extract(col, SQLiteJSON.path(p))`.

TEST FIRST, in both dialects' formatter unit specs, one case per behaviour above, plus:
- a unique index renders CREATE UNIQUE INDEX on both;
- a multi-column index renders its column list identically on both;
- an index component supplying its own `sql` callback still wins over the generated form.

THEN IMPLEMENT:
- Add SQLIndexReference, SQLJSONDocumentIndexTarget and SQLJSONPathTarget tokens, and one
  processor each per dialect.
- Rewrite postgreSQLIndexSQL / sqliteIndexSQL to build from tokens. Both functions collapse
  to nearly the same body; if after this step they are identical, hoist the single shared
  version into core and delete both — that is a deletion, not an abstraction.

Then: `npm run build:ts`, `npm run fix`, `npm run test:unit` from src/.
````

### S9 — Components emit their own DDL; the builder machinery dies

The payoff step. This is where the duplication actually disappears.

````text
Working in /home/oskar/Repos/Pongo/src/packages/dumbo/src/core/schema/ and both storages.

GOAL (spec.md D5 and section 2): each component's migrations function returns its OWN generated DDL,
built from S7/S8 tokens and resolved through the S4 parent chain. No builder is passed in.
No second traversal exists.

TEST FIRST:
- `tableComponent({...}).migrations()` contains a create-table migration whose SQL renders
  correctly under BOTH dialect formatters (spec.md section 5, "default token resolution");
- an unattached table renders unqualified; the SAME definition attached to 'reporting' renders
  qualified — one definition, two outputs, which is the whole point of the parent pointer;
- `databaseSchemaComponent({ schemaName: 'reporting' }).migrations()` leads with CREATE SCHEMA,
  and a schema with no name emits none;
- an index component contributes its create-index migration through its parent table;
- REGRESSION (spec.md section 5): a table inside a DATABASE-LEVEL extension now produces a
  CREATE TABLE. It is silently dropped today by the guard at databaseMigrations.ts:139-146.
  Write this test against the old behaviour first and watch it fail.

THEN IMPLEMENT:
- tableComponent, indexComponent and databaseSchemaComponent each build their generated
  migration inside the migrations function they pass to createSchemaComponent.
- DELETE, and verify none of these names survive anywhere including index.ts re-exports:
  databaseMigrations.ts (whole file) and its unit spec's builder-specific cases,
  DatabaseMigrationBuilder, DatabaseIdentifier / DatabaseSchemaIdentifier / TableIdentifier /
  IndexIdentifier if nothing else needs them, postgreSQLTableSQL, postgreSQLIndexSQL,
  postgreSQLDatabaseSchemaSQL, sqliteTableSQL, sqliteIndexSQL,
  src/packages/pongo/src/storage/postgresql/core/databaseMigrations.ts and its SQLite twin,
  pongoPostgreSQLMigrationBuilder, pongoSQLiteMigrationBuilder, and the `migrationBuilder`
  option on pongoDb (pongoDb.ts:209 and :226 become plain `databaseComponent.migrations()`).
- Rewrite the two sqlBuilder unit specs that call databaseMigrations(...) to read
  `.migrations()` instead.
- Verify the S1 accepted debt died with the file: `{ ...component, components: {} }.migrations()`
  must not survive anywhere. Grep for `components: {} }` and expect zero hits.
- The pongo marker symbols exist ONLY because dumbo's traversal calls the builders for every
  table in the tree, pongo's or not, so `isPongoCollectionComponent` has to stop pongo naming
  tables it did not create. Deleting the builders removes both runtime readers. Therefore also
  delete: `pongoCollectionComponentType`, `pongoSchemaComponentType`,
  `pongoDatabaseComponentType`, the three `isPongo*Component` guards, and `withValue` in
  pongo/src/core/schema/index.ts. The ONLY thing that may survive is a type-level brand for the
  narrowing at pongoDb.ts:255 — a type, never a value on the object. If a runtime marker still
  looks necessary after the builders are gone, stop and tell Oskar; it means S9 did not actually
  move DDL into the components.

Then: `npm run build:ts`, `npm run fix`, `npm run test:unit`, `npm run test:int` from src/.

Expect this step to delete substantially more than it adds. If it does not, stop and say so.
````

---

## Phase 5 — Naming and `pongoDb`

### S10 — Migration naming moves into dumbo, with a back-compat golden test

````text
Working in /home/oskar/Repos/Pongo/src/packages/dumbo and .../pongo/src/storage/.

CONTEXT: S9 made components emit migrations, but the names still live in pongo
(src/packages/pongo/src/storage/migrationNames.ts). A component cannot name its own migration
without them.

GOAL (spec.md D8): the name mirrors what was declared. No schema segment when no schema was
given; a schema segment whenever one was. The `identifier.databaseSchemaName ===
defaultSchemaName` comparison — the last place the dialect leaks into naming — is deleted.

TEST FIRST. The golden back-compat test is the most important test in this whole plan:
- a pongo collection with NO schema produces exactly `pongoCollection:users:001:createtable`,
  byte-identical to main. Assert the literal string.
- the same collection in schema 'reporting' produces
  `pongoCollection:reporting:users:001:createtable`;
- a schema component produces `pongoSchema:reporting:001:create`;
- an index produces `pongoIndex:reporting:users:idx_x:create`;
- a plain dumbo table (not a pongo collection) uses the default prefix and is stable;
- ACCEPTED DIVERGENCE (spec.md section 6): explicitly declaring 'public' on Postgres now
  yields `pongoCollection:public:users:001:createtable`. Assert this deliberately so the
  change is recorded in a test rather than discovered in production.

THEN IMPLEMENT:
- Add a single optional `migrationNamePrefix` to the table/schema/index component options,
  defaulting to a neutral dumbo value. pongo's collection component passes 'pongoCollection',
  its schema 'pongoSchema', its index 'pongoIndex'.
- DELETE src/packages/pongo/src/storage/migrationNames.ts entirely, along with
  pongoCollectionMigrationName, pongoDatabaseSchemaMigrationName, pongoIndexMigrationName and
  every import of them.

NOTE FOR THE REVIEW GATE: `migrationNamePrefix` is the only new option the plan introduces.
It exists to delete a file and a dialect dependency. If the reviewer judges it additive
rather than net-negative, stop and discuss with Oskar before continuing.

Then: `npm run build:ts`, `npm run fix`, `npm run test:unit`, `npm run test:int` from src/.
````

### S11 — `defaultSchemaName` becomes optional

````text
Working in /home/oskar/Repos/Pongo/src/packages/pongo/src/core/database/pongoDb.ts.

GOAL (spec.md D9): stop resolving the default schema name eagerly. This is what keeps S10's
golden test passing for existing deployments — today every collection lands in a schema
component literally named 'public' on Postgres (pongoDb.ts:100 and :251), which under D8 would
rename every migration a real user has already applied.

TEST FIRST:
- `pongoDb` created WITHOUT defaultSchemaName puts collections in an unnamed default schema
  component; their migration names carry no schema segment; the rendered DDL is unqualified
  on pg and unprefixed on SQLite;
- `pongoDb` created WITH `defaultSchemaName: 'reporting'` puts every collection there unless
  the collection says otherwise, and names carry the segment;
- a collection explicitly naming a schema still overrides the db-level default;
- the schema-scope guard at pongoDb.ts:185-189 still throws when a scope and a collection
  disagree.

THEN IMPLEMENT:
- Make `defaultSchemaName` optional throughout. Where a map key is needed for the collections
  map and schemaScopes (pongoDb.ts:115-127, :166), key the unnamed default on a single
  well-defined sentinel rather than a dialect string — check whether an existing constant
  fits before introducing one.
- The unnamed default schema component carries SQLDefaultSchemaNameToken as its qualifier.

Then: `npm run build:ts`, `npm run fix`, `npm run test:unit`, `npm run test:int` from src/.
````

### S12 — Collections normalise into the tree; schemas merge

````text
Working in pongoDb.ts, core/schema/components/withTable.ts and schemaComponent.ts.

GOAL (spec.md D10 and D11): every collection — declared or ad hoc — enters the tree the same
way, so CREATE SCHEMA always comes from a real schema component and there is no special case.

TEST FIRST:
- `db.collection('users', { databaseSchemaName: 'readmodels' })` results in a database
  component containing a 'readmodels' schema whose migrations lead with CREATE SCHEMA
  readmodels, followed by the CREATE TABLE;
- adding a second collection to the same ad-hoc schema merges rather than replaces;
- two components contributing the same schema alias merge their tables; a duplicate TABLE
  name inside one schema still throws (spec.md D10, last paragraph);
- a collection added AFTER `db.schema.migrate()` migrates itself on first use and re-running
  the full set applies nothing new (spec.md D11) — an integration test against a real database;
- the whole ad-hoc flow is idempotent: run it twice, the second run is a no-op.

THEN IMPLEMENT:
- Relax `mergeSchemaComponentMaps` so two DatabaseSchemaComponents sharing an alias merge
  (union of tables and extensions, migrations functions composed) while every other duplicate
  alias still throws.
- Make `withTable` use that merge instead of its current spread at withTable.ts:16-27.
- Confirm pongoDb.ts:276 needs no change beyond what S11 did. If it does, keep it minimal.

Then: `npm run build:ts`, `npm run fix`, and the full `npm run test:unit`,
`npm run test:int`, `npm run test:e2e` from src/.
````

---

## Phase 6 — Extension as a database fragment

### S13 — Extensions declare schemas

````text
Working in /home/oskar/Repos/Pongo/src/packages/dumbo/src/core/schema/extensionComponent.ts
and components/databaseComponent.ts.

GOAL (spec.md D12): an extension stops being an opaque component bag and becomes a composable
fragment of a database — the same shape: schemas, extensions, migrations. The database merges
extension-contributed schemas into its own.

TEST FIRST:
- the spec.md D12 example compiles and `db.schemas.readmodels.tables.users` is TYPED — add a
  *.type.spec.ts in the style already used in this repo;
- CREATE SCHEMA readmodels is emitted because a real schema component exists;
- an extension attached to a SCHEMA is attached via withParent and its tables resolve that
  schema name; a child declaring a different schema throws;
- an extension attached to the DATABASE resolves each child's own declared schema, or the
  default token — the database is not a schema, so the chain simply finds no schemaName;
- two extensions each contributing a 'readmodels' schema merge their tables (this is why S12
  came first);
- an extension built by a factory over options — mimicking emmett's
  `projections?: ProjectionRegistration<...>[]` — contributes one table per projection into
  whichever schema each names.

THEN IMPLEMENT:
- Give extensionComponent `schemas` and `extensions`, mirroring databaseComponent's options.
- Have databaseComponent merge extension schemas into `schemas`, typed as a record
  intersection. No inference over nested component maps — if the types start needing
  conditional recursion, stop and tell Oskar.

Then: `npm run build:ts`, `npm run fix`, `npm run test:unit`, `npm run test:int` from src/.
````

---

## Phase 7 — The example, and the sweep

### S14 — Event-store-shaped extension, end to end

````text
Working in /home/oskar/Repos/Pongo/src — place this where the repo already keeps runnable
examples or e2e fixtures; check the layout before choosing.

GOAL (spec.md section 4 phase 7, qa.md A15): a concrete event-store-shaped extension that
proves the design carries emmett's real case, written so it can later move into emmett
unchanged.

Reference — read but do NOT modify, it is a different repo:
/home/oskar/Repos/emmett/src/packages/emmett-postgresql/src/eventStore/postgreSQLEventStore.ts
  — see PostgresEventStoreOptions and its `projections` registration at lines 177-184
/home/oskar/Repos/emmett/src/packages/emmett-postgresql/src/eventStore/projections/pongo/pongoProjections.ts
  — note that projections reference their collection by NAME only, never by object; that is
    spec.md D4 and the reason this design works.

BUILD:
- an `eventStore` extension factory taking projection registrations, contributing:
  - a `messages` table in its own 'emt' schema,
  - one read-model table per projection, in whichever schema the projection names,
- composed into a pongoDb via `databaseComponent({ extensions: { eventStore } })`.

TEST — end to end against real databases, both Postgres and SQLite:
- migrating creates every schema and table, in a working order;
- read models land in their declared schema; messages lands in 'emt';
- `db.schemas.<name>.tables.<name>` is typed all the way through;
- a projection referencing its read-model table BY NAME resolves to the correctly qualified
  identifier — the same definition attached in two schemas resolves differently;
- migrating twice is a no-op.

Then: `npm run build:ts`, `npm run fix`, and the full test suite from src/.
````

### S15 — Final sweep

````text
Working across /home/oskar/Repos/Pongo.

1. Walk the deletion checklist in metrics/baseline.md and verify every symbol is gone from
   source, from index.ts re-exports, and from documentation. Any survivor is a bug.
2. Grep for dead code the compiler cannot see: unused exports, orphaned spec files,
   commented-out blocks, stale entries in the schema index.ts files.
3. Check any README, docs or samples referencing the deleted builder API, and update them.
4. Regenerate the S0 metrics into metrics/final.md, with a before/after table per directory
   and a grand total. State plainly whether total non-test source lines went down, and by
   how much.
5. Run from /home/oskar/Repos/Pongo/src: `npm run build:ts`, `npm run fix`, `npm run test`
   (unit + int + e2e). Output must be pristine — no warnings, no skipped suites.
6. Write a short summary for Oskar: what was deleted, what was added, the net line delta, the
   accepted behaviour divergence from D8, and anything the plan assumed that turned out wrong.

Do not commit anything.
````

---

## What would make me stop and come back to Oskar

- **Phase 2 grows past `withParent`, its use inside the factory, and two one-line accessors.** The point of the redesign is
  that attaching costs five lines. If it needs per-kind logic, capability sniffing or a second
  recursion, the premise is wrong.
- **S9 does not delete more than it adds.** That would mean DDL-in-components cost more than
  the duplication it removed.
- **S10's `migrationNamePrefix` reads as additive** rather than as the thing that deletes
  migrationNames.ts.
- **S13's typing needs conditional recursion** over nested component maps — that is design X
  from qa.md Q10, explicitly rejected as unmaintainable TS.
- **The golden back-compat test in S10 cannot be made to pass** without reintroducing a
  dialect-aware default-schema comparison.
