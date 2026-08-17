# Simplify the schema component model

## Context

Branch `schema_features` set out to simplify `schemaComponent` and add real
database-schema handling. The branch established several useful foundations,
but duplicated migration traversal, placement, extension ownership, and Pongo
schema grouping across multiple factories and type layers.

The foundations that stay are:

- immutable schema components with no parent pointers;
- placement passed downward through `SchemaComponentContext`;
- one migration traversal with deterministic ordering and deduplication;
- dialect-neutral SQL tokens;
- `SQLDefaultSchemaNameToken` as the logical default-schema marker;
- named database schemas;
- strong typing for declared Pongo collections and schemas.

The goal is to make the component model materially smaller than the current
branch while preserving schema support. Compare the result with `main` for
context, but do not delete useful behavior merely to force the total below a
baseline that did not support named schemas or extensions. Breaking changes are
accepted.
There will be no aliases, fallback readers, migration-name compatibility layer,
runtime overlays, monkey patching, or casts used to hide incorrect inference.
Nothing is committed; Oskar handles git.

Before implementation, record the exact merge-base SHA and the commands used
for production-line and export counts. Historical counts are evidence, not a
deletion criterion.

## Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `schemaComponent(kind, { components, context, migrations })` is the implementation base for all six factories.                                                                                                                                                                                          |
| 2   | `components` is a constructor input only. It is not exposed on `SchemaComponent`.                                                                                                                                                                                                                       |
| 3   | Dumbo tables lose `databaseSchemaName`; indexes lose `databaseSchemaName` and `tableName`. Dumbo placement comes only from context.                                                                                                                                                                     |
| 4   | A standalone index cannot generate DDL without table context. It throws a clear placement error; no assertion or cast supplies a missing table.                                                                                                                                                         |
| 5   | Generated migration names use `<type>:[<kind>:]<encoded-path>:<operation>`. `kind` is optional, has no default, and is emitted directly after the type segment only when the factory caller sets it. Because the migrator looks migrations up by name alone, a `kind` value is part of the migration's identity: it records what the object is, never where its declaration came from. There is no number segment. Index paths retain their table segment. |
| 6   | Every migration name is validated against the migration ledger's 255-character limit before execution. The `kind` segment and every generated path segment are independently encoded so distinct identifiers cannot collide.                                                                            |
| 7   | An unresolved `SQLDefaultSchemaNameToken` emits no create-schema migration. If Pongo binds that logical default slot to a concrete `defaultSchemaName`, it emits the same dialect-neutral `SQLCreateSchema` migration as an explicitly named schema.                                                    |
| 8   | Empty rendered SQL is still filtered by the migrator. This is required because named-schema creation renders empty on SQLite.                                                                                                                                                                           |
| 9   | An extension is flat and is table-scoped, schema-scoped, or migration-only. It does not contain nested extensions or mix placement-free `tables` with self-placing `schemas`. Placement follows the extension's own scope: table extensions attach to a named schema, or to a database, where they are placed in its default schema; schema extensions attach to a database directly. |
| 10  | Extension schemas are not flattened into `database.schemas`. They remain under the extension that owns them.                                                                                                                                                                                            |
| 11  | `DatabaseComponent` always exposes a `defaultSchema` for its logical default namespace and `schemas` for explicitly named schemas. `tables` is a getter onto `defaultSchema.tables`, not a second map. There is no empty-string schema key.                                                             |
| 12  | Dumbo's public database declaration contains exactly one of `tables` or `schemas`. Tables mode uses the dialect's native/default namespace; schemas mode requires every direct schema to be explicitly named.                                                                                           |
| 13  | `dumboSchema.defaultSchema` and `pongoSchema.defaultSchema` are removed as an intentional public breaking change, not because repository production code has no reader. Their supported replacements are database `tables` mode and Pongo `collections` mode.                                           |
| 14  | The lower-level `databaseComponent` can hold both direct `tables` and named `schemas`. This is required for Pongo collections mode, where root collections may have different physical placements; it is not the Dumbo declaration grammar.                                                             |
| 15  | A Pongo database declaration still contains exactly one of `collections` or `schemas`. This invariant is not changed.                                                                                                                                                                                   |
| 16  | In Pongo `collections` mode, root collections remain available as `database.users`, regardless of their physical placement. In `schemas` mode, declared collections remain available as `database.crm.users`.                                                                                           |
| 17  | `defaultSchemaName` stays. It binds Pongo's logical default slot to a concrete physical schema at database construction time, before migration names and SQL tokens are produced. It does not rewrite components or affect explicitly named schemas.                                                    |
| 18  | A Pongo database owns one evolving immutable `DatabaseComponent`. Dynamic collections replace that current value through `withTable`; reusable input declarations remain unchanged.                                                                                                                       |
| 19  | Pongo accepts both `PongoDatabaseComponent` and a plain Dumbo `AnyDatabaseComponent`. Only Pongo declarations receive inferred database properties; a plain Dumbo declaration uses typed `db.collection<User>(...)` without changing the static database shape.                                         |
| 20  | An export is removed only after its semantic role and its state on `main` are reviewed. Zero internal production readers alone are not enough.                                                                                                                                                          |

## Target Model

### Base component

```ts
schemaComponent(kind, {
  components,  // constructor input, captured privately
  context?,    // parent context -> scoped context
  migrations?, // receives the scoped context
})
```

The returned value contains only the kind marker and `migrations`. Migration
order is always:

1. the component's own generated and custom migrations;
2. child migrations in the order supplied by the owning factory;
3. one final deduplication pass by migration name and SQL.

A concrete factory owns its domain fields:

```ts
const component: TableComponent<...> = {
  ...schemaComponent(tableComponentType, {
    components: children,
    context: (parent) => ({ ...parent, tableName }),
    migrations: (scoped) => [
      createTableMigration(definition, scoped),
      ...(options.migrations?.(scoped) ?? []),
    ],
  }),
  tableName,
  columns,
  indexes,
  primaryKey,
  relationships,
};
```

`createTableSQL` and `createIndexSQL` receive plain definitions. They do not
close over a component declared later and do not require casts.

### Placement

The default schema child, named schema components, and table components
contribute Dumbo placement:

```ts
// Named schema: always override the parent placement.
{ ...parent, databaseSchemaName: schemaName }

// Default schema child: turn the database-wide default binding into actual
// placement only when this child is entered.
{
  ...parent,
  databaseSchemaName:
    parent.defaults?.schemaName ?? SQLDefaultSchemaNameToken.from(),
}

// Table: always contribute its own table name.
{ ...parent, tableName }
```

Column, index, extension, and database components use identity context.
`defaults.schemaName` is a database policy, while `databaseSchemaName` is
the current component's actual placement. Keeping them separate prevents a
Pongo default from leaking into database-level migrations or schema-scoped
extensions.

```ts
type SchemaComponentContext = Readonly<{
  defaults?: Readonly<{ schemaName?: string }>;
  databaseSchemaName?: string | SQLDefaultSchemaNameToken;
  tableName?: string;
}>;
```

### Database declarations

A database has one containment shape: a nameless default schema plus explicitly
named schemas. The two declaration keys name where a table lands, not which of
two shapes the database has, and a declaration may use both.

`tables` places a table in the dialect's native default namespace:

```ts
const app = dumboSchema.database("app", {
  tables: {
    messages,
  },
  extensions: {
    eventStore,
  },
});

app.tables.messages;
```

`schemas` places a table through an explicitly named schema:

```ts
const app = dumboSchema.database("app", {
  schemas: {
    public: dumboSchema.schema("public", { messages }),
    crm: dumboSchema.schema("crm", { users }),
  },
  extensions: {
    eventStore,
  },
});

app.schemas.public.tables.messages;
app.schemas.crm.tables.users;
```

`tables` and `schemas` may both appear. `tables` are the tables of the nameless
default schema; `schemas` are explicitly named. Schema record keys remain
canonical and must equal the explicit `schemaName`.

On PostgreSQL, direct tables use unqualified identifiers and therefore the
connection's active namespace, while a `public` schema declared explicitly
targets `public`. On SQLite, direct tables use ordinary table names, while named
schemas use the existing logical-to-physical mapping such as `crm.users`.

The public `dumboSchema.defaultSchema(...)` helper is removed. This is a
deliberate API replacement by `{ tables }`; lack of repository-internal callers
is not used as evidence that external users do not call it.

External migration is explicit:

```ts
// Before
dumboSchema.database("app", {
  default: dumboSchema.defaultSchema({ messages }),
});

// After
dumboSchema.database("app", {
  tables: { messages },
});
```

A declaration that means `public` on PostgreSQL must declare `public` as a named
schema; one intended to use the connection's native namespace uses `tables`.

The component shape is:

```ts
DatabaseComponent<Name, Tables, Schemas, Extensions> = {
  databaseName,
  defaultSchema,
  tables,
  schemas,
  extensions,
  migrations,
};
```

`databaseComponent` always constructs the `defaultSchema`, a
`databaseSchemaComponent` carrying `SQLDefaultSchemaNameToken`, and places the
direct tables and table-contributing extensions under it. `database.tables` is a
getter onto `defaultSchema.tables`, so there is one source of truth and tables,
extensions, or their owning database component are never cloned or rebuilt.

This is one component model with a stricter Dumbo declaration boundary, not a
parallel Pongo component or a second migration traversal.

Both maps are always present on the returned component, and either may be empty.
There is no XOR: a database with unscoped tables and named schemas is a normal
declaration, so Pongo needs no privileged lower-level representation to express
one.

Pongo keeps its mutually exclusive declaration modes:

```ts
pongoSchema.db("app", {
  collections: {
    users: pongoSchema.collection<User>("users"),
  },
});

pongoSchema.db("app", {
  schemas: {
    crm: pongoSchema.schema("crm", {
      users: pongoSchema.collection<User>("users"),
    }),
  },
});
```

In `collections` mode, unscoped collections are placed in the logical default
namespace and collections carrying Pongo's explicit `databaseSchemaName`
grouping metadata are placed in the matching named schema. Concretely, unscoped
collections are stored in `database.tables`, explicitly placed collections are
grouped under `database.schemas`, and both remain root Pongo properties:

```ts
database.users;
database.auditUsers;
```

In `schemas` mode, collections are projected by their declared schema:

```ts
database.crm.users;
```

Pongo schema declarations are explicitly named. The public
`pongoSchema.defaultSchema(...)` helper is replaced by collections mode:

```ts
// Before
pongoSchema.db("app", {
  schemas: {
    default: pongoSchema.defaultSchema({ users }),
  },
});

// After
pongoSchema.db("app", {
  collections: {
    users,
  },
});
```

That preserves the intended root access as `database.users`. It avoids a second
way to represent the same logical default placement under an arbitrary schema
property.

Pongo also accepts a plain Dumbo database component so relational declarations
and dynamic collections can share one migration/runtime boundary:

```ts
const relational = dumboSchema.database("app", {
  schemas: {
    crm: dumboSchema.schema("crm", { accounts }),
  },
});

const db = pongoClient({
  driver,
  schema: { definition: relational },
}).db();

db.collection<User>("users", { databaseSchemaName: "crm" });
```

This form does not infer `db.users` or `db.crm.users`; only declarations built
from Pongo collection components receive projected properties. No Pongo marker
or wrapper component is introduced to distinguish the inputs.

### Extensions

Extensions are flat. A table-scoped extension can be reused in either a named
schema or the logical default scope:

```ts
const eventStore = dumboSchema.extension("event-store", {
  tables: { messages },
  migrations: historicalEventStoreMigrations,
});

const named = dumboSchema.database("app", {
  schemas: {
    emt: dumboSchema.schema("emt", {}, { eventStore }),
  },
});

const unqualified = dumboSchema.database("app", {
  tables: {},
  extensions: { eventStore },
});
```

A schema-scoped extension owns explicitly named schemas and attaches to the
database itself:

```ts
const audit = dumboSchema.extension("audit", {
  schemas: {
    audit: dumboSchema.schema("audit", { entries }),
  },
});

dumboSchema.database("app", {
  schemas: {},
  extensions: { audit },
});
```

An extension never contains another extension. Compose several extensions by
listing them together at the database or schema attachment point. This removes
recursive mode classification, recursive lookup, and bundle collision rules.

### Pongo default-schema binding

`defaultSchemaName` is a database-wide placement policy for the logical default
slot:

```ts
const defaults = { schemaName: options.defaultSchemaName };
```

Pongo passes a configured value as `defaults.schemaName` in the parent
migration context. The default schema child converts it into actual
`databaseSchemaName`; named schemas set their explicit name independently.
Runtime SQL identifiers use the same configured value, or
`SQLDefaultSchemaNameToken` when none was configured.

With `defaultSchemaName: 'analytics'`:

```text
Pongo API:      database.users
migration names: schema:analytics:create
                 table:analytics:users:create
PostgreSQL:     "analytics"."users"
SQLite:         "analytics.users"
```

With the concrete binding, PostgreSQL records the schema migration; SQLite
renders it empty and does not record it. Without a binding, the generated table
name is `table:users:create`, there is no schema migration, and each dialect
uses its native default schema behavior.

`defaultSchemaName` applies to:

- unscoped declared root collections;
- unscoped dynamically created collections;
- placement-free tables from database-level extensions.

It does not move collections declared in named schemas or collections carrying
an explicit Pongo `databaseSchemaName`.

If a collections-mode declaration contains an explicitly placed collection in
`analytics` and `defaultSchemaName` is also `analytics`, both groups resolve to
one physical schema. That is valid: distinct tables coexist there. Resolution
must search both groups by the final physical `{ schema, table }` identifier.
The same collection component is reused; two different components targeting
the same physical table are rejected before migration deduplication. There is
no component merge or rewrite.

Dumbo's public declaration expresses this collision case directly, since
`tables` and `schemas` may both appear. A PostgreSQL caller wanting `public` and
`crm` still declares both as named schemas rather than leaning on the default
binding.

### Dynamic collections

Dynamic collections are created through
`db.collection<Document>(name, options)`. Each Pongo database keeps one current
immutable database component, initialized from the reusable schema definition.
On a lookup miss, Pongo creates a collection component and replaces the current
value through `component.withTable(...)`. The source definition remains
unchanged and the static database type does not grow.

`db.schema.component` is a getter for the current value. Its normal Dumbo
traversal is also the only source for `db.schema.migrations` and `migrate()`.
Creating a missing named schema is delegated to `DatabaseComponent.withTable`;
Pongo does not own schema-creation state, migration concatenation, or a second
dedupe pass.

### Relationship validation for direct tables

Direct tables are the default schema's tables, so they reach the existing
`ValidateDatabaseSchemas` as an ordinary schema. Two changes inside the existing
validator let a nameless schema pass through it:

- a schema's lookup key is separate from its name — `DatabaseSchemaKey`, which
  falls back to `DefaultSchemaKey` when the name is a token rather than a string;
- a nameless schema contributes no path segment, built that way in
  `QualifyColumnName` rather than stripped back out afterwards.

Named-schema behavior is unchanged and the internal key never reaches a public
error type. There is no adapter and no second validator.

### Migration names

The generated name is `<type>:[<kind>:]<encoded-path>:<operation>`.

This `kind` is the optional string on the table, index, and schema component
options. It is unrelated to `SchemaComponentKind` in `schemaComponent.ts`, which
is the symbol tagging `[schemaComponentType]`; the two share a word only.

`kind` is an optional caller-supplied marker recording what the declared object
is. It is emitted directly after the type segment and has no default, so a
caller that does not set it produces a name without a kind segment. Pongo sets
`pongo_collection` on collection tables and `pongo_index` on collection indexes.
That is the only thing distinguishing them anywhere: the ledger stores the name
and a hash but not the SQL, and a Pongo collection's `CREATE TABLE` is shaped
like any other table's.

A `kind` value therefore belongs to the migration's identity, because the
migrator looks migrations up by name alone. It must be a stable fact about the
object, such as `pongo_collection`. It must not record where the declaration
came from — an owning extension, or whether the collection was created
dynamically — because those change while the physical table does not, and a
changed name re-runs the migration, no-ops against `CREATE TABLE IF NOT EXISTS`,
and records a second ledger row for the same table.

Every user-controlled identifier — the `kind` segment and each path segment — is
encoded independently before segments are joined with `:`. Keep the encoding
helper private in `migrationNames.ts`. Percent encoding is sufficient because it
also escapes `%`, so encoded and literal encoded-looking identifiers remain
distinct. Before any migration is executed, validate its complete name against
the ledger's 255-character limit and throw a clear error rather than relying on
a database insertion failure.

```text
schema:readmodels:create
table:users:create
table:readmodels:users:create
index:readmodels:users:users_email_idx:create
table:pongo_collection:users:create
table:pongo_collection:readmodels:users:create
index:pongo_index:readmodels:users:users_email_idx:create
table:a%3Ab:c:create
table:a:b%3Ac:create
```

Hand-named historical migrations are not rewritten.

## Feasibility Check

This design is implementable without monkey patching, component reconstruction,
or a second migration path:

- `tsconfig.shared.json` enables strict mode and
  `exactOptionalPropertyTypes`. Pongo's existing `collections?: never` /
  `schemas?: never` union carries its declaration modes; Dumbo requires no
  such XOR.
- `schemaComponent.migrations(context?)` already passes context downward.
  `databaseSchemaComponent` already owns schema placement, schema DDL, table
  traversal, and schema-level extensions. A token-scoped instance can therefore
  own direct-table traversal without duplicating that logic.
- `databaseComponent` determines the child list for each immutable value. The
  default schema is its first child, alongside named schemas; `withTable` and
  `withSchema` rebuild that value through the same factory.
- Pongo's static grouping is currently concentrated in
  `directCollectionsSchemas` in `pongo/core/schema/index.ts`. Replace that one
  grouping step with direct tables plus named schemas while retaining the
  original collections record for root projection.
- Pongo's runtime lookup and migration access are concentrated in
  `pongo/core/database/pongoDb.ts`. Final physical-identifier lookup stays there,
  while one evolving `AnyDatabaseComponent` is the schema and migration source.
- PostgreSQL's existing `SQLCreateSchema` processor creates a concrete schema.
  SQLite's registered processor renders the same token empty, and the migrator
  already removes and does not record empty SQL. A bound `defaultSchemaName`
  therefore uses existing dialect behavior.
- Direct tables reuse the existing relationship validator as the default
  schema's tables. This changes neither runtime placement nor relationship
  semantics and avoids a parallel unqualified validation stack.

The implementation must stop if preserving exact table/collection inference
requires an assertion or if the default schema would cause a table or extension
migration to be traversed twice.

## Steps

The steps are sequential. Tests that assert a changed contract are updated in
the same step. After each step, run the standard gate from
`/home/oskar/Repos/Pongo/src`.

### Step 0 - Baseline and contract tests

- Record the merge-base SHA used for comparison.
- Record exact commands and exclusions for production-line and export counts.
- Add or identify Vitest type tests that prove:
  - a Dumbo database accepts exactly one of `tables` or `schemas`;
  - tables mode exposes `database.tables` and schemas mode exposes
    `database.schemas` with exact declaration types, while the inactive output
    map is exactly empty;
  - `pongoSchema.collection<User>('users')` retains `User` through database and
    client projection;
  - `collections` and `schemas` remain mutually exclusive;
  - collections mode projects root properties;
  - schemas mode projects nested properties;
  - a plain Dumbo `AnyDatabaseComponent` is accepted by Pongo without inferred
    database properties, while `db.collection<User>(...)` remains typed;
  - direct tables reuse the existing relationship validation for local-column
    and `table.column` references without exposing an internal schema label.
- Add focused runtime tests for the current `defaultSchemaName` behavior before
  changing its implementation.
- Before deleting any existing export in Steps 1 or 2, add it to the public
  surface audit with its state on `main`, semantic role, replacement, and
  decision. In particular, audit `SchemaComponentMigrator`, the migration-table
  singleton, and the specialized component guards before removing them.
- Do not change production behavior in this step.

### Step 1 - Migrator cleanup

- Delete `SchemaComponentMigrator` and the singleton
  `migrationTableComponent`. Rewrite their three repository specs to call
  `runSQLMigrations(pool, component.migrations(), options)` directly.
- Keep `migrationTableComponentFor`; `runSQLMigrations` uses it for bootstrap.
- Delete `validateComponent` from `MigratorOptions` and flatten the remaining
  `schema.migrationTable` option to `migrationTable`.
- Keep the existing default-migrator-options registry in this refactor. The pool
  exposes a driver type, not the actual driver instance, so replacing the
  registry now would require new pool state or another registry. Do not claim
  the driver is already resolved and do not attach state to pools after creation.
- Keep the private empty-render filter and the `sqls.length === 0` short circuit.
  Rename `rendersNothing` only if the new name makes the filtering operation
  clearer; do not delete the behavior.
- Keep migration-table bootstrap behavior explicit. Do not route SQLite through
  a create-schema token.

### Step 2 - Make `schemaComponent` the base

- Change `SchemaComponent<Kind>` to expose only:
  - `[schemaComponentType]`;
  - `migrations(context?)`.
- Keep constructor children in the base factory options and capture them in the
  migration closure. Remove `.components` from returned values.
- Add `context(parent)` to the base options. Run own migrations and all children
  with the resulting scoped context.
- Rewrite `databaseComponent`, `databaseSchemaComponent`, `tableComponent`,
  `indexComponent`, `columnSchemaComponent`, and `extensionComponent` as their
  own literal fields spread over `schemaComponent(...)`.
- Define each specialized factory's options directly. Remove the seven
  `Omit<SchemaComponentOptions, 'components'>` expressions rather than replacing
  them with another shared options hierarchy.
- Change `isSchemaComponent` to check the marker and migration function, not a
  public children array.
- Change `createTableSQL` and `createIndexSQL` to accept plain definitions.
- Replace the column factory's `as unknown as` conditional return with overloads
  and prove the result using Vitest `expectTypeOf` tests.
- Delete the five unused kind guards only after confirming no runtime boundary
  performs that check. Keep `isSchemaComponent` and `isTableComponent`, which
  Pongo uses to identify collection components.
- Remove `.components` assertions from unit tests. Replace them with migration
  order, scoped-context, and deduplication assertions.

### Step 3 - Make context the only Dumbo placement source

- Remove `databaseSchemaName` from `TableComponent` and table options.
- Remove `databaseSchemaName` and `tableName` from `IndexComponent` and index
  options.
- Convert existing production callers rather than claiming none exist:
  - `migrationTableComponentFor` places a migration table through a schema
    component when a schema is requested;
  - Pongo keeps `databaseSchemaName` only on `PongoCollectionComponent` as
    grouping metadata and does not pass it into Dumbo table construction.
- Delete table-vs-schema and index-vs-table conflict loops made obsolete by
  context-only placement.
- Named schema context always overrides parent schema placement.
- Add `defaults?: Readonly<{ schemaName?: string }>` to
  `SchemaComponentContext` as a database policy distinct from actual
  `databaseSchemaName` placement. The
  default schema child converts that policy into actual placement and otherwise
  contributes `SQLDefaultSchemaNameToken`.
- Table context always contributes `tableName`.
- Make index migration generation throw a clear error when `tableName` is absent
  from context. Do not use `!`, a cast, or a synthetic table name.
- Verify custom migration callbacks receive the fully scoped context.

### Step 4 - Correct generated migration names

- Keep `kind?: string | undefined` on the schema, table, and index component
  options. Delete only its three `?? 'relational'` defaults, at
  `core/schema/components/tableComponent.ts:93`,
  `core/schema/components/indexComponent.ts:164`, and
  `core/schema/components/databaseSchemaComponent.ts:62`, so the segment is
  emitted only when a caller sets it. Keep the `kind` passthrough on
  `dumboSchema.ts:84`.
- Leave Pongo's four `kind` call sites unchanged, all in
  `pongo/src/core/schema/index.ts`: `kind: 'pongo_collection'` at `:115`, and
  `kind: 'pongo_index'` at `:273`, `:295`, and `:310`.
- Rewrite `migrationNames.ts` to emit
  `<type>:[<kind>:]<encoded-path>:<operation>`, joining static type and operation
  segments with the independently encoded kind, schema, table, and index
  segments. Omit the kind segment entirely when `kind` is `undefined`. Run
  `kind` through the same private encoder as the path segments: today it is
  interpolated raw at `migrationNames.ts:14`, `:23`, and `:33`, so a `kind`
  containing `:` silently corrupts the name. Generated names contain no number
  segment and no numbering option is added to any factory.
- Add collision tests covering `:`, `%`, and the concrete cases:
  - schema `a:b`, table `c`;
  - schema `a`, table `b:c`;
  - kind `a:b`, schema `c`, table `d`.
- Add a test proving a relational table and a Pongo collection sharing a name in
  one schema produce different migration names — `table:crm:users:create` and
  `table:pongo_collection:crm:users:create` — and are therefore no longer caught
  by a migration-name collision in `dedupeMigrations`. That physical duplicate
  must be rejected by the physical-identity checks required in Steps 5 and 6,
  which compare resolved schema and table names rather than migration names.
- Do not emit a generated create-schema migration when the scoped placement
  remains `SQLDefaultSchemaNameToken`. Continue running custom migrations and
  children of that component.
- When a logical-default schema child receives a concrete default binding from
  Pongo, emit `schema:<encoded-name>:create` and `SQLCreateSchema` for that
  concrete name. PostgreSQL then creates a custom `defaultSchemaName`; SQLite
  renders the token to empty SQL and the migrator does not record it.
- Validate every generated and hand-named migration against the ledger's
  255-character name limit before querying or inserting the migration row. Add
  boundary tests for exactly 255 characters and for a rejected longer name.
- Keep named-schema `SQLCreateSchema` migrations. They render to executable DDL
  on PostgreSQL and empty SQL on SQLite.
- Keep migrator empty-SQL filtering. Add boundary tests proving:
  - a SQLite named-schema migration is skipped and not recorded;
  - a PostgreSQL named-schema migration is applied and recorded;
  - a migration containing empty and non-empty statements executes only the
    non-empty statements;
  - an all-empty migration is not recorded.
- Do not broaden this refactor to the empty `ExpandSQLIn` parameter edge case;
  it is not reachable from schema-component migrations and needs a separate SQL
  formatter decision.
- Run PostgreSQL integration and both e2e suites after this step because every
  generated migration name changes.

### Step 5 - Simplify extensions without flattening

- Give `ExtensionComponent` one declaration union:
  - table-scoped: `{ tables, schemas?: never, migrations? }`;
  - schema-scoped: `{ schemas, tables?: never, migrations? }`;
  - neutral: `{ tables?: never, schemas?: never, migrations? }`.
- Remove nested `extensions` from `ExtensionComponent`. Composition happens at
  the attachment point by listing multiple flat extensions. Do not add recursive
  mode classifiers, a public mode marker, or a replacement bundle abstraction.
- List children once in deterministic table or schema order. The base already
  places own migrations before children.
- Delete `SchemasFromExtensions`, its casts, and both schema owner-map loops.
- Keep `database.schemas` limited to direct named schemas. Extension-owned
  schemas remain at `database.extensions.x.schemas`.
- Enforce in this step that a named schema accepts only a table-scoped or
  neutral extension. Database-level routing is completed in Step 6, so this step
  does not add a temporary default-placement branch.
- The final attachment rules are:
  - a table-scoped extension attaches to one named schema, or to a database,
    where it is placed in the default schema;
  - a schema-scoped extension attaches to a database directly;
  - a neutral extension attaches in either place;
  - placement follows the extension's own scope, so no attachment is
    incompatible at the database level and none is traversed twice.
- Remove Pongo's type-level extension-schema subtraction and runtime
  `extensionSchemaKeys` set.
- Centralize collection lookup in `PongoDatabase`. Search the current database
  component, including direct declarations and directly attached flat
  extensions; there is no recursive extension traversal.
- If multiple matching physical tables are found, throw immediately. Reuse one
  matching Pongo collection; reject an ordinary Dumbo table with the same
  physical name. Do not add a duplicate and wait for migration deduplication.

### Step 6 - Make database placement explicit and keep declarations reusable

A database has exactly one containment shape: a nameless default schema plus a
record of explicitly named schemas. Direct tables on a database are not a second
shape; they are the default schema's tables. Every rule below follows from that.

- `DatabaseComponent` becomes `DatabaseComponent<DatabaseName, Tables, Schemas,
  Extensions>`, matching the options object order. It exposes:
  - `defaultSchema`, always present, a real `databaseSchemaComponent` named by
    `SQLDefaultSchemaNameToken`, holding the direct tables. It is visible, not a
    hidden private component;
  - `schemas`, the explicitly named schemas, whose record keys continue to equal
    their explicit `schemaName`. The default schema is not in this record,
    because it has no name to key by;
  - `tables`, a getter onto `defaultSchema.tables`. One source of truth: no
    second map, no copied components.
- Delete `databaseSchemaKey` and `defaultDatabaseSchemaKey = ''`.
- `databaseComponent` accepts `{ databaseName?, tables?, schemas?, extensions?,
  migrations? }`. Both `tables` and `schemas` may be present together: a database
  with unscoped tables and named schemas is legitimate, and Pongo collections
  mode is exactly that. There is no XOR, statically or at runtime, and Pongo
  needs no privileged lower-level representation.
- The default schema is the first migration child, before named schemas. It
  emits no `CREATE SCHEMA`, because it has no name.
- Extensions route by their own scope, with no dependence on any mode: an
  extension contributing tables attaches to the default schema; one contributing
  schemas attaches to the database; a neutral one attaches to the database. Each
  is traversed exactly once, so no extension can be reached twice.
- In Dumbo's public `dumboSchema.database` factory, accept `database(definition)`
  and `database(name, definition)` with `{ tables?, schemas?, extensions?,
  migrations? }`. Keep the optional database name positional. Remove the
  positional schema and positional extension overloads rather than normalizing
  several ambiguous call shapes.
- Exact access survives on both sides: `database.tables.<name>` and
  `database.schemas.<name>.tables.<name>` are exactly typed from the
  declaration. Do not introduce aliases or conditional component wrappers.
- Remove `dumboSchema.defaultSchema` and `pongoSchema.defaultSchema` from their
  public factory objects and update all repository call sites. This is an
  accepted public API break with explicit replacements, not a zero-reader
  cleanup:
  - Dumbo default-only declarations use `{ tables }`;
  - Pongo default-only declarations use `{ collections }`.
- Validation needs no adapter. The default schema is a real schema, so it goes
  through the existing `ValidateDatabaseSchemas` machinery unchanged. Two
  supporting changes make that work, both inside the existing stack:
  - separate a schema's lookup key from its name. Named schemas key by their
    name and behave identically to before; the nameless default schema keys by
    a stable well-known value derived from `SQLDefaultSchemaNameToken`, never
    by `''`, an ad-hoc magic string, or a freshly allocated token;
  - a nameless schema contributes no segment. Reference paths are built as
    `table.column` for the default schema and `schema.table.column` for a named
    one, and its table errors carry no `{ schema }` wrapper. This happens at
    path construction: never build a qualified string and strip a prefix back
    off it, and never add a second normalization, validation, or formatting
    stack.
- Preserve Pongo's declaration union exactly:
  - `{ collections: ...; schemas?: never }`;
  - `{ schemas: ...; collections?: never }`.
- In Pongo collections mode:
  - put unscoped collections in `database.tables`;
  - group explicitly scoped collections into named `schemas`;
  - the default schema exists whether or not the declared collection record is
    empty, so it always carries the selected logical-default scope for dynamic
    collections;
  - retain the original `collections` record for root API/type projection.
- In Pongo schemas mode, accept only explicitly named schemas and retain nested
  projection.
- If Pongo's configured `defaultSchemaName` equals an explicit collection's
  `databaseSchemaName`, treat them as one physical namespace. Distinct tables
  coexist. Reuse the same collection component by physical identifier and
  reject different components targeting the same physical table.
- Add immutable `withTable` to schema/database components and `withSchema` to
  database components. Rebuild through the existing factories, preserving
  migrations and extensions while leaving reusable input declarations unchanged.
  Dynamic entries are still added only through `db.collection`; do not add a
  mutable Dumbo runtime `.table` API.
- Search the current component by resolved physical schema and table identifier,
  so a configured default equal to a named schema is one physical namespace.
  An existing non-Pongo table with the requested physical name is an error.
- The declared-and-extension half of that lookup is Dumbo's `findTables`, added
  in Step 5. It walks one list here, the default schema followed by the named
  schemas, with no containment branch; do not re-walk the containment shape in
  Pongo. Move the duplicate-physical-table rejection
  next to it in Dumbo: end-to-end proof 14 rejects a Dumbo relational table and
  a Pongo collection sharing one physical name, and the Dumbo-only side of that
  check must hold with no Pongo collection involved. Pongo keeps only the
  Pongo-collection predicate and what to create on a miss.
- Let named `DatabaseComponent.withTable` create a normal direct schema when it
  is absent. Pongo does not keep separate schema-creation ownership state.
- `db.schema.component`, `db.schema.migrations`, and `migrate()` read the same
  current component. Dumbo traversal provides ordering and deduplication.
- Remove or merge a duplicate `schema.definition`/`schema.component` accessor
  only if they become the same value and repository consumers are updated in
  this step.
- Resolve the existing helper surface affected by the new database call shape in
  this step: update `dumboDatabase.from` to pass `{ schemas }`; after recording
  the public break in Step 0, delete `dumboDatabaseSchema.from` because its
  column-less tables emit no table DDL; expose `extensionComponent` directly
  instead of retaining the `dumboExtension` pass-through; and delete the
  `void schemaComponentType` tombstone with its dead import.

### Step 7 - Bind Pongo's logical default placement once

- Keep `defaultSchemaName` on `PongoClientOptions`, `PongoDbOptions`, driver
  factory options, and `PongoDatabaseOptions`.
- Keep the configured string as `defaults.schemaName` and derive one
  runtime placement value: that string or `SQLDefaultSchemaNameToken` when it is
  absent.
- Pass only a configured string as `defaults.schemaName` in the parent
  migration context. The default schema child converts it into actual
  `databaseSchemaName`; named schemas set their own placement, and database-level
  or schema-scoped extension migrations do not receive a false current schema.
- A concrete binding emits the normal named create-schema migration before its
  direct tables. An unresolved token emits no create-schema migration. Do not
  assume that a custom PostgreSQL `defaultSchemaName` already exists.
- Use the same value for runtime table identifiers and dynamic unscoped
  collections. Migration names, migration SQL, collection CRUD SQL, and SQLite
  physical names must agree.
- Do not write the resolved string back into declared components and do not
  resolve the token in SQL formatters.
- Explicit collection `databaseSchemaName` and schema declarations always win
  over the database default binding.
- Resolve collection lookup by final physical schema and table name across the
  current default schema, named schemas, and directly attached flat extensions.
  This handles `defaultSchemaName: 'crm'` alongside a collection explicitly
  placed in `crm`. Dumbo's `findTable` receives the bound `defaults.schemaName`.
- Fix `PongoDatabaseCache`: `db(name, options)` options are creation-time
  configuration. If a database instance already exists for a database name, a
  later `db(name, options)` call with any options must throw a clear
  configuration error instead of silently returning the first instance. Reuse is
  `db(name)` with no options.
- Add tests for client-level default, per-database override, unconfigured native
  default, creation of a custom PostgreSQL default schema, SQLite's empty schema
  DDL, named-schema immunity, equal default/explicit physical placement,
  duplicate physical-table rejection, dynamic collection placement, migration
  names, and setting up a cached database with options.

### Step 8 - Simplify Pongo typing and audit the public surface

- Keep plain Dumbo `AnyDatabaseComponent` as an accepted Pongo schema
  definition. It supports declared relational migrations plus runtime
  `db.collection<User>(...)` without inferred database properties.
- Preserve strong projected properties only for Pongo declarations. Dynamic
  collection creation remains typed through the explicit
  `db.collection<User>(...)` call and does not alter the static database shape.
- Keep this distinction at the existing input/projection boundary. Runtime
  projection may inspect the existing `collections` declaration field and
  `isPongoCollectionComponent`; do not add a database marker, wrapper component,
  phantom brand, new conditional-type extraction layer, or cast to distinguish
  definitions. Prove both return shapes with Vitest type tests; if structural
  inference cannot distinguish them cleanly, stop.
- Evaluate `pongoDocumentType` by replacing `DocumentOf` inference with existing
  typed collection/column information. Delete the marker only if Vitest type
  tests retain exact `User` inference without a cast or new helper type. If
  inference fails, keep the marker and record the missing type relation rather
  than laundering it.
- Keep `PongoSchemaScope` as the public `db.schema(name)` accessor. Remove only
  its redundant runtime check for an option that its signature already omits.
- Do not collapse `PongoDatabaseShape` and `PongoDbWithSchema` merely because
  their conditional chains look similar; one describes a component and the
  other a runtime projection. Remove either one only by direct substitution with
  an existing type. If removing one needs a new vague helper or a clever bridge,
  keep the explicit types.
- Do not split the Pongo schema file solely to reduce line count. First remove
  obsolete logic; split only along an existing responsibility if the remaining
  file is still difficult to navigate.
- Review export candidates in an explicit table containing:
  `symbol`, `used on main`, `current role`, `consumer value`, `replacement`, and
  `decision`. Each decision is one of `keep`, `make private`, `delete`, or
  `stop`; prefer `keep` over replacing a simple explicit type with a more
  abstract one.
- Apply these already verified dispositions:
  - both `dumboSchema.defaultSchema` and `pongoSchema.defaultSchema` were
    removed in Step 6 as the agreed `{ tables }` / `{ collections }` API
    replacement; what remains here is listing the external migration in release
    notes;
  - keep `MigrationStyle` in Dumbo; migration style is generic migration
    configuration, and Pongo imports it from Dumbo where needed;
  - keep `IndexIdentifier` internally if `createIndexSQL` needs it, but stop
    exporting it;
  - make `MIGRATIONS_LOCK_ID` private;
  - delete `generatedIndexName` and `generatedIndexNameSegment` only after their
    generation responsibility is confirmed obsolete;
  - delete `MigrationRecord` only if no public migration-query API returns or
    accepts it;
  - delete the `SchemaComponentRecord` alias if `SchemaComponentMap` remains the
    single name;
  - do not delete either JSON index target while both processors/factories use
    them;
  - delete `supportsSchemas` and `supportsFunctions` only as unused metadata;
    never add dialect branching to components merely to create readers;
  - assess `toClientSchemaMetadata` as a public conversion utility, not merely by
    repository reference count.
- Remove absence-only type tests for designs already deleted. Keep positive type
  tests for supported API and inference.

### Step 9 - Documents and metrics

- Rewrite `spec.md` against the final decisions, including:
  - Dumbo's single containment shape — a nameless default schema plus named
    schemas — and the `tables` / `schemas` declaration keys that place into it;
  - the deliberate replacement of public `defaultSchema(...)` helpers;
  - encoded migration names carrying an optional caller-set `kind` segment and
    no number segment, the rule that a `kind` value is part of a migration's
    identity and records what an object is rather than where it came from, and
    the 255-character ledger limit;
  - no generated schema migration for an unresolved default token, but a normal
    named migration for a concrete Pongo `defaultSchemaName` binding;
  - SQLite named-schema migrations rendering empty and remaining unrecorded;
  - non-flattened extension schemas;
  - the Pongo `collections` xor `schemas` declaration;
  - root Pongo projection for collections mode;
  - plain Dumbo database definitions remaining valid for unprojected dynamic
    Pongo collections;
  - runtime `defaultSchemaName` binding;
  - reusable immutable declarations plus one evolving Pongo database component;
  - flat, non-nested extensions.
- Rewrite `plan.md` and `todo.md` to describe the implementation actually
  completed. Update samples and public API documentation.
- Write `metrics/final.md` with exact commands and production-line/export deltas
  against both the recorded merge base and pre-refactor HEAD. Production code
  must be materially smaller than pre-refactor HEAD. Treat the comparison with
  `main` as context rather than a quota that justifies deleting useful behavior.

### Step 10 - Decide the DDL privilege policy - discussion, not implementation

Nothing is implemented under this step until the questions below are settled.
It does not block Steps 4-9; it is scheduled after them because Step 6 moves who
creates the logical-default schema child and Step 7 binds Pongo's configured
default, and both change what emits `CREATE SCHEMA`.

The problem Step 3 exposed. `migrationTableComponentFor` used to take
`createSchema`, which was the only way a caller could ask for a schema-qualified
ledger without also emitting `CREATE SCHEMA`. The flag was already dead - the
migrator passed `createSchema: databaseType === 'PostgreSQL'` next to a
`schemaName` that was `undefined` on every other dialect, so the conjunction was
exactly `schemaName !== undefined` - and Step 3 deleted it. On PostgreSQL the
statement now runs where it previously did not for an external caller, and it
requires CREATE privilege on the database. Running migrations under a restricted
role against a pre-provisioned schema is an ordinary deployment shape, so the
capability the flag accidentally provided is worth having deliberately.

Restore it as a deployment policy, not as a per-call flag on one internal
factory. Whether the process running migrations may issue privileged DDL is a
property of the deployment, not of the schema declaration, and the declaration
must read identically in both cases.

Open questions.

- **Shape.** Prefer a union over booleans. A negative boolean encodes its default
  into its name and reads as a double negative at the call site
  (`disableDatabaseCreation: false`); a union has no implicit off state, so both
  states are written out and the default is a recorded choice rather than an
  absence. Prefer one union naming the privilege level over one member per object
  type, which needs a cross product as soon as a third privileged statement
  exists. Candidate: `privileges?: 'full' | 'restricted'`, where `restricted`
  emits no statement requiring rights beyond the migrator's own objects.
- **Scope.** Schema creation is the real case. Database creation addresses
  nothing today: Dumbo emits no `CREATE DATABASE` anywhere, `databaseComponent`
  contributes no migration of its own, and the statement cannot run against the
  database it creates, so it needs a separate connection and a separate
  lifecycle. Decide whether to introduce it as a real feature or leave it out.
  Do not add an option that no code path can honor.
- **Transport.** The create-schema migrations are produced inside
  `databaseSchemaComponent`. Filtering them in the migrator by a `schema:` name
  prefix couples the runner to the name grammar. Threading the policy down
  through `SchemaComponentContext`, beside `defaults.schemaName`, reuses
  the mechanism Step 3 established: a database-level policy flows down and the
  component that owns the concern decides. Prefer the context unless it forces a
  component to read a policy it has no business knowing.
- **Behavior when disabled.** Silently omitting the create-schema migration is
  the only coherent option - the whole premise is that the schema already
  exists - but it must omit uniformly, including the migration table's own
  schema. Failing fast contradicts the reason for asking. Confirm that a missing
  schema then surfaces as the dialect's own error and not as a confusing
  downstream failure.
- **Default.** The permissive member preserves current behavior and keeps the
  Step 3 break in place for external callers, who then opt out. The restricted
  member is safer for constrained roles but silently changes every existing
  deployment: named schemas stop being created and migrations fail with a
  missing-schema error nobody asked for, where the permissive default fails
  loudly and legibly with a permission error instead. Pick one and record why.
- **Boundary.** Name what else counts as privileged DDL under the same policy -
  PostgreSQL `CREATE EXTENSION` is the obvious candidate - so the option does not
  grow a second, differently-shaped sibling later.

## Verification

After every implementation step, from `/home/oskar/Repos/Pongo/src`:

```sh
npm run build:ts
npm run fix
npm run test:unit
npm run test:int:sqlite
```

After Steps 4, 6, and 7, and at the end:

```sh
npm run test:int:postgresql
npm run test:e2e:postgresql
npm run test:e2e:sqlite
```

Final concept checks, excluding `dist` and `node_modules`:

```sh
rg "SchemasFromExtensions|databaseSchemaKey|defaultDatabaseSchemaKey|'relational'"
rg "\\bSchemaComponentMigrator\\b|\\bmigrationTableComponent\\b|validateComponent"
rg "withTable|generatedIndexName|generatedIndexNameSegment|migrationNumber"
rg "extensionContainsTables|extensionContainsSchemas"
rg "dumboSchema\.defaultSchema|pongoSchema\.defaultSchema" src/packages
rg "\\.components\\b" src/packages --glob '*.ts' --glob '!*.spec.ts'
```

Search for the quoted `'relational'` literal, not the bare word: the word still
appears legitimately in prose and in local identifiers. Do not search for
`kind`, `pongo_collection`, or `pongo_index` as deleted concepts; the option and
both Pongo values are retained deliberately, and only the `'relational'` default
is removed. Do not search for `rendersNothing` or `registerDefaultMigratorOptions`
as deleted concepts; their behavior/registry remains deliberately. Search for
`pongoDocumentType`, `supportsSchemas`, `supportsFunctions`,
`toClientSchemaMetadata`, and other audited exports only when their individual
review decision says they were deleted.

## End-to-End Proof

Run the same behavior on PostgreSQL and SQLite:

1. Declare a table-scoped `eventStore` extension with placement-free tables and
   hand-named historical migrations.
2. Attach it to named schema `emt` in a schemas-mode database; its table
   migration is `table:emt:messages:create`.
3. Attach it to a tables-mode Dumbo database and verify its unqualified native
   placement on both dialects.
4. Attach it to a collections-mode Pongo database with
   `defaultSchemaName: 'readmodels'`; its migrations include
   `schema:readmodels:create` and `table:readmodels:messages:create`,
   while collections declared in collections mode remain root-level API
   properties.
5. Verify a collections-mode Pongo declaration exposes `database.users`,
   preserves `User` inference, and generates
   `table:pongo_collection:users:create` for the collection and
   `index:pongo_index:users:users_email_idx:create` for a declared collection
   index, while the `eventStore` extension's table in the same database
   generates `table:messages:create` with no kind segment.
6. Verify a schemas-mode Pongo declaration exposes `database.crm.users` and does
   not expose `database.users`.
7. Verify Dumbo `tables` and `schemas`, and Pongo `collections` and `schemas`,
   cannot be supplied together.
8. Create dynamic unscoped and previously undeclared named-schema collections.
   Verify the current component contains them, a missing named schema is created
   before its table, the source declaration stays unchanged, and the static
   database type does not grow.
9. Pass a plain Dumbo database component to Pongo. Verify its relational
   migrations remain active, no collection property is inferred, and
   `db.collection<User>(...)` remains strongly typed.
10. Set `defaultSchemaName: 'crm'` while one root collection explicitly targets
    `crm`; verify distinct tables coexist and duplicate physical table names are
    rejected before migration execution.
11. Verify direct Dumbo tables use the existing relationship validator for
    local and `table.column` references without exposing an internal default
    schema label.
12. Migrate twice. The second run applies nothing; the ledger contains one row
    per non-empty generated migration, no row for an unresolved logical default
    schema, and no row for SQLite's empty named-schema creation.
13. Use identifiers containing `:` and `%` in schema, table, and `kind` values
    and verify generated migration names do not collide. Verify a 255-character
    migration name is accepted and a longer name is rejected before ledger
    access.
14. Declare a Dumbo relational table `users` and a Pongo collection `users` in
    the same schema. Verify their migration names differ —
    `table:crm:users:create` versus `table:pongo_collection:crm:users:create` —
    and that the duplicate physical table is rejected by the Step 5/6
    physical-identity check rather than by a migration-name collision in
    `dedupeMigrations`.

## Review Gate After Each Step

1. Was a new abstraction introduced? Name the existing duplication or state it
   replaced. If it replaced nothing, stop.
2. Was a component rebuilt, mutated, patched after construction, or widened with
   a cast/assertion? If yes, stop.
3. Did a deleted concept leave a guard, compatibility shim, fallback reader, or
   test asserting the old shape? If yes, stop.
4. Did an export get deleted only because repository production code did not
   read it? If yes, stop and review its semantic/public role and state on `main`.
5. Record net non-test production lines before and after the step. Explain any
   growth.
6. Does implementation behavior contradict a decision above? Quote both and
   stop before proceeding.
