# Schema Component Migration Unification Plan

## Overview

This plan details the unification of SQL migrations and TypeScript schema definitions in the Dumbo schema component system. The goal is to support both SQL-first and TypeScript-first workflows while maintaining a clear source of truth and enabling strongly-typed query builders for Pongo.

## Context and Current State

### Key Files

- **Core Schema Component**: [src/packages/dumbo/src/core/schema/schemaComponent.ts](src/packages/dumbo/src/core/schema/schemaComponent.ts) - Lines 3-146
- **Component Implementations**:
  - [src/packages/dumbo/src/core/schema/components/databaseSchemaComponent.ts](src/packages/dumbo/src/core/schema/components/databaseSchemaComponent.ts)
  - [src/packages/dumbo/src/core/schema/components/databaseSchemaSchemaComponent.ts](src/packages/dumbo/src/core/schema/components/databaseSchemaSchemaComponent.ts)
  - [src/packages/dumbo/src/core/schema/components/tableSchemaComponent.ts](src/packages/dumbo/src/core/schema/components/tableSchemaComponent.ts)
  - [src/packages/dumbo/src/core/schema/components/columnSchemaComponent.ts](src/packages/dumbo/src/core/schema/components/columnSchemaComponent.ts)
  - [src/packages/dumbo/src/core/schema/components/indexSchemaComponent.ts](src/packages/dumbo/src/core/schema/components/indexSchemaComponent.ts)
- **Migration System**:
  - [src/packages/dumbo/src/core/schema/sqlMigration.ts](src/packages/dumbo/src/core/schema/sqlMigration.ts)
  - [src/packages/dumbo/src/core/schema/migrators/schemaComponentMigrator.ts](src/packages/dumbo/src/core/schema/migrators/schemaComponentMigrator.ts)
  - [src/packages/dumbo/src/core/schema/migrators/migrator.ts](src/packages/dumbo/src/core/schema/migrators/migrator.ts)
- **Builder API**: [src/packages/dumbo/src/core/schema/dumboSchema/dumboSchema.ts](src/packages/dumbo/src/core/schema/dumboSchema/dumboSchema.ts)
- **Tests**: [src/packages/dumbo/src/core/schema/dumboSchema/dumboSchema.unit.spec.ts](src/packages/dumbo/src/core/schema/dumboSchema/dumboSchema.unit.spec.ts)
- **Pongo Integration Target**: [src/packages/pongo/src/core/schema/index.ts](src/packages/pongo/src/core/schema/index.ts)

### Current Problem

The system cannot distinguish between:

1. **Initial schema definitions** (CREATE TABLE)
2. **Schema evolution** (ALTER TABLE)
3. **Data migrations** (UPDATE/INSERT)

All migrations are stored in a single `migrations` array and bubble up through the component hierarchy (lines 79-83 in schemaComponent.ts), making it impossible to know the intent or current state.

## Agreed Solution

### Core Principle: TypeScript as Source of Truth (When Present)

**The Rule**: When TypeScript definitions exist, they represent the desired schema state. Migrations are either:

1. **Generated** from TypeScript definitions (if no migrations provided)
2. **Validated** against TypeScript definitions (if migrations provided)
3. **Trusted** completely (if no TypeScript definitions provided - SQL-first mode)

### Three Usage Modes

#### 1. TypeScript-First (Generates Migrations)

```typescript
const table = tableSchemaComponent({
  tableName: 'users',
  columns: {
    id: column('id', { type: 'serial', primaryKey: true }),
    email: column('email', { type: 'varchar', length: 255 }),
  },
  // No migrations = will generate CREATE TABLE IF NOT EXISTS
});
```

#### 2. SQL-First (Migrations as Source of Truth)

```typescript
const table = tableSchemaComponent({
  tableName: 'users',
  migrations: [sqlMigration('001_create', [SQL`CREATE TABLE users ...`])],
  // No columns = trust the SQL completely
});
```

#### 3. Hybrid with Validation

```typescript
const table = tableSchemaComponent({
  tableName: 'users',
  columns: {
    id: column('id', { type: 'serial' }),
    email: column('email', { type: 'varchar' }),
  },
  migrations: [sqlMigration('001_create', [SQL`CREATE TABLE users ...`])],
  // Both provided = TypeScript is truth, validate migrations match
});
```

## Implementation Plan

### Phase 1: Enhanced Column Definition Types

**File to modify**: [src/packages/dumbo/src/core/schema/components/columnSchemaComponent.ts](src/packages/dumbo/src/core/schema/components/columnSchemaComponent.ts)

```typescript
export type ColumnDefinition = {
  type:
    | 'serial'
    | 'varchar'
    | 'int'
    | 'bigint'
    | 'text'
    | 'timestamp'
    | 'boolean'
    | 'uuid'
    | 'json'
    | 'jsonb';
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  length?: number;
  precision?: number;
  scale?: number;
  defaultValue?: unknown;
  references?: {
    table: string;
    column: string;
    onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT';
    onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT';
  };
};

export type ColumnSchemaComponent = SchemaComponent<
  ColumnURN,
  Readonly<{
    columnName: string;
    definition?: ColumnDefinition; // NEW: Optional definition for TypeScript-first
    generateMigration?: () => SQL; // NEW: Self-contained migration generation
  }>
>;

// Column knows how to generate its own SQL
export const generateColumnSQL = (column: ColumnSchemaComponent): string => {
  if (!column.definition) return `${column.columnName} TEXT`; // fallback

  const { type, nullable, primaryKey, unique, length, defaultValue } =
    column.definition;
  let sql = `${column.columnName} ${type.toUpperCase()}`;

  if (length) sql += `(${length})`;
  if (primaryKey) sql += ' PRIMARY KEY';
  if (unique) sql += ' UNIQUE';
  if (!nullable) sql += ' NOT NULL';
  if (defaultValue !== undefined) sql += ` DEFAULT ${defaultValue}`;

  return sql;
};
```

### Phase 2: Nested Schema Snapshot System

**Complete directory structure**:

```
.dumbo/
  snapshots/                              # Current state + migration tracking
    myapp.snapshot.ts                     # Root database snapshot
    schemas/
      public.snapshot.ts                  # Schema-level snapshot
      analytics.snapshot.ts
      public/
        users.snapshot.ts                 # Table-level snapshots
        posts.snapshot.ts
        comments.snapshot.ts
      analytics/
        events.snapshot.ts
        metrics.snapshot.ts
  migrations/                             # All SQL migrations (generated or provided)
    2024-01-15-001-create_schema_public.sql
    2024-01-15-002-create_table_users.sql
    2024-01-15-003-create_index_idx_users_email.sql
    2024-01-16-001-add_email_to_users.sql
```

Note: Applied migrations are tracked in the database `migrations` table (see `migrator.ts` lines 167-189), not in files.

**Migration SQL file examples**:

```sql
-- .dumbo/migrations/2024-01-15-002-create_table_users.sql
-- Source: generated (from TypeScript definitions)
-- Component: sc:dumbo:table:users
-- Generated at: 2024-01-15T10:30:00Z
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL
);

-- .dumbo/migrations/2024-01-16-001-custom_users_setup.sql
-- Source: provided (from component migrations array)
-- Component: sc:dumbo:table:users
-- Migration name: 001_custom_setup
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255),
  internal_field JSONB
);
```

**Snapshot file examples with migration tracking**:

```typescript
// SCENARIO 1: TypeScript-first (no migrations provided)
// Component: tableSchemaComponent({
//   tableName: 'users',
//   columns: { id: column('id', { type: 'serial', primaryKey: true }) }
// })

// .dumbo/snapshots/schemas/public/users.snapshot.ts
export const usersSnapshot = {
  tableName: 'users',
  columns: {
    id: { type: 'serial' as const, primaryKey: true },
    email: { type: 'varchar' as const, length: 255, nullable: false },
  },
  indexes: {
    idx_users_email: { columns: ['email'], unique: false },
  },
  migrations: [], // No migrations provided, will be generated
} as const;

// SCENARIO 2: SQL-first (only migrations provided)
// Component: tableSchemaComponent({
//   tableName: 'orders',
//   migrations: [
//     sqlMigration('001_create', [SQL`CREATE TABLE orders ...`]),
//     sqlMigration('002_add_user', [SQL`ALTER TABLE orders ...`])
//   ]
// })

// .dumbo/snapshots/schemas/public/orders.snapshot.ts
export const ordersSnapshot = {
  tableName: 'orders',
  columns: {
    // Introspected from database after applying migrations
    id: { type: 'serial' as const, primaryKey: false },
    total: { type: 'decimal' as const, precision: 10, scale: 2 },
    user_id: { type: 'int' as const, nullable: true },
  },
  indexes: {},
  migrations: [
    {
      name: '001_create',
      sqls: ['CREATE TABLE orders (id SERIAL, total DECIMAL(10,2))'],
    },
    {
      name: '002_add_user',
      sqls: ['ALTER TABLE orders ADD COLUMN user_id INT'],
    },
  ],
} as const;

// SCENARIO 3: Hybrid (TypeScript definitions + SQL migrations)
// Component: tableSchemaComponent({
//   tableName: 'posts',
//   columns: { id: column('id', ...), title: column('title', ...) },
//   migrations: [sqlMigration('001_custom', [SQL`CREATE TABLE posts ...`])]
// })

// .dumbo/snapshots/schemas/public/posts.snapshot.ts
export const postsSnapshot = {
  tableName: 'posts',
  columns: {
    // TypeScript definitions as source of truth
    id: { type: 'serial' as const, primaryKey: true },
    title: { type: 'varchar' as const, length: 255, nullable: false },
  },
  indexes: {},
  migrations: [
    {
      name: '001_custom',
      sqls: [
        'CREATE TABLE posts (id SERIAL PRIMARY KEY, title VARCHAR(255), internal_field JSONB)',
      ],
    },
  ],
} as const;

// .dumbo/snapshots/schemas/public.snapshot.ts
import { usersSnapshot } from './public/users.snapshot';
import { postsSnapshot } from './public/posts.snapshot';
import { commentsSnapshot } from './public/comments.snapshot';

export const publicSnapshot = {
  schemaName: 'public',
  tables: {
    users: usersSnapshot,
    posts: postsSnapshot,
    comments: commentsSnapshot,
  },
} as const;

// .dumbo/snapshots/myapp.snapshot.ts
import { publicSnapshot } from './schemas/public.snapshot';
import { analyticsSnapshot } from './schemas/analytics.snapshot';

export const databaseSnapshot = {
  databaseName: 'myapp',
  version: '2024-01-15-001',
  timestamp: '2024-01-15T10:30:00Z',
  schemas: {
    public: publicSnapshot,
    analytics: analyticsSnapshot,
  },
} as const;
```

**Benefits of nested structure**:

- Minimizes git merge conflicts (each table in separate file)
- Clear ownership and change tracking
- Natural composition mirroring schema hierarchy
- Type-safe imports with TypeScript checking

**New file to create**: `src/packages/dumbo/src/core/schema/snapshot/schemaSnapshot.ts`

```typescript
export type ColumnSnapshot = {
  type: ColumnDefinition['type'];
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  length?: number;
  precision?: number;
  scale?: number;
  defaultValue?: unknown;
  references?: {
    table: string;
    column: string;
    onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT';
    onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT';
  };
};

export type IndexSnapshot = {
  columns: string[];
  unique: boolean;
  where?: string;
};

export type TableSnapshot = {
  tableName: string;
  columns: Record<string, ColumnSnapshot>;
  indexes: Record<string, IndexSnapshot>;
  migrations: SQLMigration[]; // Track migrations defined in component
};

export type SchemaSnapshot = {
  schemaName: string;
  tables: Record<string, TableSnapshot>;
  migrations: SQLMigration[]; // Schema-level migrations
};

export type DatabaseSnapshot = {
  databaseName: string;
  version: string;
  timestamp: string;
  schemas: Record<string, SchemaSnapshot>;
  migrations: SQLMigration[]; // Database-level migrations
};
```

### Phase 3: Component-Specific Migration Generation

**IMPORTANT**: Each component is responsible for generating its own migrations when none are provided.

#### Table Component Migration Generation

**File to modify**: [src/packages/dumbo/src/core/schema/components/tableSchemaComponent.ts](src/packages/dumbo/src/core/schema/components/tableSchemaComponent.ts)

```typescript
// Add to tableSchemaComponent.ts
export const generateTableMigrations = (
  table: TableSchemaComponent,
  snapshot?: TableSnapshot,
): SQLMigration[] => {
  // If migrations already provided, return them (SQL-first mode)
  if (table.migrations.length > 0) {
    return table.migrations;
  }

  // If no columns defined in TypeScript, nothing to generate
  if (table.columns.size === 0) {
    return [];
  }

  const migrations: SQLMigration[] = [];

  if (!snapshot) {
    // No snapshot = first time creation
    const columnDefinitions = Array.from(table.columns.values())
      .map((col) => generateColumnSQL(col))
      .join(',\n  ');

    migrations.push(
      sqlMigration(`create_table_${table.tableName}`, [
        SQL`CREATE TABLE IF NOT EXISTS ${table.tableName} (
  ${columnDefinitions}
)`,
      ]),
    );
  } else {
    // Generate ALTER statements based on diff with snapshot
    const changes = diffTableWithSnapshot(table, snapshot);

    for (const newColumn of changes.addedColumns) {
      migrations.push(
        sqlMigration(`add_${newColumn.columnName}_to_${table.tableName}`, [
          SQL`ALTER TABLE ${table.tableName} ADD COLUMN IF NOT EXISTS ${generateColumnSQL(newColumn)}`,
        ]),
      );
    }
  }

  // Indexes are generated as separate migrations
  for (const [name, index] of table.indexes) {
    if (!snapshot || !snapshot.indexes[name]) {
      migrations.push(generateIndexMigration(table.tableName, index));
    }
  }

  return migrations;
};

// Table component enhanced constructor
export const tableSchemaComponent = (
  options: TableOptions,
): TableSchemaComponent => {
  // ... existing implementation ...

  const component = {
    // ... existing properties ...
    generateMigrations: (snapshot?: TableSnapshot) =>
      generateTableMigrations(component, snapshot),
  };

  return component;
};
```

#### Index Component Migration Generation

**File to modify**: [src/packages/dumbo/src/core/schema/components/indexSchemaComponent.ts](src/packages/dumbo/src/core/schema/components/indexSchemaComponent.ts)

```typescript
export const generateIndexMigration = (
  tableName: string,
  index: IndexSchemaComponent,
): SQLMigration => {
  const uniqueClause = index.unique ? 'UNIQUE ' : '';
  const columns = index.columns.join(', ');

  return sqlMigration(`create_index_${index.indexName}`, [
    SQL`CREATE ${uniqueClause}INDEX IF NOT EXISTS ${index.indexName}
        ON ${tableName}(${columns})`,
  ]);
};
```

#### Database Schema Component Migration Generation

**File to modify**: [src/packages/dumbo/src/core/schema/components/databaseSchemaSchemaComponent.ts](src/packages/dumbo/src/core/schema/components/databaseSchemaSchemaComponent.ts)

```typescript
export const generateSchemaMigrations = (
  schema: DatabaseSchemaSchemaComponent,
  snapshot?: SchemaSnapshot,
): SQLMigration[] => {
  if (schema.migrations.length > 0) {
    return schema.migrations;
  }

  const migrations: SQLMigration[] = [];

  // Create schema if doesn't exist
  migrations.push(
    sqlMigration(`create_schema_${schema.schemaName}`, [
      SQL`CREATE SCHEMA IF NOT EXISTS ${schema.schemaName}`,
    ]),
  );

  // Tables will generate their own migrations
  // But we collect them here for ordering
  for (const table of schema.tables.values()) {
    migrations.push(
      ...table.generateMigrations(snapshot?.tables[table.tableName]),
    );
  }

  return migrations;
};
```

### Phase 4: Tree Traversal Migration Collection

**File to modify**: [src/packages/dumbo/src/core/schema/components/databaseSchemaComponent.ts](src/packages/dumbo/src/core/schema/components/databaseSchemaComponent.ts)

The database component is the root and orchestrates migration generation by traversing the tree in the correct order:

```typescript
export const collectAllMigrations = (
  database: DatabaseSchemaComponent,
  snapshot?: DatabaseSnapshot,
): SQLMigration[] => {
  const migrations: SQLMigration[] = [];

  // Order matters! Follow this sequence:
  // 1. Database-level migrations
  // 2. Schema creation
  // 3. Table creation (without foreign keys)
  // 4. Column additions/modifications
  // 5. Indexes
  // 6. Foreign keys (future)
  // 7. Other constraints (future)

  // If database has explicit migrations, use them
  if (database.migrations.length > 0) {
    return database.migrations; // SQL-first mode
  }

  // 1. Database-level setup
  migrations.push(
    sqlMigration(`setup_database_${database.databaseName}`, [
      SQL`-- Database setup for ${database.databaseName}`,
    ]),
  );

  // 2. Traverse schemas
  for (const schema of database.schemas.values()) {
    const schemaSnapshot = snapshot?.schemas[schema.schemaName];

    // Create schema
    migrations.push(
      sqlMigration(`create_schema_${schema.schemaName}`, [
        SQL`CREATE SCHEMA IF NOT EXISTS ${schema.schemaName}`,
      ]),
    );

    // 3. Collect all tables first (structure only, no foreign keys)
    const tableCreations: SQLMigration[] = [];
    const indexCreations: SQLMigration[] = [];

    for (const table of schema.tables.values()) {
      const tableSnapshot = schemaSnapshot?.tables[table.tableName];

      if (table.migrations.length > 0) {
        // Table has explicit migrations, use them
        tableCreations.push(...table.migrations);
      } else if (table.columns.size > 0) {
        // Generate from TypeScript definitions
        const tableMigrations = table.generateMigrations(tableSnapshot);

        // Separate table creation from index creation
        tableMigrations.forEach((m) => {
          if (m.name.includes('index')) {
            indexCreations.push(m);
          } else {
            tableCreations.push(m);
          }
        });
      }
    }

    // Add in correct order
    migrations.push(...tableCreations); // All tables first
    migrations.push(...indexCreations); // Then all indexes
  }

  // Future: Foreign key constraints would go here
  // Future: Other constraints, triggers, etc.

  return migrations;
};

// Enhanced database component
export const databaseSchemaComponent = (
  options: DatabaseOptions,
): DatabaseSchemaComponent => {
  // ... existing implementation ...

  const component = {
    // ... existing properties ...
    collectAllMigrations: (snapshot?: DatabaseSnapshot) =>
      collectAllMigrations(component, snapshot),
  };

  return component;
};
```

### Phase 5: Schema Differ

**New file to create**: `src/packages/dumbo/src/core/schema/differ/schemaDiffer.ts`

```typescript
export type TableChanges = {
  addedColumns: ColumnSchemaComponent[];
  removedColumns: string[];
  modifiedColumns: Array<{
    name: string;
    from: ColumnSnapshot;
    to: ColumnDefinition;
  }>;
};

export const diffTableWithSnapshot = (
  table: TableSchemaComponent,
  snapshot: TableSnapshot,
): TableChanges => {
  const changes: TableChanges = {
    addedColumns: [],
    removedColumns: [],
    modifiedColumns: [],
  };

  // Find added columns
  for (const [name, column] of table.columns) {
    if (!snapshot.columns[name]) {
      changes.addedColumns.push(column);
    }
  }

  // Find removed columns (might want to warn instead of remove)
  for (const name in snapshot.columns) {
    if (!table.columns.has(name)) {
      changes.removedColumns.push(name);
    }
  }

  // Find modified columns
  for (const [name, column] of table.columns) {
    const snapshotColumn = snapshot.columns[name];
    if (snapshotColumn && !columnsEqual(column.definition, snapshotColumn)) {
      changes.modifiedColumns.push({
        name,
        from: snapshotColumn,
        to: column.definition,
      });
    }
  }

  return changes;
};

const columnsEqual = (
  def: ColumnDefinition | undefined,
  snap: ColumnSnapshot,
): boolean => {
  if (!def) return false;
  return (
    def.type === snap.type &&
    def.nullable === snap.nullable &&
    def.primaryKey === snap.primaryKey &&
    def.unique === snap.unique &&
    def.length === snap.length
  );
};
```

### Phase 6: Type Generation from Schema

**New file to create**: `src/packages/dumbo/src/core/schema/generators/typeGenerator.ts`

```typescript
export const generateTypesFromSnapshot = (
  snapshot: DatabaseSnapshot,
): string => {
  const lines: string[] = [];

  lines.push('// Auto-generated database types from schema snapshot');
  lines.push('// Do not edit manually - use dumbo schema:generate-types');
  lines.push('');

  lines.push('export type DatabaseSchema = {');

  for (const [schemaName, schema] of Object.entries(snapshot.schemas)) {
    lines.push(`  ${schemaName}: {`);

    for (const [tableName, table] of Object.entries(schema.tables)) {
      lines.push(`    ${tableName}: {`);

      for (const [columnName, column] of Object.entries(table.columns)) {
        const tsType = sqlTypeToTypeScript(column);
        lines.push(`      ${columnName}: ${tsType};`);
      }

      lines.push('    };');
    }

    lines.push('  };');
  }

  lines.push('};');

  return lines.join('\n');
};

const sqlTypeToTypeScript = (column: ColumnSnapshot): string => {
  let baseType: string;

  switch (column.type) {
    case 'serial':
    case 'int':
    case 'bigint':
      baseType = 'number';
      break;
    case 'varchar':
    case 'text':
    case 'uuid':
      baseType = 'string';
      break;
    case 'boolean':
      baseType = 'boolean';
      break;
    case 'timestamp':
      baseType = 'Date';
      break;
    case 'json':
    case 'jsonb':
      baseType = 'unknown';
      break;
    default:
      baseType = 'unknown';
  }

  return column.nullable ? `${baseType} | null` : baseType;
};

// Example generated output:
// export type DatabaseSchema = {
//   public: {
//     users: {
//       id: number;
//       email: string;
//       name: string | null;
//     };
//     posts: {
//       id: number;
//       userId: number;
//       title: string;
//       content: string | null;
//     };
//   };
// };
```

### Phase 7: Migration Immutability Validation

**New file to create**: `src/packages/dumbo/src/core/schema/validators/migrationImmutabilityValidator.ts`

```typescript
import { SQLMigration } from '../sqlMigration';

export type ImmutabilityValidationResult = {
  valid: boolean;
  error?: string;
};

export const validateMigrationImmutability = (
  currentMigrations: ReadonlyArray<SQLMigration>,
  snapshotMigrations: ReadonlyArray<SQLMigration>,
): ImmutabilityValidationResult => {
  // Check that no migrations were removed
  for (const snapshotMigration of snapshotMigrations) {
    const currentMigration = currentMigrations.find(
      (m) => m.name === snapshotMigration.name,
    );

    if (!currentMigration) {
      return {
        valid: false,
        error:
          `Migration '${snapshotMigration.name}' was removed from component!\n` +
          `Migrations cannot be deleted once defined.\n` +
          `If you need to undo a migration, add a new migration that reverses it.`,
      };
    }

    // Check that migration content hasn't changed
    const snapshotSqls = snapshotMigration.sqls
      .map((sql) => sql.toString())
      .join('\n');
    const currentSqls = currentMigration.sqls
      .map((sql) => sql.toString())
      .join('\n');

    if (snapshotSqls !== currentSqls) {
      return {
        valid: false,
        error:
          `Migration '${snapshotMigration.name}' has been modified!\n` +
          `Original SQL:\n${snapshotSqls}\n\n` +
          `Current SQL:\n${currentSqls}\n\n` +
          `Migrations must be immutable once defined. Add a new migration instead.`,
      };
    }
  }

  return { valid: true };
};

// Helper to detect new migrations
export const getNewMigrations = (
  currentMigrations: ReadonlyArray<SQLMigration>,
  snapshotMigrations: ReadonlyArray<SQLMigration>,
): SQLMigration[] => {
  const snapshotNames = new Set(snapshotMigrations.map((m) => m.name));
  return currentMigrations.filter((m) => !snapshotNames.has(m.name));
};
```

### Phase 8: Schema Validation System

**New file to create**: `src/packages/dumbo/src/core/schema/validators/migrationValidator.ts`

```typescript
export type ValidationResult = {
  valid: boolean;
  errors: Array<ValidationError>;
  warnings: Array<ValidationWarning>;
};

export type ValidationError = {
  type:
    | 'missing_column'
    | 'type_mismatch'
    | 'constraint_mismatch'
    | 'missing_table';
  message: string;
  location: {
    component: string;
    file?: string;
    line?: number;
  };
  expected: string;
  actual: string;
};

export type ValidationWarning = {
  type: 'extra_column' | 'extra_index' | 'deprecated_type';
  message: string;
};

export const validateMigrationsAgainstSchema = (
  component: SchemaComponent,
  options?: { strict: boolean },
): ValidationResult => {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  // Only validate if component has both TypeScript definitions AND migrations
  if (
    !hasTypeScriptDefinitions(component) ||
    component.migrations.length === 0
  ) {
    return result;
  }

  // Simulate migrations in memory to get resulting schema
  const resultingSchema = simulateMigrations(component.migrations);

  // Compare with TypeScript definitions
  const comparison = compareSchemas(component, resultingSchema, options);

  // Generate detailed error messages
  for (const mismatch of comparison.mismatches) {
    result.errors.push({
      type: mismatch.type,
      message: formatErrorMessage(mismatch),
      location: {
        component: component.schemaComponentKey,
        file: mismatch.file,
        line: mismatch.line,
      },
      expected: mismatch.expected,
      actual: mismatch.actual,
    });
    result.valid = false;
  }

  return result;
};

const formatErrorMessage = (mismatch: SchemaMismatch): string => {
  return `Column '${mismatch.column}' mismatch in table '${mismatch.table}':
  Expected: ${mismatch.expected} (from ${mismatch.tsFile}:${mismatch.tsLine})
  Actual: ${mismatch.actual} (from ${mismatch.sqlFile}:${mismatch.sqlLine})
  Fix: Either update TypeScript definition or add migration to match`;
};
```

### Phase 9: CLI Commands

**New CLI commands to implement**:

```bash
# Compare current TypeScript definitions with snapshot
dumbo schema:diff

# Generate migrations from diff
dumbo schema:generate [name]
# Example: dumbo schema:generate add-email-to-users

# Update snapshot to current state
dumbo schema:snapshot

# Generate TypeScript types from snapshot
dumbo schema:generate-types

# Validate migrations against TypeScript definitions
dumbo schema:validate

# Show current schema state
dumbo schema:status

# Collect and run all migrations from database component
dumbo schema:migrate
```

### Phase 10: Migration Orchestrator

**New file to create**: `src/packages/dumbo/src/core/schema/orchestrator/migrationOrchestrator.ts`

```typescript
export class MigrationOrchestrator {
  constructor(
    private database: DatabaseSchemaComponent,
    private snapshotPath: string = '.dumbo/snapshots',
    private migrationsPath: string = '.dumbo/migrations',
  ) {}

  async processMigrations(): Promise<ProcessedMigrations> {
    // Load latest snapshot if exists
    const snapshot = await this.loadSnapshot();

    // Validate migration immutability
    const validation = await this.validateMigrations(snapshot);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Process user-provided migrations
    const userProvidedMigrations =
      await this.processUserProvidedMigrations(snapshot);

    // Generate migrations for TypeScript-defined components
    const generatedMigrations =
      await this.generateMigrationsFromDefinitions(snapshot);

    return {
      userProvided: userProvidedMigrations,
      generated: generatedMigrations,
      all: [...userProvidedMigrations, ...generatedMigrations],
    };
  }

  private async processUserProvidedMigrations(
    snapshot: DatabaseSnapshot | null,
  ): Promise<SQLMigration[]> {
    const newMigrations: SQLMigration[] = [];

    // Process database-level migrations
    if (this.database.migrations.length > 0) {
      const snapshotMigrations = snapshot?.migrations || [];
      const newDbMigrations = getNewMigrations(
        this.database.migrations,
        snapshotMigrations,
      );

      for (const migration of newDbMigrations) {
        // Write to migrations folder
        await this.writeMigrationToFile(
          migration,
          'database',
          this.database.schemaComponentKey,
        );
        newMigrations.push(migration);
      }
    }

    // Traverse and process schema and table migrations
    for (const schema of this.database.schemas.values()) {
      const schemaSnapshot = snapshot?.schemas[schema.schemaName];

      // Process schema migrations
      if (schema.migrations.length > 0) {
        const snapshotMigrations = schemaSnapshot?.migrations || [];
        const newSchemaMigrations = getNewMigrations(
          schema.migrations,
          snapshotMigrations,
        );

        for (const migration of newSchemaMigrations) {
          await this.writeMigrationToFile(
            migration,
            'schema',
            schema.schemaComponentKey,
          );
          newMigrations.push(migration);
        }
      }

      // Process table migrations
      for (const table of schema.tables.values()) {
        const tableSnapshot = schemaSnapshot?.tables[table.tableName];

        if (table.migrations.length > 0) {
          const snapshotMigrations = tableSnapshot?.migrations || [];
          const newTableMigrations = getNewMigrations(
            table.migrations,
            snapshotMigrations,
          );

          for (const migration of newTableMigrations) {
            await this.writeMigrationToFile(
              migration,
              'table',
              table.schemaComponentKey,
            );
            newMigrations.push(migration);
          }
        }
      }
    }

    return newMigrations;
  }

  private async writeMigrationToFile(
    migration: SQLMigration,
    type: 'database' | 'schema' | 'table',
    componentKey: string,
  ): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}-${migration.name}.sql`;

    const header = [
      `-- Source: provided (from component migrations array)`,
      `-- Component: ${componentKey}`,
      `-- Type: ${type}`,
      `-- Migration name: ${migration.name}`,
      `-- Written at: ${new Date().toISOString()}`,
      '',
      '',
    ].join('\n');

    const content =
      header + migration.sqls.map((sql) => sql.toString()).join(';\n') + ';';

    await writeFile(`${this.migrationsPath}/${filename}`, content);
  }

  private async validateMigrations(
    snapshot: DatabaseSnapshot | null,
  ): Promise<ImmutabilityValidationResult> {
    if (!snapshot) return { valid: true };

    // Validate database migrations
    const dbValidation = validateMigrationImmutability(
      this.database.migrations,
      snapshot.migrations || [],
    );
    if (!dbValidation.valid) return dbValidation;

    // Validate schema and table migrations
    for (const schema of this.database.schemas.values()) {
      const schemaSnapshot = snapshot.schemas[schema.schemaName];
      if (!schemaSnapshot) continue;

      const schemaValidation = validateMigrationImmutability(
        schema.migrations,
        schemaSnapshot.migrations || [],
      );
      if (!schemaValidation.valid) return schemaValidation;

      for (const table of schema.tables.values()) {
        const tableSnapshot = schemaSnapshot.tables[table.tableName];
        if (!tableSnapshot) continue;

        const tableValidation = validateMigrationImmutability(
          table.migrations,
          tableSnapshot.migrations || [],
        );
        if (!tableValidation.valid) return tableValidation;
      }
    }

    return { valid: true };
  }

  async runMigrations(dumbo: Dumbo): Promise<void> {
    const processed = await this.processMigrations();

    // Group migrations by type for correct ordering
    const grouped = this.groupMigrations(processed.all);

    // Run in correct order
    await this.runMigrationGroup(dumbo, grouped.schemas);
    await this.runMigrationGroup(dumbo, grouped.tables);
    await this.runMigrationGroup(dumbo, grouped.columns);
    await this.runMigrationGroup(dumbo, grouped.indexes);
    // Future: grouped.foreignKeys, grouped.constraints

    // Update snapshot after successful migration
    await this.updateSnapshot();
  }

  private async loadSnapshot(): Promise<DatabaseSnapshot | null> {
    try {
      // Load root snapshot which imports all nested snapshots
      const module = await import(
        `${this.snapshotPath}/${this.database.databaseName}.snapshot.ts`
      );
      return module.databaseSnapshot;
    } catch (error) {
      // No snapshot found, will generate everything from scratch
      return null;
    }
  }

  private async updateSnapshot(): Promise<void> {
    // Generate new snapshots for each component
    await this.generateDatabaseSnapshot(this.database);
  }

  private async generateDatabaseSnapshot(
    database: DatabaseSchemaComponent,
  ): Promise<void> {
    // Generate nested snapshot files
    for (const schema of database.schemas.values()) {
      await this.generateSchemaSnapshot(schema);
    }

    // Generate root database snapshot that imports schemas
    const imports = Array.from(database.schemas.values())
      .map(
        (s) =>
          `import { ${s.schemaName}Snapshot } from './schemas/${s.schemaName}.snapshot';`,
      )
      .join('\n');

    const migrationsStr = this.formatMigrationsForSnapshot(database.migrations);

    const content = `${imports}

export const databaseSnapshot = {
  databaseName: '${database.databaseName}',
  version: '${new Date().toISOString().split('T')[0]}-001',
  timestamp: '${new Date().toISOString()}',
  schemas: {
    ${Array.from(database.schemas.values())
      .map((s) => `${s.schemaName}: ${s.schemaName}Snapshot`)
      .join(',\n    ')}
  },
  migrations: ${migrationsStr}
} as const;`;

    await writeFile(
      `${this.snapshotPath}/${database.databaseName}.snapshot.ts`,
      content,
    );
  }

  private async generateSchemaSnapshot(
    schema: DatabaseSchemaSchemaComponent,
  ): Promise<void> {
    // Generate table snapshots first
    for (const table of schema.tables.values()) {
      await this.generateTableSnapshot(schema.schemaName, table);
    }

    // Generate schema snapshot that imports tables
    const imports = Array.from(schema.tables.values())
      .map(
        (t) =>
          `import { ${t.tableName}Snapshot } from './${schema.schemaName}/${t.tableName}.snapshot';`,
      )
      .join('\n');

    const migrationsStr = this.formatMigrationsForSnapshot(schema.migrations);

    const content = `${imports}

export const ${schema.schemaName}Snapshot = {
  schemaName: '${schema.schemaName}',
  tables: {
    ${Array.from(schema.tables.values())
      .map((t) => `${t.tableName}: ${t.tableName}Snapshot`)
      .join(',\n    ')}
  },
  migrations: ${migrationsStr}
} as const;`;

    await writeFile(
      `${this.snapshotPath}/schemas/${schema.schemaName}.snapshot.ts`,
      content,
    );
  }

  private async generateTableSnapshot(
    schemaName: string,
    table: TableSchemaComponent,
  ): Promise<void> {
    const migrationsStr = this.formatMigrationsForSnapshot(table.migrations);

    const content = `export const ${table.tableName}Snapshot = {
  tableName: '${table.tableName}',
  columns: {
    ${Array.from(table.columns.entries())
      .map(([name, col]) => this.generateColumnSnapshot(name, col))
      .join(',\n    ')}
  },
  indexes: {
    ${Array.from(table.indexes.entries())
      .map(([name, idx]) => this.generateIndexSnapshot(name, idx))
      .join(',\n    ')}
  },
  migrations: ${migrationsStr}
} as const;`;

    await writeFile(
      `${this.snapshotPath}/schemas/${schemaName}/${table.tableName}.snapshot.ts`,
      content,
    );
  }

  private formatMigrationsForSnapshot(
    migrations: ReadonlyArray<SQLMigration>,
  ): string {
    if (migrations.length === 0) return '[]';

    const migrationStrs = migrations.map((m) => {
      const sqlsStr = m.sqls
        .map((sql) => `'${sql.toString().replace(/'/g, "\\'")}'`)
        .join(', ');
      return `{ name: '${m.name}', sqls: [${sqlsStr}] }`;
    });

    return `[\n    ${migrationStrs.join(',\n    ')}\n  ]`;
  }

  private groupMigrations(migrations: SQLMigration[]) {
    return {
      schemas: migrations.filter((m) => m.name.includes('schema')),
      tables: migrations.filter((m) => m.name.includes('create_table')),
      columns: migrations.filter(
        (m) => m.name.includes('add_') || m.name.includes('alter_'),
      ),
      indexes: migrations.filter((m) => m.name.includes('index')),
    };
  }
}
```

## Testing Strategy

### Unit Tests

Following the pattern in [src/packages/dumbo/src/core/schema/dumboSchema/dumboSchema.unit.spec.ts](src/packages/dumbo/src/core/schema/dumboSchema/dumboSchema.unit.spec.ts):

```typescript
// src/packages/dumbo/src/core/schema/generators/migrationGenerator.unit.spec.ts
import { describe, it, assert } from 'vitest';
import { tableSchemaComponent } from '../components/tableSchemaComponent';
import { column } from '../components/columnSchemaComponent';

describe('generateTableMigrations', () => {
  it('should generate CREATE TABLE from TypeScript definition', () => {
    const table = tableSchemaComponent({
      tableName: 'users',
      columns: {
        id: column('id', { type: 'serial', primaryKey: true }),
        email: column('email', {
          type: 'varchar',
          length: 255,
          nullable: false,
        }),
      },
    });

    const migrations = table.generateMigrations();

    assert.equal(migrations.length, 1);
    assert.match(migrations[0].sqls[0], /CREATE TABLE IF NOT EXISTS users/);
    assert.match(migrations[0].sqls[0], /id SERIAL PRIMARY KEY/);
    assert.match(migrations[0].sqls[0], /email VARCHAR\(255\) NOT NULL/);
  });

  it('should detect added columns when comparing with snapshot', () => {
    const snapshot = {
      tableName: 'users',
      columns: {
        id: { type: 'serial' as const, primaryKey: true },
      },
      indexes: {},
    };

    const table = tableSchemaComponent({
      tableName: 'users',
      columns: {
        id: column('id', { type: 'serial', primaryKey: true }),
        email: column('email', { type: 'varchar', length: 255 }),
      },
    });

    const migrations = table.generateMigrations(snapshot);

    assert.equal(migrations.length, 1);
    assert.match(
      migrations[0].sqls[0],
      /ALTER TABLE users ADD COLUMN IF NOT EXISTS email/,
    );
  });
});
```

### Integration Tests

```typescript
// src/packages/dumbo/src/core/schema/orchestrator/migrationOrchestrator.integration.spec.ts
import { describe, it, assert, beforeEach } from 'vitest';
import { MigrationOrchestrator } from './migrationOrchestrator';
import { createTestDatabase } from '../../test/utils';

describe('MigrationOrchestrator integration', () => {
  let db: Dumbo;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  it('should apply schema changes in correct order', async () => {
    const schema = databaseSchemaComponent({
      databaseName: 'test',
      schemas: {
        public: databaseSchemaSchemaComponent({
          schemaName: 'public',
          tables: {
            users: tableSchemaComponent({
              tableName: 'users',
              columns: {
                id: column('id', { type: 'serial', primaryKey: true }),
                email: column('email', { type: 'varchar', length: 255 }),
              },
            }),
            posts: tableSchemaComponent({
              tableName: 'posts',
              columns: {
                id: column('id', { type: 'serial', primaryKey: true }),
                userId: column('userId', {
                  type: 'int',
                  references: { table: 'users', column: 'id' },
                }),
              },
            }),
          },
        }),
      },
    });

    const orchestrator = new MigrationOrchestrator(schema);
    await orchestrator.runMigrations(db);

    // Verify tables were created
    const tables = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);

    assert.deepEqual(tables.map((t) => t.table_name).sort(), [
      'posts',
      'users',
    ]);

    // Verify columns exist
    const columns = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users'
    `);

    assert.equal(columns.length, 2);
  });
});
```

### End-to-End Tests

```typescript
// src/packages/dumbo/src/core/schema/e2e/schemaEvolution.e2e.spec.ts
describe('Schema evolution E2E', () => {
  it('should handle complete schema lifecycle', async () => {
    // 1. Initial schema definition
    const v1Schema = createSchema({ version: 1 });
    await orchestrator.runMigrations(v1Schema);
    await orchestrator.updateSnapshot();

    // 2. Schema modification
    const v2Schema = createSchema({
      version: 2,
      addColumn: { table: 'users', column: 'phone' },
    });

    // 3. Diff detection
    const diff = await orchestrator.diff(v2Schema);
    assert.equal(diff.changes.length, 1);
    assert.equal(diff.changes[0].type, 'add_column');

    // 4. Migration generation
    const migrations = await orchestrator.generateMigrations();
    assert.equal(migrations.length, 1);

    // 5. Migration application
    await orchestrator.runMigrations(v2Schema);

    // 6. Snapshot update
    await orchestrator.updateSnapshot();

    // 7. Type generation
    const types = await generateTypesFromSnapshot();
    assert.match(types, /phone: string | null/);

    // 8. Validation
    const validation = await validateMigrationsAgainstSchema(v2Schema);
    assert.equal(validation.valid, true);
  });
});
```

## Complete Flow Example

This section demonstrates how all pieces work together in practice:

### Step 1: Initial Component Definition with SQL Migration

```typescript
// User defines component with custom SQL migration
const usersTable = tableSchemaComponent({
  tableName: 'users',
  columns: {
    id: column('id', { type: 'serial', primaryKey: true }),
    email: column('email', { type: 'varchar', length: 255 }),
  },
  migrations: [
    sqlMigration('001_custom_create', [
      SQL`CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE,
        internal_tracking JSONB DEFAULT '{}'
      )`,
    ]),
  ],
});
```

### Step 2: First Orchestrator Run

```typescript
const orchestrator = new MigrationOrchestrator(database);

// Process migrations (validates, diffs, writes new ones)
await orchestrator.processMigrations();
// - No snapshot exists, so no validation needed
// - Detects '001_custom_create' as new
// - Writes to: .dumbo/migrations/2024-01-15-001-custom_create.sql
```

### Step 3: Generated Files After First Run

```sql
-- .dumbo/migrations/2024-01-15-001-custom_create.sql
-- Source: provided (from component migrations array)
-- Component: sc:dumbo:table:users
-- Type: table
-- Migration name: 001_custom_create
-- Written at: 2024-01-15T10:30:00Z

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  internal_tracking JSONB DEFAULT '{}'
);
```

```typescript
// .dumbo/snapshots/schemas/public/users.snapshot.ts
export const usersSnapshot = {
  tableName: 'users',
  columns: {
    id: { type: 'serial' as const, primaryKey: true },
    email: { type: 'varchar' as const, length: 255, nullable: false },
  },
  indexes: {},
  migrations: [
    {
      name: '001_custom_create',
      sqls: [
        "CREATE TABLE users (id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE, internal_tracking JSONB DEFAULT '{}')",
      ],
    },
  ],
} as const;
```

### Step 4: User Adds New Column and Migration

```typescript
// User updates component
const usersTable = tableSchemaComponent({
  tableName: 'users',
  columns: {
    id: column('id', { type: 'serial', primaryKey: true }),
    email: column('email', { type: 'varchar', length: 255 }),
    name: column('name', { type: 'varchar', length: 100 }), // NEW!
  },
  migrations: [
    sqlMigration('001_custom_create', [
      SQL`CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE,
        internal_tracking JSONB DEFAULT '{}'
      )`,
    ]),
    sqlMigration('002_add_name', [
      // NEW!
      SQL`ALTER TABLE users ADD COLUMN name VARCHAR(100)`,
    ]),
  ],
});
```

### Step 5: Second Orchestrator Run

```typescript
await orchestrator.processMigrations();
// 1. Validates '001_custom_create' hasn't changed ✓
// 2. Detects '002_add_name' as new
// 3. Writes new migration to file
// 4. NO generated migration for 'name' column (user provided SQL)
```

### Step 6: Error Case - Modified Migration

```typescript
// User accidentally modifies existing migration (BAD!)
const usersTable = tableSchemaComponent({
  tableName: 'users',
  migrations: [
    sqlMigration('001_custom_create', [
      SQL`CREATE TABLE users (
        id BIGSERIAL PRIMARY KEY,  // Changed from SERIAL!
        email VARCHAR(255) UNIQUE,
        internal_tracking JSONB DEFAULT '{}'
      )`,
    ]),
    sqlMigration('002_add_name', [
      SQL`ALTER TABLE users ADD COLUMN name VARCHAR(100)`,
    ]),
  ],
});

await orchestrator.processMigrations();
// Throws error:
// Migration '001_custom_create' has been modified!
// Original SQL:
// CREATE TABLE users (id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE, internal_tracking JSONB DEFAULT '{}')
//
// Current SQL:
// CREATE TABLE users (id BIGSERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE, internal_tracking JSONB DEFAULT '{}')
//
// Migrations must be immutable once defined. Add a new migration instead.
```

### Step 7: Mixed Mode - TypeScript + SQL

```typescript
// Another table with TypeScript-first approach
const postsTable = tableSchemaComponent({
  tableName: 'posts',
  columns: {
    id: column('id', { type: 'serial', primaryKey: true }),
    title: column('title', { type: 'varchar', length: 255 }),
    userId: column('userId', {
      type: 'int',
      references: { table: 'users', column: 'id' },
    }),
  },
  // No migrations provided - will be generated!
});

await orchestrator.processMigrations();
// Generates and writes: .dumbo/migrations/2024-01-15-002-create_table_posts.sql
// Content:
// -- Source: generated (from TypeScript definitions)
// -- Component: sc:dumbo:table:posts
// -- Generated at: 2024-01-15T10:45:00Z
// CREATE TABLE IF NOT EXISTS posts (
//   id SERIAL PRIMARY KEY,
//   title VARCHAR(255) NOT NULL,
//   userId INT REFERENCES users(id)
// );
```

### Step 8: Type Generation

```typescript
// Generate types from snapshots
const types = await generateTypesFromSnapshot(databaseSnapshot);

// Results in:
export type DatabaseSchema = {
  public: {
    users: {
      id: number;
      email: string;
      name: string | null;
    };
    posts: {
      id: number;
      title: string;
      userId: number;
    };
  };
};

// Can be used in Pongo query builder:
const result = await pongo
  .from('users')
  .where('email', '=', 'test@example.com')
  .select(['id', 'name']);
// TypeScript knows result is { id: number; name: string | null }[]
```

## Migration Strategy for Existing Code

1. **Backward Compatible**: Existing SQL-first code continues to work unchanged
2. **Progressive Enhancement**: Can add TypeScript definitions gradually
3. **Opt-in Validation**: Validation only runs when explicitly enabled
4. **Safe Defaults**: Use `CREATE IF NOT EXISTS` when no snapshot found

## Success Criteria

1. ✅ Each component can generate its own migrations
2. ✅ Database component traverses tree in correct order
3. ✅ Can use raw SQL migrations without TypeScript (backward compatible)
4. ✅ Can validate SQL migrations against TypeScript definitions
5. ✅ Nested snapshot system minimizes merge conflicts
6. ✅ Types can be generated from schema for Pongo integration
7. ✅ CLI provides clear workflow for schema evolution
8. ✅ Type safety maintained throughout
9. ✅ No breaking changes to existing API

## Key Architectural Decisions

1. **Each component generates its own migrations** - Encapsulation and single responsibility
2. **Database component orchestrates collection** - Single entry point for migration generation
3. **Tree traversal follows dependency order** - Schemas → Tables → Columns → Indexes → Foreign Keys
4. **TypeScript definitions are source of truth when present** - Override SQL for intended state
5. **Nested snapshot structure** - Each table/schema in separate file to minimize conflicts
6. **TypeScript snapshot format** - Type safety and IDE support over JSON simplicity
7. **Snapshots track component migrations** - Enable detection of new user-provided migrations
8. **All migrations go to `.dumbo/migrations/`** - Both generated and user-provided, uniform handling
9. **Migration immutability enforced** - Once in snapshot, migrations cannot be modified
10. **CREATE IF NOT EXISTS as default** - Safe behavior when no snapshot exists
11. **Indexes generate as separate migrations** - Clean separation of concerns
12. **Validation is opt-in** - No breaking changes, teams choose their strictness level
13. **Type generation from snapshots** - Enable strongly-typed Pongo query builders

## Implementation Order

1. **Phase 1**: Column definitions with SQL generation
2. **Phase 2**: Nested snapshot system structure with migration tracking
3. **Phase 3**: Component-specific migration generation (each component file)
4. **Phase 4**: Tree traversal in database component
5. **Phase 5**: Schema differ for change detection
6. **Phase 6**: Type generation from schema snapshots
7. **Phase 7**: Migration immutability validation
8. **Phase 8**: Schema validation system with detailed errors
9. **Phase 9**: CLI commands for workflow
10. **Phase 10**: Migration orchestrator with diffing and validation

Each phase builds on the previous one and can be tested independently. The key insight is that each component knows how to generate its own SQL, and the database component knows how to traverse the tree in the correct order to collect all migrations.

## Future Enhancements (Out of Scope)

1. **Query Builder Integration**: Use generated types for strongly-typed Pongo queries
2. **Schema Introspection**: Read current schema from database and generate TypeScript
3. **Migration Rollback**: Track down migrations and generate reversal scripts
4. **Multi-Database Support**: PostgreSQL, MySQL, SQLite-specific features
5. **Partial Schema Definitions**: Allow defining subset of columns for gradual adoption
6. **Smart Merge Tool**: CLI command to help resolve snapshot conflicts
7. **Performance Optimization**: Cache component trees for large schemas

## Summary

This plan unifies SQL migrations and TypeScript schema definitions through:

### Core Innovations

1. **Dual-purpose snapshots** - Track both current schema state AND component migrations
2. **Migration diffing** - Detect new user-provided migrations by comparing with snapshots
3. **Immutability enforcement** - Prevent dangerous modification of existing migrations
4. **Unified migration storage** - All migrations (generated/provided) go to `.dumbo/migrations/`
5. **Nested snapshot structure** - Minimize git conflicts by separating tables into files

### Key Benefits

- **Flexibility** - Support SQL-first, TypeScript-first, or hybrid approaches
- **Safety** - Migration immutability prevents accidental schema corruption
- **Type Safety** - Generate types from snapshots for Pongo query builders
- **Gradual Adoption** - Add TypeScript definitions progressively to SQL-first projects
- **Clear Audit Trail** - Track all migrations with source metadata

### Migration Workflow

1. Component defines schema (TypeScript) and/or migrations (SQL)
2. Orchestrator validates immutability against snapshot
3. New user-provided migrations are written to files
4. TypeScript definitions generate missing migrations
5. Snapshots update to reflect current state + migrations
6. Types are generated for strongly-typed queries

This architecture provides a robust foundation for schema evolution while maintaining backwards compatibility and enabling progressive enhancement.

## References

- Component hierarchy uses URN system with `sc:dumbo:database:{name}` pattern
- Migration bubbling happens at lines 79-83 in schemaComponent.ts
- Recent refactoring in commit 03fb40a changed to use `Exclude` instead of `Omit`
- Test patterns follow existing dumboSchema.unit.spec.ts structure
- Integration target is Pongo schema system in src/packages/pongo/src/core/schema/index.ts
