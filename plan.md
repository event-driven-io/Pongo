# Schema Composition Audit — Execution Ledger

This document is the execution plan for applying the Dumbo/Pongo audit.
It is deliberately organized as small vertical slices rather than as one
repository-wide rewrite.

## Status

Status values:

- `[done]` validated and committed baseline behavior.
- `[active]` the only slice currently allowed to change.
- `[next]` ready after the active slice is green and reviewed.
- `[queued]` required work whose preceding slices are not green yet.

The numbered slices are dependency order, not broad work buckets. A queued
slice becomes `next` only after the active slice passes its complete gate. This
keeps failures attributable to one change and prevents half of one
architectural change from leaking into another slice.

Current checkpoint:

- `[done]` Commit `98f856be` is the last checkpoint known to pass every gate.
- `[done]` At that checkpoint, TypeScript, lint, package builds, 988 unit
  tests, and focused PostgreSQL/SQLite integrations passed.
- `[done]` Current HEAD `880f1e40` contains the completed hierarchy,
  traversal, runtime, physical-reference, migration, and driver-resolution
  slices.
- `[done]` The current physical-reference and driver-resolution slices pass
  TypeScript, 995
  unit tests, ESLint/Prettier, package builds, and focused real
  PostgreSQL/SQLite/D1 migration and connection integrations.
- `[done]` Slice 5 keeps persisted Pongo ledger names in one internal naming
  module while Dumbo owns traversal, references, and dialect SQL.
- `[done]` Slice 9 resolves database/schema names once and requires concrete
  names at the internal driver boundary.
- `[done]` Slice 12 dead-code/export searches are clean.
- `[done]` Final verification passes: forced Dumbo/Pongo TypeScript, 995 unit
  tests, 367 integration tests, 465 e2e tests (5 intentionally skipped),
  ESLint/Prettier, package builds, and `git diff --check`.

## Non-negotiable design decisions

### Dumbo owns the abstractions

Dumbo owns:

- schema component construction and discrimination;
- typed component records and recursive traversal;
- ownership hierarchy and contextual placement;
- construction of the resolved database hierarchy;
- derivation of full logical identifiers while traversing that hierarchy;
- table and index DDL primitives;
- aggregation of declared and driver-generated migrations;
- database metadata and physical-reference contracts;
- migration execution and ledger behavior.

Pongo specializes Dumbo database, schema, table, and index components. It must
not convert Pongo declarations into unrelated Dumbo objects through adapters
such as `toTableComponent`.

### Public component model

The ownership hierarchy is:

```text
DatabaseComponent
└── DatabaseSchemaComponent
    └── TableComponent
        ├── ColumnSchemaComponent
        └── IndexComponent
```

`ExtensionComponent` is a named composition boundary. Its direct record may
contain arbitrary schema components. Extension children participate in
traversal and migrations but are never promoted into `.schemas` or `.tables`.

Only these canonical public factories remain:

```ts
databaseComponent(...)
databaseSchemaComponent(...)
tableComponent(...)
indexComponent(...)
extensionComponent(...)
```

and the corresponding `dumboSchema` convenience factories.

### No public URN or string-discriminator system

- Component kinds use exported `unique symbol` discriminators.
- Pongo specializations use symbol markers.
- Record aliases and domain names identify children.
- Object identity handles traversal cycles and shared children.
- `SQLMigration.name` is the persisted migration identity.
- Runtime type checks never parse prefixes or call `startsWith`.

### Immutable declarations

- Factory output is a declaration.
- Definitions are never rebound or mutated.
- A Pongo collection remains a Dumbo `TableComponent`; it is not converted
  through a `toTableComponent`-style adapter.
- Pongo constructs one ordinary resolved Dumbo database hierarchy after the
  database name and default schema name have been resolved.
- Existing schema, table, column, index, and extension declarations are placed
  directly into that hierarchy. There is no generic recursive clone,
  reflective specialization copier, or mutable component editor.
- A collection's `databaseSchemaName` is a declarative placement request.
- A collection without `databaseSchemaName` is placed into the once-resolved
  default schema.
- A requested schema is created in the resolved hierarchy when it was not
  declared upfront.
- The resolved hierarchy is authoritative for parent/child placement.
- Lazily created Pongo collections enter only the runtime tree.

Examples:

```ts
pongoSchema.db("app", {
  collections: {
    users: pongoSchema.collection("users", {
      databaseSchemaName: "audit",
    }),
  },
});

db.collection("entries", {
  databaseSchemaName: "audit",
});
```

Neither example requires an upfront `schemas.audit` declaration. Both place
the table beneath the `audit` `DatabaseSchemaComponent`, creating that schema
in the resolved runtime hierarchy if necessary.

### Identifiers, references, and traversal

These are separate concepts:

- A full logical identifier names a component in the resolved hierarchy.
- A physical SQL reference is produced by a database driver from that
  identifier.
- `SQLMigration.name` is the persisted migration identity.

Dumbo derives identifiers during its own traversal:

```ts
type DatabaseIdentifier = {
  databaseName: string;
};

type DatabaseSchemaIdentifier = DatabaseIdentifier & {
  databaseSchemaName: string;
};

type TableIdentifier = DatabaseSchemaIdentifier & {
  tableName: string;
};

type IndexIdentifier = TableIdentifier & {
  indexName: string;
};
```

PostgreSQL and SQLite code never recursively walks component records. Dumbo
owns recursion, structural order, extension traversal, cycle handling, and
migration-name duplicate detection. A driver receives one already identified
schema, table, or index at a time and returns SQL migrations only for that
component.

### No stringly or generic-maze replacement

- Names are typed domain fields, not encoded component identities.
- Parent names do not flow through every public generic parameter.
- Resolved placement uses the appropriate full identifier type rather than an
  optional `ComponentContext` bag.
- Schema composition, specialization, projection, and tests do not use the
  `Reflect` API.
- Pongo’s `Document` type is retained through a small symbol-backed phantom
  type only where TypeScript needs it.
- Public Pongo types use readable domain generics:

```ts
PongoDatabaseComponent<Definition>;
PongoSchemaComponent<Collections>;
PongoCollectionComponent<Document, Name, Indexes>;
PongoIndexComponent<Name>;
```

### Tests lead every change

For every slice:

1. Map existing tests to keep, adjust, remove, or add.
2. Add or adjust usage-facing tests first.
3. Run the new test and observe the intended failure.
4. Implement only that slice.
5. Remove superseded code and obsolete tests in the same slice.
6. Pass the slice gate before continuing.

Tests are named from user behavior, not implementation mechanics. Assertions
must not be weakened merely to make a rewrite pass.

## Audit findings

| Area                     | Current problem                                                                                                                                  | Required outcome                                                                                             | Slice |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ----- |
| Collection columns       | Pongo repeated a manual eight-column component type and used `SQL.columnN`                                                                       | One readable Dumbo table declaration using `dumboSchema.table`/`column`; types derived from it; no `columnN` | 1     |
| Dumbo base               | Internal mutable record registry and helper surface make the base harder to reason about                                                         | One small immutable component core with recursive identified traversal and migration aggregation             | 2     |
| Ownership records        | `.components`, `.schemas`, `.tables`, `.columns`, `.indexes`, and `.extensions` are assembled through multiple mutation helpers                  | Records remain authoritative, typed, immutable, ordered, and non-promoting                                   | 3     |
| Hierarchy composition    | `ComponentContext`, reflection-based specialization copying, and runtime editor behavior obscure what is being resolved                          | Direct construction of one resolved Dumbo hierarchy plus full identifiers derived by Dumbo traversal         | 4     |
| Driver schema migrations | PostgreSQL and SQLite `migrationsFor` callbacks mix dispatch, validation, references, SQL generation, and migration identity                     | Dumbo-owned traversal/aggregation plus small per-component dialect functions                                 | 5     |
| Pongo definition model   | Definitions and effective placement are still easy to confuse                                                                                    | Tagged immutable definitions that remain direct Dumbo specializations                                        | 6     |
| Runtime component model  | Runtime components carry `collectionName`, `sqlBuilder`, `.editor`, `.collection()`, and `.collections`, duplicating table and database concepts | Runtime behavior is held by the runtime DB/collection objects; schema components stay schema components      | 7     |
| Projection and cache     | Declared access, lazy access, aliases, and cache identity have overlapping paths                                                                 | One nested cache and one lookup/registration path per logical schema/table                                   | 8     |
| Driver resolution        | Configuration fallback logic has historically been split between client, cache, and drivers                                                      | Values are resolved once before the internal driver factory                                                  | 9     |
| SQLite identity          | Mapping must cover every SQL path without codecs or duplicated resolver layers                                                                   | One readable Dumbo SQLite reference resolver for tables and indexes                                          | 10    |
| Migration ledger         | Legacy component-ledger ideas and scattered reference handling add concepts without user value                                                   | Only schema/table ledger configuration; one resolved SQL reference                                           | 11    |
| Naming/dead code         | Transitional aliases, sentinels, casts, and obsolete exports remain possible                                                                     | Canonical names only; no dead compatibility layer                                                            | 12    |

## Slice 1 — Pongo collection columns through Dumbo `[done]`

### User-facing behavior

Pongo’s physical collection schema is visible in one place and follows the
same style as an ordinary Dumbo table:

```ts
const { table, column } = dumboSchema;
const { BigInteger, Boolean, JSON, Text, Timestamptz } = SQL.column.type;

const users = table("users", {
  columns: {
    _id: column("_id", Text, { primaryKey: true, notNull: true }),
    data: column("data", JSON<User>(), { notNull: true }),
    // remaining physical Pongo columns
  },
  primaryKey: ["_id"],
});
```

### Required changes

- Keep the Pongo schema as one contiguous Dumbo table declaration.
- Derive `PongoCollectionColumns<Document>` and
  `PongoCollectionComponent<Document, Name, Indexes>` from that declaration
  without manually repeating eight `ColumnSchemaComponent<...>` types.
- Remove `SQL.columnN` from runtime, types, tests, and exports.
- Keep `SQL.column` as the low-level SQL column token factory and
  `dumboSchema.column` as the schema-component factory.
- Preserve exact PostgreSQL and SQLite table DDL.
- Preserve exact row inference for all eight Pongo physical columns.

### Current progress

- `[done]` Negative compile-time test proves `SQL.columnN` is not public.
- `[done]` Pongo physical row inference test added.
- `[done]` `SQL.columnN` implementation and runtime test removed.
- `[done]` Pongo now uses Dumbo `table` and `column` factories.
- `[done]` Focused tests, full TypeScript, full unit tests, lint, and
  PostgreSQL/SQLite migration integrations passed.
- `[done]` Dumbo and Pongo declaration bundles pass without restoring the
  manual column type maze or suppressing declaration checks.

### Gate

- Dumbo TypeScript build.
- Dumbo schema/SQL unit tests.
- Pongo TypeScript build and type tests.
- Exact PostgreSQL and SQLite collection DDL tests.
- Full unit suite.
- PostgreSQL and SQLite migration integrations.
- ESLint and Prettier.
- Dumbo and Pongo package builds, including declaration bundles.
- `rg '\bcolumnN\b'` finds only the intentional negative type assertion.

No Slice 2 work starts until every item passes.

## Slice 2 — Simplify the Dumbo base component `[done]`

### Tests first

Keep or add usage tests for:

- a custom component with arbitrary record aliases;
- parent-local migration before child migrations;
- structural child order;
- one shared child visited once;
- a cycle terminating without recursion failure;
- duplicate migration names failing before SQL execution;
- immutable component records;
- typed predicate traversal through `findComponents`/`findComponent`.

### Required changes

- Keep one symbol discriminator on `SchemaComponent`.
- Keep one immutable local migration list.
- Keep one immutable child record.
- Remove any public construction/mutation helpers not required by users.
- Remove materializer-only state and operations from the public barrel as soon
  as Slice 4 no longer needs them.
- Remove opaque fallback behavior that treats an unknown object as a mutable
  leaf.
- Do not add URNs, component keys, string kinds, or `AdditionalData` generics.

### Gate

- Dumbo TypeScript, unit tests, lint, and package build.
- Full Pongo TypeScript and unit tests remain green.

## Slice 3 — Simplify Dumbo ownership and extensions `[done]`

### Tests first

- Database schema aliases remain typed.
- Explicit schema name conflicting with its record key throws.
- Table aliases remain typed independently from table names.
- Table placement constraints are validated.
- Index placement constraints are validated.
- Database/schema extensions use `{ eventStore }`.
- Extension internals are not promoted.
- Extensions work both as migration roots and nested components.
- Duplicate aliases at one structural boundary fail clearly.

### Required changes

- Build `.schemas`, `.tables`, `.columns`, `.indexes`, and `.extensions`
  directly from their input records.
- Keep those domain records authoritative.
- Derive `.components` structurally from those records once.
- Remove generic component-map mutation from declaration constructors.
- Preserve record order.
- Preserve reusable child declarations.

### Gate

- Dumbo runtime and type tests.
- Dumbo build/lint/package build.
- Full Pongo TypeScript and unit tests.

## Slice 4 — Replace materialization with explicit hierarchy composition `[done]`

### Tests first

- A collections-only Pongo database places collections in the resolved default
  schema.
- A collection with `databaseSchemaName: 'audit'` is nested under `audit`
  without an upfront schema declaration.
- `db.collection('users', { databaseSchemaName: 'audit' })` creates or reuses
  the `audit` schema in the runtime hierarchy.
- `db.schema('audit').collection('users')` has the same resolved placement.
- Passing a `databaseSchemaName` that conflicts with the active schema scope
  throws.
- A schema-group record key that conflicts with a collection's explicit
  `databaseSchemaName` throws.
- Original and frozen declarations remain unchanged.
- A reusable collection declaration can be used by separately resolved
  databases without retaining names from the first database.
- Full database, schema, table, and index identifiers are derived correctly by
  Dumbo traversal.
- Lazy collection registration changes only the resolved runtime hierarchy.

### Required changes

- Delete `materializeSchemaComponent`, its reflection-based specialization
  copying, and the public/general-purpose materialization options.
- Delete `editMaterializedDatabase` and the mutable record replacement path
  used by Pongo.
- After resolving `databaseName` and `defaultSchemaName`, build a normal
  `DatabaseComponent` from normal `DatabaseSchemaComponent` records.
- Group top-level collection declarations by:
  1. the collection's explicit `databaseSchemaName`, when present;
  2. otherwise the once-resolved default schema name.
- If a target schema does not yet exist, construct it as part of the resolved
  database hierarchy.
- For a collection already contained by an explicit schema group, validate an
  explicit `databaseSchemaName` against the containing record key.
- Keep `databaseSchemaName` as a placement request on the Pongo collection
  declaration; do not copy resolved parent names into all descendants.
- Add only the small immutable Dumbo operation needed to return a database
  hierarchy with one table added, including creation of the containing schema
  when absent. It is not a general component editor.
- Introduce explicit full logical identifier types:

```ts
type DatabaseIdentifier = { databaseName: string };
type DatabaseSchemaIdentifier = DatabaseIdentifier & {
  databaseSchemaName: string;
};
type TableIdentifier = DatabaseSchemaIdentifier & { tableName: string };
type IndexIdentifier = TableIdentifier & { indexName: string };
```

- Extend Dumbo traversal internally so the callback for a database, schema,
  table, or index receives its correctly narrowed identifier.
- Keep recursion, ordering, extension traversal, and cycle handling inside
  Dumbo. Pongo and database drivers must not implement a component walk.
- Do not add encoded identifiers, generic parent-name parameters, visitor
  classes, registries, lifecycle hooks, or public mutation APIs.

### Gate

- Dumbo hierarchy/identifier tests, TypeScript, lint, package build.
- Pongo declarations and existing runtime tests stay green.

## Slice 5 — Generate driver migrations through Dumbo traversal `[done]`

This slice directly addresses the current SQLite and PostgreSQL
`migrationsFor` functions.

### Why the current code is wrong

The callback currently:

1. detects component kinds;
2. validates location fields;
3. resolves physical table/index references;
4. interprets Pongo index strategy;
5. builds dialect SQL;
6. creates persisted migration names;
7. returns migrations to the generic materializer.

That is too much responsibility in one Pongo function. It also hides the
boundary: Dumbo should own traversal and aggregation, while the selected
driver should only turn one fully identified component into SQL.

### Tests first

- Dumbo asks for exactly one create-table migration for each identified Pongo
  collection.
- Dumbo asks for exactly one create-index migration for each identified Pongo
  index.
- Database migration order is schema, table, then index children.
- PostgreSQL schema creation precedes contained tables.
- PostgreSQL supports path, unique path, document GIN, and custom indexes.
- SQLite supports path, unique path, document, and custom indexes.
- Custom SQL receives logical names and resolved references.
- Table/index callbacks receive complete identifiers, without optional parent
  fields or defensive `undefined` checks.
- Reusable declarations are never mutated.
- Declared migrations remain component-local. Dumbo aggregates them together
  with driver-generated migrations exactly once.
- A test driver proves it receives identified components without performing
  traversal itself.

### Required changes

- Remove the monolithic SQLite and PostgreSQL `migrationsFor` dispatch
  functions.
- Add one Dumbo database-migration aggregation entry point. It performs the
  traversal and calls separately typed schema, table, and index migration
  functions with the matching full identifier.
- The driver functions do not inspect child records and do not call
  `findComponents`; they only resolve physical references and generate SQL for
  the component they receive.
- Keep declared migrations on their declarations.
- Keep driver-generated migrations in the Dumbo database migration result;
  do not inject them into recursively cloned table/index components.
- Keep only Pongo-specific JSON index target/strategy selection in Pongo.
- Share common unique/non-unique index construction instead of duplicating the
  full SQL ternary.
- Custom index callbacks receive:

```ts
{
  databaseName,
  databaseSchemaName,
  tableName,
  indexName,
  tableReference,
  indexReference,
}
```

- Migration names are produced in one place. Existing released table migration
  identities are preserved only where compatibility requires them.
- Do not export new `pongoSQLiteMigrationsFor` or similar helper APIs.

### Current progress

- `[done]` Dumbo owns identified traversal, structural ordering, cycle
  handling, declared-migration aggregation, and duplicate-name detection.
- `[done]` Dumbo owns PostgreSQL/SQLite table references, SQLite logical-name
  mapping, and ordinary/JSON-path/JSON-document/custom index SQL.
- `[done]` Pongo index declarations are ordinary Dumbo indexes with typed
  Dumbo targets; Pongo strategy symbols and dialect dispatch are removed.
- `[done]` Pongo CRUD builders receive resolved table references.
- `[done]` Pongo retains only small migration wrappers and one internal naming
  module for persisted `pongoCollection:*` ledger identities. They call
  Dumbo-owned dialect SQL and do not resolve references.

### Gate

- Dumbo traversal and migration aggregation tests.
- PostgreSQL and SQLite SQL unit tests.
- PostgreSQL and SQLite real-index integration tests.
- Repeat-migration and migration-order tests.
- Full build/lint/package build.

## Slice 6 — Normalize Pongo declarations `[done]`

### Tests first

- Exactly one of `collections` or `schemas`.
- Reusable unnamed schema.
- Explicitly named schema.
- Record-key/name conflict.
- `databaseSchemaName: 'audit'` placement constraint.
- A collection can select an undeclared schema.
- A collection without an explicit schema uses the resolved default schema.
- Explicit schema scope and `databaseSchemaName` conflicts fail.
- Frozen definitions remain unchanged.
- Pongo collections/indexes remain assignable to Dumbo table/index types.
- Extensions attach directly to databases and schemas.

### Required changes

- Keep the tagged XOR definition API.
- Keep Pongo declarations as direct Dumbo specializations.
- Use `databaseSchemaName` only to select placement while composing the
  resolved database hierarchy.
- Do not require a `schemas` definition merely to target a non-default schema.
- Remove sentinels from declarations.
- Remove definition/component aliases that represent the same object twice.

### Gate

- Pongo type tests, schema unit tests, Dumbo compatibility tests, build/lint.

## Slice 7 — Remove runtime behavior from schema components `[done]`

### Tests first

- `db.schema().collection('users')`.
- `db.schema('audit').collection('entries')`.
- `db.collection('users', { databaseSchemaName: 'audit' })` without a prior
  `audit` schema declaration.
- `db.users` and `db.audit.entries`.
- Live `db.schema.component`, `definition`, `migrations`, and `migrate`.
- No public `db.schemas` or `db.defaultSchemaName`.
- Runtime overrides do not replace cached default collections.

### Required changes

Remove schema-component fields that duplicate runtime concepts:

- `collectionName` duplicates `tableName`;
- component `sqlBuilder` is runtime behavior;
- component `.editor` is materializer machinery;
- component `.collection()` is runtime registration;
- component `.collections` duplicates hierarchy traversal.

The runtime database owns collection creation, caching, SQL builders, and
registration. The resolved Dumbo component tree owns schema structure. Dumbo's
database migration aggregation owns declared and driver-generated migrations.

### Gate

- Pongo runtime tests, TypeScript, lint, package build.
- PostgreSQL and SQLite collection operations remain green.

## Slice 8 — Unify runtime lookup, cache, and projection `[done]`

### Tests first

- Same collection name in two schemas has distinct identity.
- Repeated access in one schema returns the same collection.
- Declared alias differing from table name resolves the declared table.
- Lazy and projected access converge on the same cached instance.
- Registering a lazy collection creates its target schema when absent.
- Runtime name collisions with `keyof PongoDb` fail.
- Definitions are never mutated by projection.

### Required changes

- Use one nested runtime cache:

```ts
Map<schemaName, Map<tableName, PongoCollection>>;
```

- Use one declared-table lookup by effective schema/table name.
- Register a lazy collection once in the Dumbo runtime tree.
- Project properties with explicit descriptors/getters.
- Do not use nested proxies.
- Do not store runtime aliases in definition records.
- Keep one callable `db.schema` accessor.

### Gate

- Runtime unit tests, type tests, build/lint, both storage integrations.

## Slice 9 — Resolve driver configuration once `[done]`

### Tests first

- Per-`db()` option beats client default.
- Client default beats declaration/metadata.
- Declared database name participates at its documented precedence.
- Connection-string database beats driver fallback.
- Dumbo default schema metadata beats Pongo sentinel.
- Ambient PostgreSQL mismatch throws.
- SQLite/D1 reject switching logical database names.
- Migration-table precedence is per-call, database, client.

### Required changes

Resolve before calling the internal driver database factory:

1. Per-database options.
2. Client defaults.
3. Declared database name where applicable.
4. Dumbo metadata/connection parsing.
5. Pongo internal fallback.

Drivers receive required resolved values and do not run another fallback chain.
Every Pongo driver exposes its exact Dumbo driver.

### Gate

- Driver unit tests, TypeScript, lint, PostgreSQL/SQLite connection tests.

## Slice 10 — Finish physical reference handling `[done]`

### Tests first

- SQLite `main.users` remains `users`.
- `crm.users` maps readably and reversibly.
- Underscores are escaped without numeric codecs.
- Table and index namespaces cannot collide.
- Dumbo's private mapped-name prefix is rejected for native names.
- Every SQLite SQL builder uses the same resolver.
- PostgreSQL table qualification and unqualified create-index names are valid.

### Required changes

- Keep one Dumbo SQLite resolver for physical table/index references.
- Remove Pongo logical identity wrappers, mapping options, and decoders.
- Pass Dumbo-resolved references to Pongo builders.
- Keep Dumbo SQLite collision validation strict.

### Gate

- SQL resolver/unit tests and SQLite/PostgreSQL integrations.

## Slice 11 — Simplify migration-ledger configuration `[done]`

The supported public configuration is:

```ts
migrationTable: {
  schemaName?: string;
  tableName?: string;
}
```

There is no component-ledger option.

### Tests first

- Default ledger.
- Custom table.
- PostgreSQL custom schema/table.
- SQLite absent or `main` schema only.
- Creation, reads, inserts, and updates use one resolved reference.
- Repeated migrations remain idempotent.

### Required changes

- Remove legacy component unions and component-ledger implementation.
- Resolve the ledger reference once.
- PostgreSQL may create the configured ledger schema.
- SQLite rejects unsupported schema qualification.

### Gate

- Dumbo migrator tests, both database integrations, build/lint.

## Slice 12 — Final naming and dead-code sweep `[done]`

Remove only code proven obsolete by completed slices:

- old aliases and transitional exports;
- sentinels no longer used;
- `as never` and `unknown` casts introduced to bridge old/new models;
- old materializers and flattened migration helpers;
- duplicate predicates/resolvers;
- stale tests asserting removed behavior;
- comments and names such as `pongoCollection...` where they describe
  implementation rather than a required persisted migration identity.

Rename tests from the usage perspective while preserving their coverage.

### Gate

- `rg` audit for every removed symbol.
- Public API/type tests.
- Full verification sequence below.

## Full verification sequence

Run after every relevant slice, and run the entire sequence after Slice 12:

1. `npx tsc -b packages/dumbo/tsconfig.json --force --pretty false`
2. Dumbo unit/type tests.
3. Dumbo PostgreSQL integration/e2e.
4. Dumbo SQLite integration/e2e.
5. `npx tsc -b packages/pongo/tsconfig.json --force --pretty false`
6. Pongo unit/type tests.
7. Pongo PostgreSQL integration/e2e.
8. Pongo SQLite/D1 integration/e2e.
9. `npm run lint`
10. `npm run build`
11. `git diff --check`
12. Dead-code/export searches for the slice.

If a gate fails, the current slice remains active. Do not begin the next slice,
leave compatibility debris, disable a lint rule, weaken a test, or hide the
failure with a cast.

## Final acceptance criteria

- Dumbo supplies the component, ownership, identified traversal, DDL,
  migration aggregation, reference, and ledger abstractions Pongo needs.
- Pongo collections are real Dumbo tables with real Dumbo columns.
- Pongo indexes are real Dumbo indexes.
- Dumbo traverses the resolved hierarchy and aggregates declared plus
  driver-generated migrations; drivers never traverse components.
- Collections may select an undeclared schema with `databaseSchemaName`, and
  collections without it use the once-resolved default schema.
- Definitions remain immutable and reusable.
- Extensions attach directly and do not promote internals.
- Runtime lookup/cache/projection has one path.
- Driver values are resolved once.
- SQLite mapping is readable, centralized, and complete.
- No public URN system, `columnN`, generic clone/editor materializer,
  default-name binding wrappers, component ledger, flattened migration arrays,
  or monolithic driver `migrationsFor` dispatch remains.
- Full TypeScript, tests, lint, integrations, e2e, and package declaration
  builds pass.
