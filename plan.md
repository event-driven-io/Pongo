# Foreign Key Type Validation Implementation Plan

## Overview

Implement compile-time type validation for foreign keys in Dumbo schema definitions. The validation happens at the database/schema level (top-down), ensuring all foreign key references are valid without requiring `as const` annotations.

## Goals

- ✅ Type-safe foreign key definitions with full intellisense
- ✅ Validate `columns` array contains only columns from the defining table
- ✅ Validate `references` array contains only valid `schema.table.column` paths
- ✅ Support composite foreign keys (multiple columns mapping to multiple references)
- ✅ Support self-referential foreign keys
- ✅ Clear, actionable error messages when validation fails
- ✅ No runtime validation - pure TypeScript type-level implementation
- ✅ No `as const` required - use generic inference

## Technical Approach

### Type System Strategy

1. Use generic inference in `table()` function to capture exact tuple types from array literals
2. Store foreign key definitions in table schema component
3. Validate all foreign keys at `database()` level using recursive type utilities
4. Show all validation errors (optimize to first error only if performance issues arise)

### Validation Flow

```
database() called
  → Extract all schemas
    → Extract all tables from each schema
      → Extract all columns from each table
        → Build union of all valid column references: 'schema.table.column'
          → For each table with relationships:
            → Validate each FK's columns array against table's columns
            → Validate each FK's references array against all valid column references
            → Validate columns.length === references.length
              → Collect all errors with helpful messages
                → If any errors: database() RETURN TYPE becomes ValidationResult<false, error>
                → If no errors: database() RETURN TYPE is DatabaseSchemaComponent<Schemas>
                → TypeScript shows errors at database() call site when types don't match
                → Use Expect/ExpectError type tests to verify validation works
```

**Why Return Types:**
TypeScript cannot validate function parameters before type inference completes. The solution is conditional return types - when validation fails, the return type becomes an error object (`{ valid: false; error: "..." }`) which is incompatible with `DatabaseSchemaComponent`, causing type errors at the assignment site.

## Quality Gates

**CRITICAL: After EVERY step, run the following as subagents (to reduce context):**

1. `cd src & npm run fix` - Fix linting issues
2. `cd src & npm run build:ts` - Ensure TypeScript compiles
3. `cd src & npm run test:unit` - Run all tests

YOU MUST run them through sub agents, not bash.

**All three must pass before proceeding to the next step.**

If any fail and cannot be fixed automatically, **STOP and ask for help**.

## Validation Protocol

For EACH step:

1. Make changes to the code
2. Run quality gates ONCE via subagents in parallel:
   - `npm run fix`
   - `npm run build:ts`
   - `npm run test:unit`
3. If any gate fails, fix the issue and trust that the fix worked (don't rerun)
4. Commit immediately after fixes
5. Mark step as complete

NEVER re-run the same command twice. Trust subagent results.

## Code Standards

- Use `describe`/`it` for runtime tests (matching existing test patterns)
- For type tests (\*.type.spec.ts), use simple type assertions at top level (no `void it()` wrappers - see tableTypesInference.type.spec.ts)
- Never import js files, always use typescript,
- No classes unless absolutely necessary
- Avoid over-complexity
- No comments unless they add genuine value
- Follow existing codebase patterns and conventions
- Prefer simple, clean, maintainable solutions

## Implementation Phases

### Phase 1: Foundation - Type Extraction Utilities

Build the base type utilities to extract schema structure information.

**Files to create/modify:**

- `src/packages/dumbo/src/core/schema/relationships/relationshipTypes.ts` (new)
- `src/packages/dumbo/src/core/schema/relationships/relationshipValidation.type.spec.ts` (new)
- `src/packages/dumbo/src/core/testing/typesTesting.ts` (modify - add ExpectError)

**Deliverables:**

- `ExpectError<T>` helper type
- `ExtractSchemaNames<DB>` - extract schema names from database
- `ExtractTableNames<Schema>` - extract table names from schema
- Type tests for all extraction utilities (reuse existing `TableColumnNames` for columns)

### Phase 2: Column Reference Generation

Build utilities to generate all valid column reference paths.

**Files to create/modify:**

- `src/packages/dumbo/src/core/schema/relationships/relationshipTypes.ts` (modify)
- `src/packages/dumbo/src/core/schema/relationships/relationshipValidation.type.spec.ts` (modify)

**Deliverables:**

- `AllColumnReferences<DB>` - generate union of all valid 'schema.table.column' strings
- Type tests for single-schema and multi-schema databases

### Phase 3: Foreign Key Type Definition

Define the foreign key structure and add it to table schema component.

**Files to create/modify:**

- `src/packages/dumbo/src/core/schema/relationships/relationshipTypes.ts` (modify)
- `src/packages/dumbo/src/core/schema/components/tableSchemaComponent.ts` (modify)
- `src/packages/dumbo/src/core/schema/relationships/relationshipValidation.type.spec.ts` (modify)

**Deliverables:**

- `RelationshipDefinition` type
- Updated `TableSchemaComponent<Columns, Relationships>` with generic FK parameter
- Type tests for FK structure

### Phase 4: Single Foreign Key Validation

Implement validation logic for a single foreign key definition.

**Files to create/modify:**

- `src/packages/dumbo/src/core/schema/relationships/relationshipValidation.ts` (new)
- `src/packages/dumbo/src/core/schema/relationships/relationshipValidation.type.spec.ts` (modify)

**Deliverables:**

- `ValidateRelationshipColumns<FK, TableColumns>` - validate columns array
- `ValidateRelationshipReferences<FK, ValidRefs>` - validate references array
- `ValidateRelationshipLength<FK>` - validate columns.length === references.length
- `ValidateSingleRelationship<FK, TableColumns, ValidRefs>` - combine all validations
- Comprehensive error message types with helpful suggestions
- Type tests for valid and invalid scenarios

### Phase 5: Full Database Validation

Implement database-level validation that checks all foreign keys across all tables.

**Files to create/modify:**

- `src/packages/dumbo/src/core/schema/relationships/relationshipValidation.ts` (modify)
- `src/packages/dumbo/src/core/schema/relationships/relationshipValidation.type.spec.ts` (modify)

**Deliverables:**

- `ValidateTableRelationships<Table, ValidRefs>` - validate all FKs in a table
- `ValidateSchemaRelationships<Schema, ValidRefs>` - validate all FKs in a schema
- `ValidateDatabaseRelationships<DB>` - validate all FKs in entire database
- Type tests for multi-table, multi-schema validation

### Phase 6: Integration with dumboSchema

Wire up validation to the `database()` and `schema()` functions.

**Files to create/modify:**

- `src/packages/dumbo/src/core/schema/dumboSchema/dumboSchema.ts` (modify)
- `src/packages/dumbo/src/core/schema/components/index.ts` (modify - re-export FK types)
- `src/packages/dumbo/src/core/schema/relationships/index.ts` (new - barrel export)

**Deliverables:**

- Updated `dumboTable` signature to accept and capture `relationships` generic
- Updated `dumboDatabase` signature with FK validation constraint
- Updated `dumboDatabaseSchema` signature with FK validation constraint
- Proper type exports

### Phase 7: Real-World Testing

Test with actual schema definitions and ensure everything works.

**Files to create/modify:**

- `src/packages/dumbo/src/core/schema/dumboSchema/dumboSchema.unit.spec.ts` (modify)

**Deliverables:**

- Working examples with valid foreign keys
- Multiple test cases (single FK, composite FK, self-referential, multiple FKs, cross-schema)
- Update existing multiSchemaDb example to verify it works correctly

---

## Detailed Step-by-Step Prompts

Each prompt below is self-contained and builds on the previous work. They follow TDD principles: write type tests first, then implement the types to pass the tests.

---

### Step 1: Add ExpectError Helper

**Context:** We need a type helper to test that validation errors are properly generated. This helper will be used throughout our type tests.

**Prompt:**

````
Add an `ExpectError<T>` helper type to src/packages/dumbo/src/core/testing/typesTesting.ts.

The helper should:
- Accept a type parameter T
- Return true if T extends { valid: false }
- Be used like: type Test = ExpectError<ValidationResult>

Add it below the existing Expect and Equal helpers, and export it.

Example usage:
```typescript
type InvalidCase = { valid: false, error: string };
type Test = ExpectError<InvalidCase>;
````

After implementation, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass before proceeding.

```

**Acceptance Criteria:**
- ExpectError type added and exported
- No breaking changes to existing tests
- All quality gates pass

---

### Step 2: Create Foreign Key Types File Structure

**Context:** Set up the base file structure for foreign key validation types and tests.

**Prompt:**
```

Create two new files:

1. src/packages/dumbo/src/core/schema/relationships/relationshipTypes.ts

   - Add placeholder comment: `// Foreign key type definitions`

2. src/packages/dumbo/src/core/schema/relationships/relationshipValidation.type.spec.ts
   - Import Expect, Equal, ExpectError from '../../testing'
   - Add comment placeholders for test sections:
     - Schema Structure Extraction
     - Column Reference Generation
     - Foreign Key Definition Structure
     - Foreign Key Validation - Valid Cases
     - Foreign Key Validation - Invalid Cases
     - Integration Tests
   - Follow the pattern from tableTypesInference.type.spec.ts (simple type assertions, no describe/it blocks)

Ensure the test file is recognized by the test runner.

After implementation, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass before proceeding.

```

**Acceptance Criteria:**
- Both files created with proper structure
- Test file runs without errors
- File structure follows existing patterns
- All quality gates pass

---

### Step 3: Implement ExtractSchemaNames Type Utility

**Context:** We need to extract schema names from a database type to build validation logic.

**Prompt:**
```

Following TDD approach, add type tests then implement ExtractSchemaNames utility.

In relationshipValidation.type.spec.ts, add under 'Schema Structure Extraction' comment section:

```typescript
// Schema Structure Extraction

// ExtractSchemaNames - single schema
type _DB1 = DatabaseSchemaComponent<{
  public: DatabaseSchemaSchemaComponent<DatabaseSchemaTables>;
}>;
type _Test1 = Expect<Equal<ExtractSchemaNames<_DB1>, "public">>;

// ExtractSchemaNames - multi schema
type _DB2 = DatabaseSchemaComponent<{
  public: DatabaseSchemaSchemaComponent<DatabaseSchemaTables>;
  analytics: DatabaseSchemaSchemaComponent<DatabaseSchemaTables>;
}>;
type _Test2 = Expect<Equal<ExtractSchemaNames<_DB2>, "public" | "analytics">>;
```

Then in relationshipTypes.ts, implement:

```typescript
import type { DatabaseSchemaComponent, DatabaseSchemas } from "../components";

export type ExtractSchemaNames<DB extends DatabaseSchemaComponent> =
  DB extends DatabaseSchemaComponent<infer Schemas extends DatabaseSchemas>
    ? keyof Schemas & string
    : never;
```

After implementation, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass before proceeding.

```

**Acceptance Criteria:**
- Type tests added and pass
- ExtractSchemaNames correctly extracts schema names
- All quality gates pass

---

### Step 4: Implement ExtractTableNames Type Utility

**Context:** Extract table names from a schema to build validation logic.

**Prompt:**
```

Following TDD approach, add type tests then implement ExtractTableNames utility.

In relationshipValidation.type.spec.ts, add to 'Schema Structure Extraction' describe block:

```typescript
void it("should extract table names from single-table schema", () => {
  type Schema = DatabaseSchemaSchemaComponent<{
    users: TableSchemaComponent<TableColumns>;
  }>;

  type Result = ExtractTableNames<Schema>;
  type Test = Expect<Equal<Result, "users">>;
});

void it("should extract table names from multi-table schema", () => {
  type Schema = DatabaseSchemaSchemaComponent<{
    users: TableSchemaComponent<TableColumns>;
    posts: TableSchemaComponent<TableColumns>;
    comments: TableSchemaComponent<TableColumns>;
  }>;

  type Result = ExtractTableNames<Schema>;
  type Test = Expect<Equal<Result, "users" | "posts" | "comments">>;
});
```

Then in relationshipTypes.ts, implement:

```typescript
import type {
  DatabaseSchemaSchemaComponent,
  DatabaseSchemaTables,
} from "../components";

export type ExtractTableNames<Schema extends DatabaseSchemaSchemaComponent> =
  Schema extends DatabaseSchemaSchemaComponent<
    infer Tables extends DatabaseSchemaTables
  >
    ? keyof Tables & string
    : never;
```

After implementation, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass before proceeding.

```

**Acceptance Criteria:**
- Type tests added and pass
- ExtractTableNames correctly extracts table names
- All quality gates pass

---

### Step 5: Implement ExtractColumnNames Type Utility

**Context:** Extract column names from a table to validate foreign key columns array.

**Prompt:**
```

Following TDD approach, add type tests then implement ExtractColumnNames utility.

In relationshipValidation.type.spec.ts, add to 'Schema Structure Extraction' describe block:

```typescript
void it("should extract column names from single-column table", () => {
  type Table = TableSchemaComponent<{
    id: AnyColumnSchemaComponent;
  }>;

  type Result = ExtractColumnNames<Table>;
  type Test = Expect<Equal<Result, "id">>;
});

void it("should extract column names from multi-column table", () => {
  type Table = TableSchemaComponent<{
    id: AnyColumnSchemaComponent;
    email: AnyColumnSchemaComponent;
    name: AnyColumnSchemaComponent;
    created_at: AnyColumnSchemaComponent;
  }>;

  type Result = ExtractColumnNames<Table>;
  type Test = Expect<Equal<Result, "id" | "email" | "name" | "created_at">>;
});
```

Then in relationshipTypes.ts, implement:

```typescript
import type {
  TableSchemaComponent,
  TableColumns,
  TableColumnNames,
} from "../components";

export type ExtractColumnNames<Table extends TableSchemaComponent> =
  Table extends TableSchemaComponent<infer Columns extends TableColumns>
    ? TableColumnNames<Table>
    : never;
```

After implementation, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass before proceeding.

```

**Acceptance Criteria:**
- Type tests added and pass
- ExtractColumnNames reuses existing TableColumnNames utility
- All quality gates pass

---

### Step 6: Implement AllColumnReferences Type Utility (Single Schema)

**Context:** Generate all valid column reference paths in 'schema.table.column' format. Start with single schema case.

**Prompt:**
```

Following TDD approach, add type test then implement AllColumnReferences for single schema.

In relationshipValidation.type.spec.ts, add to 'Column Reference Generation' describe block:

```typescript
import { SQL } from "../../../sql";
import { dumboSchema } from "../../dumboSchema";

const { database, schema, table, column } = dumboSchema;
const { Varchar } = SQL.column.type;

void it("should generate column references for single schema with one table", () => {
  const db = database("test", {
    public: schema("public", {
      users: table("users", {
        columns: {
          id: column("id", Varchar("max")),
          email: column("email", Varchar("max")),
        },
      }),
    }),
  });

  type Result = AllColumnReferences<typeof db>;
  type Test = Expect<Equal<Result, "public.users.id" | "public.users.email">>;
});

void it("should generate column references for single schema with multiple tables", () => {
  const db = database("test", {
    public: schema("public", {
      users: table("users", {
        columns: {
          id: column("id", Varchar("max")),
          email: column("email", Varchar("max")),
        },
      }),
      posts: table("posts", {
        columns: {
          id: column("id", Varchar("max")),
          title: column("title", Varchar("max")),
          user_id: column("user_id", Varchar("max")),
        },
      }),
    }),
  });

  type Result = AllColumnReferences<typeof db>;
  type Test = Expect<
    Equal<
      Result,
      | "public.users.id"
      | "public.users.email"
      | "public.posts.id"
      | "public.posts.title"
      | "public.posts.user_id"
    >
  >;
});
```

Then in relationshipTypes.ts, implement:

```typescript
export type AllColumnReferences<DB extends DatabaseSchemaComponent> =
  DB extends DatabaseSchemaComponent<infer Schemas extends DatabaseSchemas>
    ? {
        [SchemaName in keyof Schemas]: Schemas[SchemaName] extends DatabaseSchemaSchemaComponent<
          infer Tables
        >
          ? {
              [TableName in keyof Tables]: Tables[TableName] extends TableSchemaComponent<
                infer Columns
              >
                ? {
                    [ColumnName in keyof Columns]: `${SchemaName &
                      string}.${TableName & string}.${ColumnName & string}`;
                  }[keyof Columns]
                : never;
            }[keyof Tables]
          : never;
      }[keyof Schemas]
    : never;
```

After implementation, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass before proceeding.

```

**Acceptance Criteria:**
- Type tests added and pass
- AllColumnReferences generates correct paths for single schema
- All quality gates pass

---

### Step 7: Test AllColumnReferences with Multi-Schema Database

**Context:** Verify AllColumnReferences works with multiple schemas.

**Prompt:**
```

Add type test for multi-schema database to verify AllColumnReferences works correctly.

In relationshipValidation.type.spec.ts, add to 'Column Reference Generation' describe block:

```typescript
void it("should generate column references for multi-schema database", () => {
  const db = database("test", {
    public: schema("public", {
      users: table("users", {
        columns: {
          id: column("id", Varchar("max")),
          email: column("email", Varchar("max")),
        },
      }),
    }),
    analytics: schema("analytics", {
      events: table("events", {
        columns: {
          id: column("id", Varchar("max")),
          user_id: column("user_id", Varchar("max")),
          event_type: column("event_type", Varchar("max")),
        },
      }),
    }),
  });

  type Result = AllColumnReferences<typeof db>;
  type Test = Expect<
    Equal<
      Result,
      | "public.users.id"
      | "public.users.email"
      | "analytics.events.id"
      | "analytics.events.user_id"
      | "analytics.events.event_type"
    >
  >;
});
```

Run tests to ensure they pass. No implementation changes needed - this verifies existing implementation works.

After implementation, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass before proceeding.

```

**Acceptance Criteria:**
- Type test added and passes
- AllColumnReferences works with multiple schemas
- All quality gates pass

---

### Step 8: Define RelationshipDefinition Type

**Context:** Define the structure for foreign key definitions that tables will use.

**Prompt:**
```

Add the RelationshipDefinition type to relationshipTypes.ts and create a basic type test.

In relationshipTypes.ts, add:

```typescript
export type RelationshipDefinition = {
  readonly columns: readonly string[];
  readonly references: readonly string[];
};
```

In relationshipValidation.type.spec.ts, add to 'Foreign Key Definition Structure' describe block:

```typescript
void it("should accept valid foreign key definition", () => {
  type FK = RelationshipDefinition;

  const validFK: FK = {
    columns: ["user_id"],
    references: ["public.users.id"],
  };

  type ColumnsType = typeof validFK.columns;
  type Test = Expect<Equal<ColumnsType, readonly string[]>>;
});

void it("should accept composite foreign key definition", () => {
  type FK = RelationshipDefinition;

  const compositeFK: FK = {
    columns: ["user_id", "tenant_id"],
    references: ["public.users.id", "public.users.tenant_id"],
  };

  type ColumnsType = typeof compositeFK.columns;
  type ReferencesType = typeof compositeFK.references;
  type Test1 = Expect<Equal<ColumnsType, readonly string[]>>;
  type Test2 = Expect<Equal<ReferencesType, readonly string[]>>;
});
```

After implementation, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass before proceeding.

```

**Acceptance Criteria:**
- RelationshipDefinition type added
- Basic structure tests pass
- All quality gates pass

---

### Step 9: Update TableSchemaComponent to Include Foreign Keys

**Context:** Add foreign keys support to the table schema component type definition.

**Prompt:**
```

Update TableSchemaComponent to support an optional relationships property.

In src/packages/dumbo/src/core/schema/components/tableSchemaComponent.ts:

1. Import RelationshipDefinition:

```typescript
import type { RelationshipDefinition } from "../relationships/relationshipTypes";
```

2. Add generic parameter for foreign keys and relationships property:

```typescript
export type TableSchemaComponent<
  Columns extends TableColumns = TableColumns,
  Relationships extends readonly RelationshipDefinition[] = readonly RelationshipDefinition[]
> = SchemaComponent<
  TableURN,
  Readonly<{
    tableName: string;
    columns: ReadonlyMap<string, AnyColumnSchemaComponent> & Columns;
    primaryKey: TableColumnNames<
      TableSchemaComponent<Columns, Relationships>
    >[];
    relationships?: Relationships;
    indexes: ReadonlyMap<string, IndexSchemaComponent>;
    addColumn: (column: AnyColumnSchemaComponent) => AnyColumnSchemaComponent;
    addIndex: (index: IndexSchemaComponent) => IndexSchemaComponent;
  }>
>;
```

3. Update AnyTableSchemaComponent:

```typescript
export type AnyTableSchemaComponent = TableSchemaComponent<any, any>;
```

4. Update tableSchemaComponent function signature and implementation to accept and return relationships.

After implementation, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass before proceeding.

```

**Acceptance Criteria:**
- TableSchemaComponent updated with relationships support
- Generic parameter added for type safety
- No breaking changes to existing code
- All quality gates pass

---

### Step 10: Update dumboTable to Accept Foreign Keys

**Context:** Update the dumboTable function to accept and capture foreign keys with generic inference.

**Prompt:**
```

Update dumboTable function in dumboSchema.ts to accept relationships parameter.

In src/packages/dumbo/src/core/schema/dumboSchema/dumboSchema.ts:

1. Import RelationshipDefinition at the top:

```typescript
import type { RelationshipDefinition } from "../relationships/relationshipTypes";
```

2. Update dumboTable function to accept relationships in definition parameter and pass it to tableSchemaComponent.

After implementation, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass before proceeding.

```

**Acceptance Criteria:**
- dumboTable accepts relationships parameter
- Generic inference captures exact FK types
- No breaking changes
- All quality gates pass

---

### Step 11: Implement ValidateRelationshipLength

**Context:** Validate that foreign key columns and references arrays have matching lengths.

**Prompt:**
```

Following TDD, add type tests then implement ValidateRelationshipLength.

Create new file src/packages/dumbo/src/core/schema/relationships/relationshipValidation.ts with validation result types and ValidateRelationshipLength.

In relationshipValidation.type.spec.ts, add to 'Foreign Key Validation - Invalid Cases' describe block:

```typescript
void it("should error when columns and references have different lengths", () => {
  type FK = {
    columns: ["user_id", "tenant_id"];
    references: ["public.users.id"];
  };

  type Result = ValidateRelationshipLength<FK>;
  type Test = ExpectError<Result>;
});

void it("should pass when columns and references have same length", () => {
  type FK1 = {
    columns: ["user_id"];
    references: ["public.users.id"];
  };

  type FK2 = {
    columns: ["user_id", "tenant_id"];
    references: ["public.users.id", "public.users.tenant_id"];
  };

  type Result1 = ValidateRelationshipLength<FK1>;
  type Result2 = ValidateRelationshipLength<FK2>;
  type Test1 = Expect<Equal<Result1, { valid: true }>>;
  type Test2 = Expect<Equal<Result2, { valid: true }>>;
});
```

After implementation, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass before proceeding.

```

**Acceptance Criteria:**
- Type tests added and pass
- ValidateRelationshipLength correctly validates array lengths
- All quality gates pass

---

### Step 12: Implement ValidateRelationshipColumns

**Context:** Validate that all columns in a foreign key exist in the table.

**Prompt:**
```

Following TDD, add type tests then implement ValidateRelationshipColumns.

In relationshipValidation.type.spec.ts, add tests to both valid and invalid cases describe blocks.

In relationshipValidation.ts, implement ValidateRelationshipColumns with helper types to check if all elements of a tuple are in a union and to find invalid columns.

After implementation, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass before proceeding.

```

**Acceptance Criteria:**
- Type tests added and pass
- ValidateRelationshipColumns correctly validates column existence
- Helpful error messages show which columns are invalid
- All quality gates pass

---

### Step 13: Implement ValidateRelationshipReferences

**Context:** Validate that all references in a foreign key point to valid schema.table.column paths.

**Prompt:**
```

Following TDD, add type tests then implement ValidateRelationshipReferences.

In relationshipValidation.type.spec.ts, add tests for valid and invalid reference scenarios.

In relationshipValidation.ts, implement ValidateRelationshipReferences with helper to find invalid references.

After implementation, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass before proceeding.

```

**Acceptance Criteria:**
- Type tests added and pass
- ValidateRelationshipReferences correctly validates reference paths
- Helpful error messages show invalid references and available options
- All quality gates pass

---

### Step 14: Implement ValidateSingleRelationship (Combine Validations)

**Context:** Combine all FK validations into a single validation function.

**Prompt:**
```

Following TDD, add type tests then implement ValidateSingleRelationship that combines all validations.

In relationshipValidation.type.spec.ts, add tests for complete FK validation covering valid cases and all error scenarios.

In relationshipValidation.ts, implement ValidateSingleRelationship that chains length, columns, and references validation.

After implementation, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass before proceeding.

```

**Acceptance Criteria:**
- Type tests added and pass
- ValidateSingleRelationship checks all validation rules in order
- Returns first error encountered (fail fast)
- All quality gates pass

---

### Step 15: Implement ValidateTableRelationships

**Context:** Validate all foreign keys defined in a single table.

**Prompt:**
```

Following TDD, add type tests then implement ValidateTableRelationships.

In relationshipValidation.type.spec.ts, add tests for tables with no FKs, single FK, and multiple FKs.

In relationshipValidation.ts, implement ValidateTableRelationships with helper to iterate through FK array.

After implementation, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass before proceeding.

```

**Acceptance Criteria:**
- Type tests added and pass
- ValidateTableRelationships handles tables with 0, 1, or multiple FKs
- Returns first error encountered across all FKs
- All quality gates pass

---

### Step 16: Implement ValidateSchemaRelationships

**Context:** Validate all foreign keys across all tables in a schema.

**Prompt:**
```

Following TDD, add type tests then implement ValidateSchemaRelationships.

In relationshipValidation.type.spec.ts, add tests for schemas with multiple tables and FKs.

In relationshipValidation.ts, implement ValidateSchemaRelationships with helper to iterate through tables.

After implementation, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass before proceeding.

```

**Acceptance Criteria:**
- Type tests added and pass
- ValidateSchemaRelationships iterates through all tables
- Returns first error encountered
- All quality gates pass

---

### Step 17: Implement ValidateDatabaseRelationships

**Context:** Validate all foreign keys across all schemas in the database - the top-level validation.

**Prompt:**
```

Following TDD, add type tests then implement ValidateDatabaseRelationships.

In relationshipValidation.type.spec.ts, add to 'Integration Tests' describe block tests for complete database validation including self-referential FKs.

In relationshipValidation.ts, implement ValidateDatabaseRelationships that validates all schemas using AllColumnReferences.

After implementation, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass before proceeding.

```

**Acceptance Criteria:**
- Type tests added and pass
- ValidateDatabaseRelationships validates entire database
- Handles self-referential FKs correctly
- Returns first error encountered
- All quality gates pass

---

### Step 18: Create Foreign Keys Barrel Export

**Context:** Create an index file to export all foreign key types cleanly.

**Prompt:**
```

Create src/packages/dumbo/src/core/schema/relationships/index.ts to export all foreign key types.

Update src/packages/dumbo/src/core/schema/components/index.ts to re-export FK types.

After implementation, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass before proceeding.

````

**Acceptance Criteria:**
- Barrel export file created
- All FK types exported from components/index.ts
- No circular dependency issues
- All quality gates pass

---

### Step 19: Wire Validation to database() Function

**Context:** Add conditional return types to database() so invalid FKs cause type errors at the call site.

**Implementation Strategy:**

Use conditional return types on `database()` function overloads:

```typescript
function dumboDatabase<Schemas>(schemas: Schemas):
  ValidateDatabaseRelationships<DatabaseSchemaComponent<Schemas>> extends { valid: true }
    ? DatabaseSchemaComponent<Schemas>
    : ValidateDatabaseRelationships<DatabaseSchemaComponent<Schemas>>;
````

**How it works:**

1. User calls `const db = database({...})`
2. TypeScript infers exact `Schemas` type from literal
3. Return type is evaluated:
   - If validation passes: returns `DatabaseSchemaComponent<Schemas>`
   - If validation fails: returns `{ valid: false; error: "..." }`
4. Error object is incompatible with `DatabaseSchemaComponent`
5. Type error appears at `const db = database(...)` line
6. Error message shows which validation failed

**No `as const` needed** - Generic inference on `table()` already captures exact tuple types from array literals.

**Prompt:**

````

IMPORTANT: Follow TDD - Write failing type tests FIRST, then implement.

## Part 1: Add Failing Type Tests

Add to relationshipValidation.type.spec.ts:

```typescript
// TEST: Invalid column should cause type error at database() call
const _dbInvalidColumn = database('test', {
  public: schema('public', {
    posts: table('posts', {
      columns: {
        id: column('id', Varchar('max')),
        user_id: column('id', Varchar('max')),
      },
      relationships: [
        { columns: ['invalid_col'], references: ['public.users.id'] },
      ],
    }),
  }),
});

type _InvalidColResult = typeof _dbInvalidColumn;
type _Test_InvalidColumn = Expect<
  Equal<_InvalidColResult, DatabaseSchemaComponent<any>>
>; // This should FAIL because _InvalidColResult is error type

// TEST: Valid FK should work
const _dbValid = database('test', {
  public: schema('public', {
    users: table('users', {
      columns: { id: column('id', Varchar('max')) },
    }),
    posts: table('posts', {
      columns: {
        id: column('id', Varchar('max')),
        user_id: column('user_id', Varchar('max')),
      },
      relationships: [{ columns: ['user_id'], references: ['public.users.id'] }],
    }),
  }),
});

type _ValidResult = typeof _dbValid;
type _Test_Valid = Expect<
  Equal<_ValidResult, DatabaseSchemaComponent<any>>
>; // This should PASS
````

Run `npm run build:ts` - you should see errors because validation not wired yet.

## Part 2: Implement Validation

Update dumboDatabase function in dumboSchema.ts to add FK validation via conditional return types.

1. Import ValidateDatabaseRelationships from '../relationships'

2. Find the TWO overload signatures that accept `schemas: Schemas` parameter (around lines 137 and 147)

   - Do NOT modify overloads that accept single `schema` parameter

3. Change their return type from:

   ```typescript
   DatabaseSchemaComponent<Schemas>;
   ```

   To:

   ```typescript
   ValidateDatabaseRelationships<DatabaseSchemaComponent<Schemas>> extends { valid: true }
     ? DatabaseSchemaComponent<Schemas>
     : ValidateDatabaseRelationships<DatabaseSchemaComponent<Schemas>>
   ```

4. Update the implementation function's return statement (around line 197) to cast the result:
   ```typescript
   return databaseSchemaComponent({
     databaseName,
     schemas: schemaMap as Schemas,
     ...dbOptions,
   }) as ValidateDatabaseRelationships<
     DatabaseSchemaComponent<Schemas>
   > extends {
     valid: true;
   }
     ? DatabaseSchemaComponent<Schemas>
     : ValidateDatabaseRelationships<DatabaseSchemaComponent<Schemas>>;
   ```

After implementation, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass before proceeding.

```

**Acceptance Criteria:**
- Conditional return type added to database() overloads that accept schemas
- Type errors appear AT THE database() CALL SITE when invalid FKs provided
- Error messages show which FK validation failed
- Valid schemas continue to work with no changes
- All quality gates pass

---

### Step 20: Wire Validation to schema() Function

**Context:** Add FK validation to schema() for foreign keys that reference tables within the same schema. Cross-schema references cannot be validated at this level.

**Implementation Strategy:**

Similar to database(), use conditional return types on `schema()` function overloads. However, validation is limited to:
- FK columns must exist in the table
- FK references must be within the SAME schema (format: `schema.table.column` where schema matches current schema name)
- Cross-schema references will only be validated at database() level

**Prompt:**
```

IMPORTANT: Follow TDD - Write failing type tests FIRST, then implement.

## Part 1: Add Failing Type Tests

Add to relationshipValidation.type.spec.ts:

```typescript
// TEST: Invalid intra-schema FK at schema() level
const _schemaInvalidFK = schema("public", {
  posts: table("posts", {
    columns: {
      id: column("id", Varchar("max")),
      user_id: column("user_id", Varchar("max")),
    },
    relationships: [
      { columns: ["invalid_col"], references: ["public.users.id"] },
    ],
  }),
});

type _SchemaInvalidResult = typeof _schemaInvalidFK;
type _Test_SchemaInvalid = Expect<
  Equal<_SchemaInvalidResult, DatabaseSchemaSchemaComponent<any>>
>; // Should FAIL

// TEST: Valid intra-schema FK
const _schemaValidFK = schema("public", {
  users: table("users", {
    columns: { id: column("id", Varchar("max")) },
  }),
  posts: table("posts", {
    columns: {
      id: column("id", Varchar("max")),
      user_id: column("user_id", Varchar("max")),
    },
    relationships: [{ columns: ["user_id"], references: ["public.users.id"] }],
  }),
});

type _SchemaValidResult = typeof _schemaValidFK;
type _Test_SchemaValid = Expect<
  Equal<_SchemaValidResult, DatabaseSchemaSchemaComponent<any>>
>; // Should PASS
```

Run `npm run build:ts` - should see errors because schema validation not wired yet.

## Part 2: Implement Validation

Update dumboDatabaseSchema function in dumboSchema.ts to add FK validation for intra-schema references.

1. Import ValidateSchemaRelationships from '../relationships'

2. Find the TWO overload signatures that accept `tables: Tables` parameter

3. Change their return type from:

   ```typescript
   DatabaseSchemaSchemaComponent<Tables>;
   ```

   To:

   ```typescript
   ValidateSchemaRelationships<
     DatabaseSchemaSchemaComponent<Tables>,
     AllColumnReferences<DatabaseSchemaSchemaComponent<Tables>>
   > extends { valid: true }
     ? DatabaseSchemaSchemaComponent<Tables>
     : ValidateSchemaRelationships<
         DatabaseSchemaSchemaComponent<Tables>,
         AllColumnReferences<DatabaseSchemaSchemaComponent<Tables>>
       >
   ```

4. Update the implementation function's return statement to cast the result similarly

Note: Schema-level validation only catches intra-schema FK errors. Cross-schema FKs are validated at database() level (Step 19).

After implementation, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass before proceeding.

```

**Acceptance Criteria:**
- Conditional return type added to schema() overloads
- Intra-schema FK errors caught at schema() call site
- Cross-schema FKs pass schema validation (caught later at database level)
- Database-level validation still primary mechanism
- All quality gates pass

---

### Step 21: Add Real-World Test Cases

**Context:** Test the validation with real schema definitions in dumboSchema.unit.spec.ts.

**Prompt:**
```

Add real-world test cases to dumboSchema.unit.spec.ts demonstrating FK validation.

Add a new describe block 'Foreign Key Validation' with test cases for:

- Valid single FK
- Valid composite FK
- Self-referential FK
- Multiple FKs in one table
- Cross-schema FK

Each test should verify the FK data is stored correctly in the schema component.

After implementation, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass before proceeding.

```

**Acceptance Criteria:**
- All real-world test cases added
- Tests verify FK data is stored correctly
- Tests demonstrate various FK scenarios
- All quality gates pass

---

### Step 22: Add Comprehensive Compile-Time Validation Tests

**Context:** Create type-level tests that verify all FK validation scenarios work at compile time.

**Prompt:**
```

Add comprehensive type-level validation tests to relationshipValidation.type.spec.ts (after the basic type utility tests).

Add these test cases demonstrating compile-time FK validation:

```typescript
// ============================================================================
// COMPILE-TIME FK VALIDATION TESTS
// ============================================================================

import { dumboSchema } from "../dumboSchema/dumboSchema";
const { database, schema, table, column } = dumboSchema;

// TEST 1: Invalid column name - should be error type
const _dbInvalidColumn = database("test", {
  public: schema("public", {
    posts: table("posts", {
      columns: {
        id: column("id", Varchar("max")),
        user_id: column("user_id", Varchar("max")),
      },
      relationships: [
        { columns: ["nonexistent_col"], references: ["public.users.id"] },
      ],
    }),
  }),
});

type _InvalidColType = typeof _dbInvalidColumn;
// When validation fails, type should NOT equal DatabaseSchemaComponent
type _Test_InvalidColumn = Expect<
  Equal<_InvalidColType, DatabaseSchemaComponent<any>>
> extends true
  ? never
  : true; // Should be true (types don't match)

// TEST 2: Invalid reference path - should be error type
const _dbInvalidRef = database("test", {
  public: schema("public", {
    users: table("users", {
      columns: { id: column("id", Varchar("max")) },
    }),
    posts: table("posts", {
      columns: {
        id: column("id", Varchar("max")),
        user_id: column("user_id", Varchar("max")),
      },
      relationships: [
        { columns: ["user_id"], references: ["public.nonexistent.id"] },
      ],
    }),
  }),
});

type _InvalidRefType = typeof _dbInvalidRef;
type _Test_InvalidRef = Expect<
  Equal<_InvalidRefType, DatabaseSchemaComponent<any>>
> extends true
  ? never
  : true; // Should be true

// TEST 3: Length mismatch - should be error type
const _dbLengthMismatch = database("test", {
  public: schema("public", {
    users: table("users", {
      columns: {
        id: column("id", Varchar("max")),
        tenant_id: column("tenant_id", Varchar("max")),
      },
    }),
    posts: table("posts", {
      columns: {
        id: column("id", Varchar("max")),
        user_id: column("user_id", Varchar("max")),
        tenant_id: column("tenant_id", Varchar("max")),
      },
      relationships: [
        { columns: ["user_id", "tenant_id"], references: ["public.users.id"] },
      ],
    }),
  }),
});

type _LengthMismatchType = typeof _dbLengthMismatch;
type _Test_LengthMismatch = Expect<
  Equal<_LengthMismatchType, DatabaseSchemaComponent<any>>
> extends true
  ? never
  : true; // Should be true

// TEST 4: Valid FK - should work perfectly (type matches)
const _dbValidFK = database("test", {
  public: schema("public", {
    users: table("users", {
      columns: { id: column("id", Varchar("max")) },
    }),
    posts: table("posts", {
      columns: {
        id: column("id", Varchar("max")),
        user_id: column("user_id", Varchar("max")),
      },
      relationships: [
        { columns: ["user_id"], references: ["public.users.id"] },
      ],
    }),
  }),
});

type _ValidFKType = typeof _dbValidFK;
type _Test_ValidFK = Expect<Equal<_ValidFKType, DatabaseSchemaComponent<any>>>; // Should PASS (types match)

// TEST 5: Composite FK - should work
const _dbCompositeFK = database("test", {
  public: schema("public", {
    users: table("users", {
      columns: {
        id: column("id", Varchar("max")),
        tenant_id: column("tenant_id", Varchar("max")),
      },
    }),
    posts: table("posts", {
      columns: {
        id: column("id", Varchar("max")),
        user_id: column("user_id", Varchar("max")),
        tenant_id: column("tenant_id", Varchar("max")),
      },
      relationships: [
        {
          columns: ["user_id", "tenant_id"],
          references: ["public.users.id", "public.users.tenant_id"],
        },
      ],
    }),
  }),
});

type _CompositeFKType = typeof _dbCompositeFK;
type _Test_CompositeFK = Expect<
  Equal<_CompositeFKType, DatabaseSchemaComponent<any>>
>; // Should PASS

// TEST 6: Self-referential FK - should work
const _dbSelfRef = database("test", {
  public: schema("public", {
    users: table("users", {
      columns: {
        id: column("id", Varchar("max")),
        manager_id: column("manager_id", Varchar("max")),
      },
      relationships: [
        { columns: ["manager_id"], references: ["public.users.id"] },
      ],
    }),
  }),
});

type _SelfRefType = typeof _dbSelfRef;
type _Test_SelfRef = Expect<Equal<_SelfRefType, DatabaseSchemaComponent<any>>>; // Should PASS

// TEST 7: Cross-schema FK - should work
const _dbCrossSchema = database("test", {
  public: schema("public", {
    users: table("users", {
      columns: { id: column("id", Varchar("max")) },
    }),
  }),
  analytics: schema("analytics", {
    events: table("events", {
      columns: {
        id: column("id", Varchar("max")),
        user_id: column("user_id", Varchar("max")),
      },
      relationships: [
        { columns: ["user_id"], references: ["public.users.id"] },
      ],
    }),
  }),
});

type _CrossSchemaType = typeof _dbCrossSchema;
type _Test_CrossSchema = Expect<
  Equal<_CrossSchemaType, DatabaseSchemaComponent<any>>
>; // Should PASS
```

After adding tests, run quality gates as subagents:

1. npm run fix
2. npm run build:ts
3. npm run test:unit

All must pass. The invalid FK tests (1-3) should show type errors but still compile (they're type-level tests).

Also verify the existing multiSchemaDb example (around line 163 in dumboSchema.unit.spec.ts) still works.

```

**Acceptance Criteria:**
- All 7 type-level test scenarios added
- Invalid FKs (tests 1-3) show they DON'T match DatabaseSchemaComponent type
- Valid FKs (tests 4-7) show they DO match DatabaseSchemaComponent type
- Existing multiSchemaDb example compiles without errors
- All quality gates pass

---

## Summary

This implementation plan provides 22 detailed, step-by-step prompts to implement type-safe foreign key validation in the Dumbo schema system. Each step:

- Follows TDD principles (tests first, implementation second)
- Builds incrementally on previous work
- Has clear acceptance criteria
- Runs quality gates (fix, build, test) as subagents after each step
- Is self-contained and executable
- No orphaned code - everything integrates

The final result will be:
- ✅ Compile-time validation of foreign keys
- ✅ No `as const` required
- ✅ Support for composite and self-referential FKs
- ✅ Clear, actionable error messages
- ✅ Fully tested with type tests and unit tests

Total estimated implementation time: 4-6 hours for an experienced TypeScript developer.
```
