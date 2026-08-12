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
runtime component reconstruction, monkey patching, or casts used to hide
incorrect inference. Nothing is committed; Oskar handles git.

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
| 9   | An extension is flat and is table-scoped, schema-scoped, or migration-only. It does not contain nested extensions or mix placement-free `tables` with self-placing `schemas`. Table extensions attach to a tables-mode database or a named schema; schema extensions attach to a schemas-mode database. |
| 10  | Extension schemas are not flattened into `database.schemas`. They remain under the extension that owns them.                                                                                                                                                                                            |
| 11  | `DatabaseComponent` always exposes `tables` for its logical default namespace and `schemas` for explicitly named schemas. An inactive public declaration map is exactly empty. There is no `defaultSchema` field or empty-string schema key.                                                            |
| 12  | Dumbo's public database declaration contains exactly one of `tables` or `schemas`. Tables mode uses the dialect's native/default namespace; schemas mode requires every direct schema to be explicitly named.                                                                                           |
| 13  | `dumboSchema.defaultSchema` and `pongoSchema.defaultSchema` are removed as an intentional public breaking change, not because repository production code has no reader. Their supported replacements are database `tables` mode and Pongo `collections` mode.                                           |
| 14  | The lower-level `databaseComponent` can hold both direct `tables` and named `schemas`. This is required for Pongo collections mode, where root collections may have different physical placements; it is not the Dumbo declaration grammar.                                                             |
| 15  | A Pongo database declaration still contains exactly one of `collections` or `schemas`. This invariant is not changed.                                                                                                                                                                                   |
| 16  | In Pongo `collections` mode, root collections remain available as `database.users`, regardless of their physical placement. In `schemas` mode, declared collections remain available as `database.crm.users`.                                                                                           |
| 17  | `defaultSchemaName` stays. It binds Pongo's logical default slot to a concrete physical schema at database construction time, before migration names and SQL tokens are produced. It does not rewrite components or affect explicitly named schemas.                                                    |
| 18  | Dynamic Pongo collections are held in an internal overlay. Declared components remain immutable and are never rebuilt.                                                                                                                                                                                  |
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

The private logical-default schema child, named schema components, and table
components contribute Dumbo placement:

```ts
// Named schema: always override the parent placement.
{ ...parent, databaseSchemaName: schemaName }

// Private logical-default schema child: turn the database-wide default binding
// into actual placement only when this child is entered.
{
  ...parent,
  databaseSchemaName:
    parent.defaultDatabaseSchemaName ?? SQLDefaultSchemaNameToken.from(),
}

// Table: always contribute its own table name.
{ ...parent, tableName }
```

Column, index, extension, and database components use identity context.
`defaultDatabaseSchemaName` is a database policy, while `databaseSchemaName` is
the current component's actual placement. Keeping them separate prevents a
Pongo default from leaking into database-level migrations or schema-scoped
extensions.

```ts
type SchemaComponentContext = Readonly<{
  defaultDatabaseSchemaName?: string;
  databaseSchemaName?: string | SQLDefaultSchemaNameToken;
  tableName?: string;
}>;
```

### Database declarations

Dumbo makes the caller choose one direct placement model.

Tables mode means that every direct table belongs to the dialect's native
default namespace:

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

Schemas mode means that every direct table is placed through an explicitly
named schema:

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

`tables` and `schemas` are a type-level and runtime XOR. An extensions-only or
migrations-only database still chooses a mode explicitly with `tables: {}` or
`schemas: {}`. Schema record keys remain canonical and must equal the explicit
`schemaName`.

On PostgreSQL, tables mode uses unqualified identifiers and therefore the
connection's active namespace. Schemas mode with `public` explicitly targets
`public`. On SQLite, tables mode uses ordinary table names, while schemas mode
uses the existing logical-to-physical mapping such as `crm.users`.

This makes the ambiguous combination impossible: callers cannot put a logical
default schema beside an explicit `public` schema and hope they are distinct.
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

An old declaration mixing `defaultSchema(...)` with named schemas has no
dialect-neutral one-to-one replacement because its physical placement was
ambiguous. A PostgreSQL application that means `public` must choose schemas mode
and declare `public` explicitly; a database intended to use the connection's
native namespace chooses tables mode and cannot add direct named schemas.

The lower-level component has a broader storage shape:

```ts
DatabaseComponent<DirectTables, NamedSchemas, Name, Extensions> = {
  databaseName,
  tables,
  schemas,
  extensions,
  migrations,
};
```

`databaseComponent` may receive both maps because Pongo collections mode needs
that representation. For direct tables it constructs one private
`databaseSchemaComponent` carrying `SQLDefaultSchemaNameToken`, places direct
tables and table-scoped extensions under that child, and exposes the child's
table record through `database.tables`. The private child is not exposed as
`defaultSchema`, and tables, extensions, or their owning database component are
not cloned or rebuilt.

This is one component model with a stricter Dumbo declaration boundary, not a
parallel Pongo component or a second migration traversal.

Both maps are always present on the returned component. Dumbo's public XOR
controls declaration intent, not the runtime object shape: tables mode returns
an exactly empty `schemas` map and schemas mode returns an exactly empty
`tables` map. The lower-level Pongo representation may populate both.

Pongo preserves its mutually exclusive declaration modes:

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

A schema-scoped extension owns explicitly named schemas and attaches only to a
schemas-mode database:

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
const defaultDatabaseSchemaName = options.defaultSchemaName;
```

Pongo passes a configured value as `defaultDatabaseSchemaName` in the parent
migration context. The private logical-default child converts it into actual
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

This collision case cannot be expressed through Dumbo's public declaration:
tables mode has no named schemas, and schemas mode has no logical-default
tables. A PostgreSQL caller wanting `public` and `crm` uses schemas mode and
declares both explicitly.

### Dynamic collections

Dynamic collections exist only in `PongoDatabase` runtime state and are created
through `db.collection<Document>(name, options)`. They never enter or rebuild
the declared database component, never change `db.schema.component`, and never
change the static database type. This refactor does not add a Dumbo runtime
`.table(name)` API.

The runtime overlay groups collection components by their final physical schema
and table identifier. Its combined migration list contains, in order:

1. migrations from the immutable declaration;
2. schema creation required by previously undeclared runtime named scopes;
3. migrations from dynamic collection components in those scopes.

For item 2, reuse the existing `databaseSchemaComponent` with an empty table map
as a migration source. Keep that component private to the runtime scope; do not
attach it to the declaration or build a runtime database aggregate. This keeps
schema migration naming and SQL generation in Dumbo without duplicating them in
Pongo.

### Relationship validation for direct tables

The relationship validator itself does not change. Today database-level
validation accepts a map of schemas, so the new `{ tables }` declaration would
otherwise bypass cross-table reference checks. A private type-only adapter
presents those tables to the existing validator as one logical scope:

```ts
type ValidateDatabaseTables<Tables> = ValidateDatabaseSchemas<{
  default: DatabaseSchemaComponent<Tables, "default">;
}>;
```

This creates no runtime schema and does not affect SQL placement. Its only job is
to preserve the existing validation of local-column and `table.column`
relationships for the new tables-mode input. The internal key must not appear in
public error types. If that cannot be achieved with this adapter and focused
formatting, do not build a second relationship validator; stop and retain the
existing schema-mode validation unchanged.

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
  `schemas?: never` union already proves the exact XOR pattern required by
  Dumbo.
- `schemaComponent.migrations(context?)` already passes context downward.
  `databaseSchemaComponent` already owns schema placement, schema DDL, table
  traversal, and schema-level extensions. A private token-scoped instance can
  therefore own tables-mode traversal without duplicating that logic.
- `databaseComponent` already determines the child list once. It can choose
  between the private default scope and direct named-schema children during
  construction; nothing needs to be attached or rewritten later.
- Pongo's static grouping is currently concentrated in
  `directCollectionsSchemas` in `pongo/core/schema/index.ts`. Replace that one
  grouping step with direct tables plus named schemas while retaining the
  original collections record for root projection.
- Pongo's runtime lookup and migration access are already concentrated in
  `pongoDatabaseSchemas` in `pongo/core/database/pongoDb.ts`. The dynamic overlay
  and final physical-identifier lookup stay there; no `runtimeDatabaseComponent`
  is needed.
- PostgreSQL's existing `SQLCreateSchema` processor creates a concrete schema.
  SQLite's registered processor renders the same token empty, and the migrator
  already removes and does not record empty SQL. A bound `defaultSchemaName`
  therefore uses existing dialect behavior.
- Direct tables can reuse the existing relationship validator through one
  private, type-only default-schema scope. This changes neither runtime
  placement nor relationship semantics and avoids a parallel unqualified
  validation stack. Step 0 proves the adapter before the database factory uses
  it.

The implementation must stop if preserving exact table/collection inference
requires an assertion or if the private default scope would cause a table or
extension migration to be traversed twice.

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
- Add `defaultDatabaseSchemaName?: string` to `SchemaComponentContext` as a
  database policy distinct from actual `databaseSchemaName` placement. The
  private logical-default schema child converts that policy into actual
  placement and otherwise contributes `SQLDefaultSchemaNameToken`.
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
  neutral extension. Database-mode routing is completed atomically with the
  `tables` xor `schemas` factory change in Step 6, so this step does not add a
  temporary default-placement branch.
- The final attachment rules are:
  - a table-scoped extension attaches to a tables-mode database or to one named
    schema;
  - a schema-scoped extension attaches to a schemas-mode database;
  - a neutral extension attaches in either place;
  - an incompatible attachment throws at construction rather than inheriting
    an accidental default placement.
- Remove Pongo's type-level extension-schema subtraction and runtime
  `extensionSchemaKeys` set.
- Centralize collection lookup inside the existing internal
  `pongoDatabaseSchemas` helper. Search direct declarations and directly
  attached flat extensions; there is no recursive extension traversal.
- If multiple matching physical tables are found, throw immediately. Reuse one
  matching Pongo collection; reject an ordinary Dumbo table with the same
  physical name. Do not add a duplicate and wait for migration deduplication.

### Step 6 - Make database placement explicit and stop rebuilding components

- Add a `tables` record to `DatabaseComponent`; keep `schemas` as direct,
  explicitly named schemas. Always expose both frozen maps and use an exactly
  empty map for the inactive side of a public Dumbo declaration. Do not add a
  `defaultSchema` field.
- Delete `databaseSchemaKey` and `defaultDatabaseSchemaKey = ''`.
- Let the lower-level `databaseComponent` accept `tables`, `schemas`,
  `extensions`, and migrations together. This is the single general component
  representation used by Pongo; it is not a second public declaration shape.
- When the `tables` option is present, `databaseComponent` creates one private
  `databaseSchemaComponent` with `SQLDefaultSchemaNameToken`, even when the
  table map is empty. Give it the direct tables and the table-scoped or neutral
  database extensions. Capture it as the first migration child, before named
  schemas. Expose its one normalized table map as `database.tables`, not the
  private schema component; table and extension components are not copied.
- In schemas mode, named schemas and schema-scoped or neutral database
  extensions are the database's direct migration children. Never traverse an
  extension both directly and through the private default scope.
- Enforce the final database extension rules from Step 5 here. Pongo collections
  mode accepts table-scoped database extensions; Pongo schemas mode accepts
  schema-scoped database extensions. A table extension can still attach to an
  individual Pongo schema.
- In Dumbo's public `dumboSchema.database` factory, accept exactly one definition
  object shape:
  - `{ tables: ...; schemas?: never; extensions?; migrations? }`;
  - `{ schemas: ...; tables?: never; extensions?; migrations? }`.
- Keep the optional database name positional. Remove positional schema and
  positional extension overloads rather than normalizing several ambiguous
  call shapes.
- Validate the XOR both statically and at runtime. A declaration with both or
  neither fails; an empty database chooses `tables: {}` or `schemas: {}`.
- Tables mode returns exact `database.tables` access with an empty `schemas`
  map. Schemas mode returns exact `database.schemas.<name>.tables` access with an
  empty `tables` map. Named schema record keys continue to equal their explicit
  `schemaName`; do not introduce aliases or conditional component wrappers.
- Remove `dumboSchema.defaultSchema` and `pongoSchema.defaultSchema` from their
  public factory objects and update all repository call sites. This is an
  accepted public API break with explicit replacements, not a zero-reader
  cleanup:
  - Dumbo default-only declarations use `{ tables }`;
  - Pongo default-only declarations use `{ collections }`.
- Add a private `ValidateDatabaseTables<Tables>` adapter that feeds direct tables
  through the existing `ValidateDatabaseSchemas` machinery using one type-only
  default-schema scope. Tables-mode callers continue to write `table.column` or
  a local `column`; no runtime schema/component is created and no internal
  default label may appear in public error types. Do not create a second
  relationship normalization, validation, or formatting stack. If the adapter
  cannot satisfy those constraints, stop and keep the existing validator
  unchanged rather than duplicating it.
- Preserve Pongo's declaration union exactly:
  - `{ collections: ...; schemas?: never }`;
  - `{ schemas: ...; collections?: never }`.
- In Pongo collections mode:
  - put unscoped collections in `database.tables`;
  - group explicitly scoped collections into named `schemas`;
  - pass `tables` even when the declared collection record is empty, preserving
    the selected logical-default scope for dynamic collections;
  - retain the original `collections` record for root API/type projection.
- In Pongo schemas mode, accept only explicitly named schemas and retain nested
  projection.
- If Pongo's configured `defaultSchemaName` equals an explicit collection's
  `databaseSchemaName`, treat them as one physical namespace. Distinct tables
  coexist. Reuse the same collection component by physical identifier and
  reject different components targeting the same physical table.
- Delete Dumbo's generic `withTable` helper.
- Do not fold its reconstruction into `pongoDatabaseSchemas`. Instead, keep an
  internal dynamic overlay with one map for the logical default scope and a
  map of named scopes. Do not encode the default scope as `''`, another magic
  string, or a freshly allocated SQL token used as a `Map` key. Dynamic entries
  are added only through `db.collection`; do not add a Dumbo runtime `.table`
  API in this refactor.
- Lookup order is declared components, directly attached flat extensions, then
  the dynamic overlay. Compare the resolved physical schema and table identifiers,
  so a configured default equal to a named scope is searched as one namespace.
  An existing non-Pongo table with the requested physical name is an error.
- For each dynamic named scope not represented by a declaration, reuse an empty
  `databaseSchemaComponent` privately as the source of its schema-create
  migration. It is runtime overlay state, is not attached to the declaration,
  and is ordered before the scope's collection migrations.
- `migrations()` combines declared database migrations, required runtime schema
  migrations, and dynamic collection migrations through the existing
  `dedupeMigrations` behavior.
- Do not manufacture a `runtimeDatabaseComponent` or any aggregate component.
  `db.schema.component` continues to refer to the immutable declared component;
  dynamic collections are runtime state and appear through collection APIs and
  the combined migration list, not by pretending the declaration changed.
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
- Keep the configured string as `defaultDatabaseSchemaName` and derive one
  runtime placement value: that string or `SQLDefaultSchemaNameToken` when it is
  absent.
- Pass only a configured string as `defaultDatabaseSchemaName` in the parent
  migration context. The private logical-default child converts it into actual
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
- Resolve collection lookup by final physical schema and table name across
  `database.tables`, named schemas, directly attached flat extensions, and the
  dynamic overlay. This handles `defaultSchemaName: 'crm'` alongside a
  collection explicitly placed in `crm` without merging or rebuilding the
  declarations.
- Fix `PongoDatabaseCache`: if a database instance already exists for a database
  name, a later request with a different `defaultSchemaName` must throw a clear
  configuration error instead of silently returning the first instance.
- Add tests for client-level default, per-database override, unconfigured native
  default, creation of a custom PostgreSQL default schema, SQLite's empty schema
  DDL, named-schema immunity, equal default/explicit physical placement,
  duplicate physical-table rejection, dynamic collection placement, migration
  names, and conflicting cached bindings.

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
  or cast to distinguish definitions. Prove both return shapes with Vitest type
  tests; if structural inference cannot distinguish them cleanly, stop rather
  than adding a phantom brand.
- Evaluate `pongoDocumentType` by replacing `DocumentOf` inference with existing
  typed collection/column information. Delete the marker only if Vitest type
  tests retain exact `User` inference without a cast. If inference fails, stop
  and report the missing type relation rather than laundering it.
- Keep `PongoSchemaScope` as the public `db.schema(name)` accessor. Remove only
  its redundant runtime check for an option that its signature already omits.
- Do not collapse `PongoDatabaseShape` and `PongoDbWithSchema` merely because
  their conditional chains look similar; one describes a component and the
  other a runtime projection. Share logic only if one existing type can express
  both without a cast or a new vague helper.
- Do not split the Pongo schema file solely to reduce line count. First remove
  obsolete logic; split only along an existing responsibility if the remaining
  file is still difficult to navigate.
- Review export candidates in an explicit table containing:
  `symbol`, `used on main`, `current role`, `consumer value`, `replacement`, and
  `decision`.
- Apply these already verified dispositions:
  - remove `dumboSchema.defaultSchema` and `pongoSchema.defaultSchema` only as
    the agreed `{ tables }` / `{ collections }` API replacement from Step 6;
    list the external migration in release notes;
  - move `MigrationStyle` from Dumbo to Pongo; it has active Pongo readers;
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
  - Dumbo's `tables` xor `schemas` declaration and its two access paths;
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
  - immutable declarations plus a runtime-only dynamic collection overlay;
  - flat, non-nested extensions.
- Rewrite `plan.md` and `todo.md` to describe the implementation actually
  completed. Update samples and public API documentation.
- Write `metrics/final.md` with exact commands and production-line/export deltas
  against both the recorded merge base and pre-refactor HEAD. Production code
  must be materially smaller than pre-refactor HEAD. Treat the comparison with
  `main` as context rather than a quota that justifies deleting useful behavior.

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
   Verify the named schema is created before its table, both use runtime overlay
   state, and neither changes the declared component or static database type.
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
