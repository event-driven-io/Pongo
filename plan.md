# Dumbo Database Schema Builder Implementation Plan (Simplified)

## Overview

Create a simple builder API for defining database schemas in dumbo, following the PongoSchema pattern but using const functions and reusing existing schema components.

## Key Principles

- **No overengineering** - Keep it simple
- **Use const instead of function** - Follow the existing pattern
- **Object parameters** - No function overloading, use objects with optional fields
- **No useless comments**.

## Implementation Steps

### Step 1: Create Constants File

**File**: `/src/packages/dumbo/src/core/schema/dumboSchema/constants.ts`

```typescript
// Special key for default schema
export const DEFAULT_SCHEMA = Symbol.for("dumbo.defaultSchema");

// Database-specific defaults (for reference/future use)
export const DATABASE_DEFAULTS = {
  PostgreSQL: { defaultDatabase: "postgres", defaultSchema: "public" },
  MySQL: { defaultDatabase: null, defaultSchema: null },
  SQLite: { defaultDatabase: null, defaultSchema: "main" },
  SqlServer: { defaultDatabase: "master", defaultSchema: "dbo" },
} as const;
```

**Validation**:

- [ ] Compiles
- [ ] No linter errors

### Step 2: Create Builder Functions

**File**: `/src/packages/dumbo/src/core/schema/dumboSchema/index.ts`

```typescript
import {
  columnSchemaComponent,
  type ColumnSchemaComponent,
  indexSchemaComponent,
  type IndexSchemaComponent,
  tableSchemaComponent,
  type TableSchemaComponent,
  databaseSchemaSchemaComponent,
  type DatabaseSchemaSchemaComponent,
  databaseSchemaComponent,
  type DatabaseSchemaComponent,
} from "../components";
import type { SchemaComponentOptions } from "../schemaComponent";
import { DEFAULT_SCHEMA, DATABASE_DEFAULTS } from "./constants";

// Column builder - simple const
const dumboColumn = (
  name: string,
  options?: SchemaComponentOptions
): ColumnSchemaComponent =>
  columnSchemaComponent({
    columnName: name,
    ...options,
  });

// Index builder - simple const
const dumboIndex = (
  name: string,
  columnNames: string[],
  options?: { unique?: boolean } & SchemaComponentOptions
): IndexSchemaComponent =>
  indexSchemaComponent({
    indexName: name,
    columnNames,
    isUnique: options?.unique ?? false,
    ...options,
  });

// Table builder - takes columns and indexes as objects
const dumboTable = (
  name: string,
  definition: {
    columns?: Record<string, ColumnSchemaComponent>;
    indexes?: Record<string, IndexSchemaComponent>;
  } & SchemaComponentOptions
): TableSchemaComponent => {
  const { columns, indexes, ...options } = definition;

  const components = [
    ...(columns ? Object.values(columns) : []),
    ...(indexes ? Object.values(indexes) : []),
  ];

  return tableSchemaComponent({
    tableName: name,
    components,
    ...options,
  });
};

// Schema builder - name is optional for default schema
const dumboDatabaseSchema = (
  nameOrTables: string | Record<string, TableSchemaComponent>,
  tables?: Record<string, TableSchemaComponent>,
  options?: SchemaComponentOptions
): DatabaseSchemaSchemaComponent => {
  if (typeof nameOrTables === "string") {
    // Named schema: dumboDatabaseSchema('public', {...})
    const tableComponents = Object.values(tables || {});
    return databaseSchemaSchemaComponent({
      schemaName: nameOrTables,
      components: tableComponents,
      ...options,
    });
  } else {
    // Default schema: dumboDatabaseSchema({...})
    const tableComponents = Object.values(nameOrTables || {});
    return databaseSchemaSchemaComponent({
      schemaName: "", // Will be replaced with default
      components: tableComponents,
    });
  }
};

// Helper for creating from array of names
dumboDatabaseSchema.from = (
  schemaName: string | undefined,
  tableNames: string[]
): DatabaseSchemaSchemaComponent => {
  const tables = tableNames.reduce((acc, tableName) => {
    acc[tableName] = dumboTable(tableName, {});
    return acc;
  }, {} as Record<string, TableSchemaComponent>);

  return schemaName
    ? dumboDatabaseSchema(schemaName, tables)
    : dumboDatabaseSchema(tables);
};

// Database builder - name is optional for default database
const dumboDatabase = (
  nameOrSchemas:
    | string
    | Record<string | symbol, DatabaseSchemaSchemaComponent>,
  schemas?: Record<string | symbol, DatabaseSchemaSchemaComponent>,
  options?: { defaultSchemaName?: string } & SchemaComponentOptions
): DatabaseSchemaComponent => {
  let databaseName: string;
  let schemaMap: Record<string | symbol, DatabaseSchemaSchemaComponent>;
  let dbOptions: typeof options;

  if (typeof nameOrSchemas === "string") {
    // Named database: dumboDatabase('myapp', {...})
    databaseName = nameOrSchemas;
    schemaMap = schemas || {};
    dbOptions = options;
  } else {
    // Default database: dumboDatabase({...})
    databaseName = "database"; // Default name
    schemaMap = nameOrSchemas;
    dbOptions = schemas as typeof options;
  }

  // Process schemas, handling DEFAULT_SCHEMA
  const schemaComponents: DatabaseSchemaSchemaComponent[] = [];

  for (const [key, schemaComponent] of Object.entries(schemaMap)) {
    if (key === DEFAULT_SCHEMA.toString() || key === String(DEFAULT_SCHEMA)) {
      // This is the default schema - replace its name
      const defaultSchemaName = dbOptions?.defaultSchemaName || "public";
      schemaComponents.push(
        databaseSchemaSchemaComponent({
          schemaName: defaultSchemaName,
          components: Array.from(schemaComponent.components.values()),
          migrations: schemaComponent.migrations,
        })
      );
    } else {
      schemaComponents.push(schemaComponent);
    }
  }

  return databaseSchemaComponent({
    databaseName,
    components: schemaComponents,
    ...dbOptions,
  });
};

// Helper for creating from array of names
dumboDatabase.from = (
  databaseName: string | undefined,
  schemaNames: string[]
): DatabaseSchemaComponent => {
  const schemas = schemaNames.reduce((acc, schemaName) => {
    acc[schemaName] = dumboDatabaseSchema(schemaName, {});
    return acc;
  }, {} as Record<string, DatabaseSchemaSchemaComponent>);

  return databaseName
    ? dumboDatabase(databaseName, schemas)
    : dumboDatabase(schemas);
};

// Main export - similar to pongoSchema
export const dumboSchema = {
  database: dumboDatabase,
  schema: dumboDatabaseSchema,
  table: dumboTable,
  column: dumboColumn,
  index: dumboIndex,
  DEFAULT_SCHEMA,
  DATABASE_DEFAULTS,
};
```

**Reference files**:

- `/src/packages/pongo/src/core/schema/index.ts` (pattern to follow)
- `/src/packages/dumbo/src/core/schema/components/` (components to reuse)

**Validation**:

- [ ] Compiles
- [ ] No linter errors
- [ ] Exports work correctly

### Step 3: Update Main Schema Export

**File**: `/src/packages/dumbo/src/core/schema/index.ts`

Add to existing exports:

```typescript
export * from "./dumboSchema";
```

**Validation**:

- [ ] Export is accessible
- [ ] No circular dependencies

### Step 4: Create Unit Tests

**File**: `/src/packages/dumbo/src/core/schema/dumboSchema/dumboSchema.unit.spec.ts`

```typescript
import { describe, it } from "node:test";
import assert from "node:assert";
import { dumboSchema } from "./index";

describe("dumboSchema", () => {
  it("should create a column", () => {
    const col = dumboSchema.column("id");
    assert.strictEqual(col.columnName, "id");
  });

  it("should create an index", () => {
    const idx = dumboSchema.index("idx_email", ["email"]);
    assert.strictEqual(idx.indexName, "idx_email");
    assert.strictEqual(idx.isUnique, false);
  });

  it("should create a unique index", () => {
    const idx = dumboSchema.index("idx_email", ["email"], { unique: true });
    assert.strictEqual(idx.indexName, "idx_email");
    assert.strictEqual(idx.isUnique, true);
  });

  it("should create a table with columns and indexes", () => {
    const tbl = dumboSchema.table("users", {
      columns: {
        id: dumboSchema.column("id"),
        email: dumboSchema.column("email"),
      },
      indexes: {
        idx_email: dumboSchema.index("idx_email", ["email"]),
      },
    });

    assert.strictEqual(tbl.tableName, "users");
    assert.strictEqual(tbl.columns.size, 2);
    assert.strictEqual(tbl.indexes.size, 1);
    assert.ok(tbl.columns.has("id"));
    assert.ok(tbl.columns.has("email"));
    assert.ok(tbl.indexes.has("idx_email"));
  });

  it("should create a named schema", () => {
    const sch = dumboSchema.schema("public", {
      users: dumboSchema.table("users", {
        columns: {
          id: dumboSchema.column("id"),
        },
      }),
    });

    assert.strictEqual(sch.schemaName, "public");
    assert.strictEqual(sch.tables.size, 1);
    assert.ok(sch.tables.has("users"));
  });

  it("should create a default schema without name", () => {
    const sch = dumboSchema.schema({
      users: dumboSchema.table("users", {
        columns: {
          id: dumboSchema.column("id"),
        },
      }),
    });

    assert.strictEqual(sch.schemaName, "");
    assert.strictEqual(sch.tables.size, 1);
  });

  it("should create a named database", () => {
    const db = dumboSchema.database("myapp", {
      public: dumboSchema.schema("public", {
        users: dumboSchema.table("users", {
          columns: {
            id: dumboSchema.column("id"),
          },
        }),
      }),
    });

    assert.strictEqual(db.databaseName, "myapp");
    assert.strictEqual(db.schemas.size, 1);
    assert.ok(db.schemas.has("public"));
  });

  it("should handle DEFAULT_SCHEMA", () => {
    const db = dumboSchema.database(
      "myapp",
      {
        [dumboSchema.DEFAULT_SCHEMA]: dumboSchema.schema({
          users: dumboSchema.table("users", {
            columns: {
              id: dumboSchema.column("id"),
            },
          }),
        }),
      },
      {
        defaultSchemaName: "main",
      }
    );

    assert.strictEqual(db.databaseName, "myapp");
    assert.strictEqual(db.schemas.size, 1);
    assert.ok(db.schemas.has("main"));
  });

  it("should create schema from table names", () => {
    const sch = dumboSchema.schema.from("public", ["users", "posts"]);
    assert.strictEqual(sch.schemaName, "public");
    assert.strictEqual(sch.tables.size, 2);
  });

  it("should create database from schema names", () => {
    const db = dumboSchema.database.from("myapp", ["public", "analytics"]);
    assert.strictEqual(db.databaseName, "myapp");
    assert.strictEqual(db.schemas.size, 2);
  });
});
```

**Validation**:

- [ ] All tests pass
- [ ] Tests cover main functionality

### Step 5: Usage Example

**File**: `/src/packages/dumbo/src/core/schema/dumboSchema/README.md`

```typescript
import { dumboSchema } from "@event-driven-io/dumbo";

// Simple database with tables in default schema
const simpleDb = dumboSchema.database(
  "myapp",
  {
    [dumboSchema.DEFAULT_SCHEMA]: dumboSchema.schema({
      users: dumboSchema.table("users", {
        columns: {
          id: dumboSchema.column("id"),
          email: dumboSchema.column("email"),
          name: dumboSchema.column("name"),
        },
        indexes: {
          idx_email: dumboSchema.index("idx_email", ["email"], {
            unique: true,
          }),
        },
      }),
    }),
  },
  {
    defaultSchemaName: "public", // PostgreSQL default
  }
);

// Database with multiple schemas
const multiSchemaDb = dumboSchema.database("myapp", {
  public: dumboSchema.schema("public", {
    users: dumboSchema.table("users", {
      columns: {
        id: dumboSchema.column("id"),
        email: dumboSchema.column("email"),
      },
    }),
  }),
  analytics: dumboSchema.schema("analytics", {
    events: dumboSchema.table("events", {
      columns: {
        id: dumboSchema.column("id"),
        user_id: dumboSchema.column("user_id"),
        timestamp: dumboSchema.column("timestamp"),
      },
    }),
  }),
});

// Access using name-based maps
const publicSchema = multiSchemaDb.schemas.get("public");
const usersTable = publicSchema?.tables.get("users");
const emailColumn = usersTable?.columns.get("email");
```

## Execution Plan

### Setup Subagents

1. **Build Agent**: `npm run build:ts:watch` from `/home/oskar/Repos/Pongo/src`
2. **Linter Agent**: `npm run fix` on demand from `/home/oskar/Repos/Pongo/src`
3. **Test Agent**: `npm run test:unit` from `/home/oskar/Repos/Pongo/src`

### Implementation Process

1. Start all subagents
2. Create constants.ts → Check compilation → Run linter → **Ask for confirmation** ✅
3. Create index.ts → Check compilation → Run linter → **Ask for confirmation** ✅
4. Update exports → Check compilation → Run linter → **Ask for confirmation** ✅
5. Create tests → Ensure tests pass → **Ask for confirmation** ✅
6. Don't commit after step. User will do it when confirming.

## Success Criteria

1. ✅ Code compiles
2. ✅ Linter passes
3. ✅ Unit tests pass
4. ✅ Fix issues, don't just report them

## Questions to Ask If Unsure

- Should column/index builders accept additional metadata beyond what's in the current components? Not for now.
- Should we validate that DEFAULT_SCHEMA isn't used as an actual schema name? Yes.
- Should the default database name be configurable or just use 'database'? Same as schema
