# Plan: Schema-Level Relationship Validation

## Goal

Add type-level validation at `dumboDatabaseSchema` level that validates relationships within the schema, while silently passing cross-schema references (handled at database level).

## Validation Hierarchy

1. **Table level**: Self-references within same table
2. **Schema level**: References within the same schema (current task)
3. **Database level**: Cross-schema references (already implemented)

## Build Command

After each step: `cd src && npm run build:ts && npm run fix`

YOU MUST NOT RUN TypeScript build in any other way

YOU MUST NOT commit code using gen ai slop prefixes or copyright, you must not commit this plan.

---

## Reference Implementation: Database-Level Validation

### Location: `src/packages/dumbo/src/core/schema/components/relationships/relationshipValidation.ts`

```typescript
// Current database-level validation type (lines 507-513):
export type ValidateDatabaseSchemasWithMessages<
  Schemas extends DatabaseSchemas,
> =
  ValidateDatabaseSchemas<Schemas> extends infer Result extends
    AnyTypeValidationError
    ? StructureValidationErrors<Result>
    : Schemas;

// ValidateDatabaseSchemas validates ALL schemas (lines 488-505):
export type ValidateDatabaseSchemas<Schemas extends DatabaseSchemas> =
  MapRecordCollectErrors<
    Schemas,
    {
      [SchemaName in keyof Schemas]: ValidateDatabaseSchema<
        Schemas[SchemaName],
        Schemas  // <-- Full database schemas passed for cross-schema validation
      >;
    }
  > extends infer Results
    ? AnyTypeValidationFailed<Results> extends true
      ? TypeValidationError<
          UnwrapTypeValidationErrors<
            Results extends readonly AnyTypeValidationError[] ? Results : never
          >
        >
      : TypeValidationSuccess
    : TypeValidationSuccess;

// ValidateColumnReference checks if reference exists (lines 150-181):
// Returns error if schema/table/column doesn't exist in Schemas
export type ValidateColumnReference<
  ColReference extends SchemaColumnName,
  Schemas extends DatabaseSchemas,
> =
  ColReference extends SchemaColumnName<
    infer SchemaName,
    infer TableName,
    infer ColumnName
  >
    ? SchemaName extends keyof Schemas
      ? TableName extends keyof Schemas[SchemaName]['tables']
        ? /* check column exists */
        : ColumnReferenceExistanceError<'missing_table', ...>
      : ColumnReferenceExistanceError<'missing_schema', ...>  // <-- This is where we need to change for schema-level
    : never;
```

### Location: `src/packages/dumbo/src/core/schema/dumboSchema/dumboSchema.ts`

```typescript
// Current database function with validation (lines 141-151):
function dumboDatabase<Schemas extends DatabaseSchemas = DatabaseSchemas>(
  databaseName: string,
  schemas: ValidateDatabaseSchemasWithMessages<Schemas>, // <-- Validation as constraint
  options?: SchemaComponentOptions
): ValidatedDatabaseSchemaComponent<Schemas> {
  return databaseSchemaComponent({
    databaseName,
    schemas: schemas as Schemas,
    ...(options ?? {}),
  }) as ValidatedDatabaseSchemaComponent<Schemas>;
}

// ValidatedDatabaseSchemaComponent type (lines 129-139):
type ValidatedDatabaseSchemaComponent<
  Schemas extends DatabaseSchemas = DatabaseSchemas
> = ValidateDatabaseSchemasWithMessages<Schemas> extends { valid: true }
  ? DatabaseSchemaComponent<Schemas>
  : ValidateDatabaseSchemasWithMessages<Schemas> extends {
      valid: false;
      error: infer E;
    }
  ? { valid: false; error: E }
  : DatabaseSchemaComponent<Schemas>;

// Current schema function with overloads (lines 94-127):
function dumboDatabaseSchema<
  const Tables extends DatabaseSchemaTables = DatabaseSchemaTables
>(
  tables: Tables
): DatabaseSchemaSchemaComponent<Tables, typeof DEFAULT_DATABASE_SCHEMA_NAME>;
function dumboDatabaseSchema<
  const Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
  const SchemaName extends string = string
>(
  schemaName: SchemaName,
  tables: Tables,
  options?: SchemaComponentOptions
): DatabaseSchemaSchemaComponent<Tables, SchemaName>;
// ... implementation
```

### Error Structure (from `structureRelationshipErrors.ts`):

```typescript
// Errors are structured as nested objects:
TypeValidationError<{
  schemaName: {
    tableName: {
      relationships: {
        relationshipName: ["error message 1", "error message 2"];
      };
    };
  };
}>;
```

### Test Pattern (from `validateDatabaseSchemasWithMessages.type.spec.ts`):

```typescript
void it("returns schemas unchanged when validation succeeds", () => {
  type ValidSchemas = { public: typeof _publicSchema };
  type Result = ValidateDatabaseSchemasWithMessages<ValidSchemas>;
  type _Then = Expect<Equals<Result, ValidSchemas>>;
});

void it("returns formatted error message for missing_schema", () => {
  // ... setup with invalid reference
  type Result = ValidateDatabaseSchemasWithMessages<TestSchemas>;
  type Expected = TypeValidationError<{
    public: {
      posts: {
        relationships: {
          user: [
            "relationship public.posts.user: schema 'nonexistent' not found"
          ];
        };
      };
    };
  }>;
  type _Then = Expect<Equals<Result, Expected>>;
});
```

---

## Prompts

### Prompt 1: Create schema-level validation types

- [ ] Completed

**File:** `src/packages/dumbo/src/core/schema/components/relationships/relationshipValidation.ts`

Create new types for schema-level validation:

1. `ValidateSchemaColumnReference` - Like `ValidateColumnReference` but:

   - If schema name matches current schema → validate normally
   - If schema name doesn't match → return `TypeValidationSuccess` (external, skip)

2. `ValidateSchemaReference` - Uses `ValidateSchemaColumnReference` instead of `ValidateColumnReference`

3. `CollectSchemaReferencesErrors` - Uses `ValidateSchemaReference`

4. `ValidateSchemaRelationship` - Uses `CollectSchemaReferencesErrors`

5. `CollectSchemaRelationshipErrors` - Uses `ValidateSchemaRelationship`

6. `ValidateSchemaTableRelationships` - Uses `CollectSchemaRelationshipErrors`

7. `ValidateSchemaTables` for schema-only validation

8. `ValidateSchemaWithMessages` - Entry point, similar to `ValidateDatabaseSchemasWithMessages`:
   ```typescript
   export type ValidateSchemaWithMessages<
     Tables extends DatabaseSchemaTables,
     SchemaName extends string
   > = ValidateSchemaTables<
     Tables,
     SchemaName /* single schema context */
   > extends infer Result extends AnyTypeValidationError
     ? StructureSchemaValidationErrors<Result> // May need schema-specific structuring
     : Tables;
   ```

Export from `relationships/index.ts`.

---

### Prompt 2: Refactor `dumboDatabaseSchema` function

- [ ] Completed

**File:** `src/packages/dumbo/src/core/schema/dumboSchema/dumboSchema.ts`

1. Remove overloads from `dumboDatabaseSchema`, use single signature:

   ```typescript
   function dumboDatabaseSchema<
     const Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
     const SchemaName extends string = string
   >(
     schemaName: SchemaName,
     tables: ValidateSchemaWithMessages<Tables, SchemaName>,
     options?: SchemaComponentOptions
   ): ValidatedSchemaComponent<Tables, SchemaName>;
   ```

2. Add `ValidatedSchemaComponent` type:
   ```typescript
   type ValidatedSchemaComponent<
     Tables extends DatabaseSchemaTables,
     SchemaName extends string
   > = ValidateSchemaWithMessages<Tables, SchemaName> extends { valid: true }
     ? DatabaseSchemaSchemaComponent<Tables, SchemaName>
     : ValidateSchemaWithMessages<Tables, SchemaName> extends {
         valid: false;
         error: infer E;
       }
     ? { valid: false; error: E }
     : DatabaseSchemaSchemaComponent<Tables, SchemaName>;
   ```

---

### Prompt 3: Add type spec tests for schema-level validation

- [ ] Completed

**File:** `src/packages/dumbo/src/core/schema/components/relationships/validateSchemaWithMessages.type.spec.ts`

Test cases (follow pattern from `validateDatabaseSchemasWithMessages.type.spec.ts`):

1. Valid intra-schema relationship passes - returns tables unchanged
2. Invalid intra-schema relationship (missing table) fails with error
3. Invalid intra-schema relationship (missing column) fails with error
4. Invalid intra-schema relationship (type mismatch) fails with error
5. Cross-schema reference silently passes (returns tables unchanged)
6. Self-referential table relationship validates correctly
7. Empty tables object passes

---

### Prompt 4: Update unit tests

- [ ] Completed

**File:** `src/packages/dumbo/src/core/schema/dumboSchema/dumboSchema.unit.spec.ts`

Update existing tests and add new ones:

1. Update existing schema creation tests to use new signature (schemaName required)
2. Add `@ts-expect-error` tests for invalid intra-schema relationships
3. Add passing test for cross-schema references (no error at schema level)
4. Verify self-referential relationships work
