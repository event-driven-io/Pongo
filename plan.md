# SQL Parametrization Refactoring - TDD Implementation Plan

## Overview

This plan implements SQL query parametrization to enable database query plan reuse by converting from string-based SQL to parameterized queries with placeholders.

**Current**: ` SQL`` → String → Database `  
**Target**: ` SQL`` → {sql, params} → Database `

## Implementation Strategy

### Core Principles

- **Test-Driven Development**: Write failing tests first, implement minimal code to pass
- **Incremental Progress**: Small, safe steps that build on each other
- **Database Agnostic**: Support both PostgreSQL and SQLite simultaneously
- **User API Preservation**: `SQL`` template literals remain unchanged from user perspective
- **Breaking Changes Acceptable**: Clean internal refactoring over backward compatibility
- **Simple Parametrization**: Just put placeholders where template gaps are, reuse existing formatValue/formatSQL logic
- **Complete Test Coverage**: All tests (unit, integration, e2e) must pass before step completion
- **Updating TODO**: After each phase you must update todo.md file
- **Committ messages**: They must be focused on WHY before WHAT you did and DON'T include information that you wrote this code or Anthropic

### Key Implementation Guidelines

- **CRITICAL STEP COMPLETION RULE**: NEVER mark any step as completed unless ALL of the following pass with no errors:
  - `npm run fix` tries to fix errors and passes if all was solved and there are no errors left to manually fix
  - `npm run build:ts` passes with no errors
  - `npm run test` passes with no errors (unit, integration, e2e)
  - Use `JSONSerializer.serialize()` instead of `JSON.stringify()` for consistency
- **Parameter Formatting**: Parameters should work just like they did before - parametrized formatters just put placeholders where template array has gaps
- **The only tricky part**: Flatten the SQL structure for nested SQL queries
- **JSONSerializer Usage**: Always use `JSONSerializer.serialize()` instead of `JSON.stringify()` for consistency

## Phase 1: Foundation - Core Parametrizer

### Step 1: Create ParametrizedSQL Interface and Basic Tests

**Goal**: Define the target data structure and establish the testing foundation.

```
Write failing tests for the new ParametrizedSQL interface and basic parametrization logic. Create the minimum interface to make tests compile (but fail at runtime).

Create tests in `src/packages/dumbo/src/core/sql/parametrizedSQL.unit.spec.ts`:

1. Test ParametrizedSQL interface structure
2. Test basic template literal parametrization: SQL`SELECT * FROM users WHERE id = ${123}`
3. Test placeholder generation: values become __P1__, __P2__, etc.
4. Test parameter array extraction: [123] becomes params array
5. Test nested SQL template flattening
6. Test special value types: identifier(), literal(), raw()

Create minimal `src/packages/dumbo/src/core/sql/parametrizedSQL.ts`:
- Define ParametrizedSQL interface with __brand: 'parametrized-sql', sql: string, params: unknown[]
- Export stub functions that throw "Not implemented" errors
- Make tests compile but fail

Run tests to confirm they fail as expected. Only proceed when you have red tests that define the complete behavior.
```

### Step 2: Implement Basic Template Parametrization

**Goal**: Make the simplest parametrization tests pass.

```
Implement the core template processing logic to make basic parametrization tests pass:

In `src/packages/dumbo/src/core/sql/parametrizedSQL.ts`:
1. Implement `parametrizeSQL(sql: SQL): ParametrizedSQL` function for external API
2. Implement `parametrize(strings: TemplateStringsArray, values: unknown[]): ParametrizedSQL` for direct processing
3. Replace interpolated values with __P1__, __P2__ placeholders
4. Build parameter array from extracted values - ALL values become parameters
5. Only exception: nested SQL gets flattened (not turned into parameter)

The parametrizer is simple: everything becomes a parameter except nested SQL which gets flattened. Special value types (identifier, literal, raw) are just passed through as parameters - formatters will handle them later.

Run tests to confirm basic parametrization works. All basic tests should be green.
```

### Step 3: Special Value Types Pass Through

**Goal**: Ensure special value types are passed through as parameters.

```
The parametrizer treats ALL special value types as regular parameters:

1. `literal()` values → become parameters with __P1__ placeholders
2. `identifier()` values → become parameters with __P1__ placeholders
3. `raw()` values → become parameters with __P1__ placeholders

No special handling needed in parametrizer - these will be handled by formatters later:
- Formatters will inline identifiers with proper escaping
- Formatters will handle raw SQL fragments appropriately
- Formatters will process literal values based on database needs

This keeps the parametrizer simple and moves database-specific logic to formatters where it belongs.

Run tests to confirm all values become parameters. All tests should be green.
```

### Step 4: Implement Nested SQL Template Flattening

**Goal**: Support complex nested SQL structures by flattening them into single ParametrizedSQL.

````
Implement template flattening for nested SQL objects:

Test case:
```typescript
const subQuery = SQL`SELECT id FROM roles WHERE name = ${literal('admin')}`;
const main = SQL`SELECT * FROM users WHERE role_id IN (${subQuery})`;
// Should flatten to:
// { sql: "SELECT * FROM users WHERE role_id IN (SELECT id FROM roles WHERE name = __P1__)", params: ['admin'] }
````

Implementation requirements:

1. Recursively process nested SQL objects in value arrays
2. Merge parameter arrays from nested SQL into parent parameter array
3. Replace nested SQL with its flattened sql string
4. Maintain correct parameter numbering across nested levels
5. Handle deeply nested structures (SQL within SQL within SQL)

Add comprehensive tests for various nesting scenarios and edge cases.

Run tests to confirm nested SQL flattening works correctly.

```

## Phase 2: SQL Function Integration

### Step 5: Update SQL Template Function to Return ParametrizedSQL

**Goal**: Change the SQL`` template function to use the new parametrizer internally.

**CRITICAL**: This step must be completed AFTER Step 4 (parametrizer foundation) but BEFORE Step 6 (type system cleanup).

```
✅ COMPLETED: SQL function now internally uses ParametrizedSQL(strings, values) and casts to SQL type.

Implementation approach that worked:
- SQL function signature remains: SQL(strings: TemplateStringsArray, ...values: unknown[]): SQL
- Internally calls ParametrizedSQL(strings, values) then casts to SQL type
- Casting is necessary because SQL branded type doesn't have .sql/.params properties
- This approach preserves API compatibility while changing internal structure

⚠️ CRITICAL SEQUENCING: Update utility functions (mergeSQL, concatSQL, isEmpty) to handle ParametrizedSQL structure BEFORE moving to Step 6. Legacy type removal must come after SQL function is fully functional with ParametrizedSQL.
```

### Step 6: Update Core SQL Exports and Remove Legacy Types

**Goal**: Clean up type system by removing legacy types and exporting ParametrizedSQL.

**CRITICAL SEQUENCING**: This step must be completed BEFORE moving to formatters because tests expect unified type system.

**⚠️ CRITICAL LESSON LEARNED**: Complete legacy type removal is essential - partial removal causes cascading import failures. Remove ALL legacy types and type guards in a single coordinated step.

```
Update the core SQL module exports and remove legacy types systematically:

In `src/packages/dumbo/src/core/sql/index.ts`:
1. Export ParametrizedSQL type and related interfaces: `export * from './parametrizedSQL';`
2. Remove exports for DeferredSQL and RawSQL types completely
3. Update any re-exports to use ParametrizedSQL

In `src/packages/dumbo/src/core/sql/sql.ts`:
1. Remove DeferredSQL and RawSQL type definitions COMPLETELY
2. Remove ALL legacy type guards: isDeferredSQL(), isRawSQL() 
3. Add isParametrizedSQL() type guard (import from parametrizedSQL.ts)
4. Update mergeSQL(), concatSQL(), isEmpty() to handle ONLY ParametrizedSQL objects
5. Add clear documentation: "// Legacy interfaces removed - now using ParametrizedSQL"

**CRITICAL VALIDATION SEQUENCE** (run after each file change):
```bash
npm run build:ts  # Catches import/type errors immediately - FOLLOW ERRORS SYSTEMATICALLY
npm run fix       # Ensures code quality standards
npm run test      # Validates logic correctness
```

**IMPORTANT**: Import failures across multiple test files are expected and helpful - follow each TypeScript error systematically rather than trying to predict all dependencies. Import errors guide you to exactly what needs updating.

**COMMON PATTERNS**: Update test assertions that check for legacy types (e.g., `isDeferredSQL(query) === false` becomes invalid and needs removal).
```

## Phase 3: Formatter Interface Evolution

### Step 7: Update Formatter Implementation for ParametrizedSQL

**Goal**: Update existing formatters to handle ParametrizedSQL objects instead of expecting string-based SQL.

**LEARNING**: Based on test failures, formatters are being called with ParametrizedSQL objects but expect to process DeferredSQL/RawSQL. We need to update them to handle the new structure.

```
Update existing formatter to work with ParametrizedSQL:

In `src/packages/dumbo/src/core/sql/sqlFormatter.ts`:

1. Update formatSQL() function to handle ParametrizedSQL:
   - Detect when SQL object is actually ParametrizedSQL
   - Process placeholder replacement (__P1__ → actual values)
   - Apply existing formatValue logic to parameters
   - Return formatted string as before

2. Keep existing interface: `format(sql: SQL | SQL[]): string`
   - Maintain backward compatibility
   - No new interface methods needed initially
   - Focus on making existing tests pass

3. Handle special value types in parameter processing:
   - identifier() values: format as quoted identifiers
   - literal() values: format as escaped literals
   - raw() values: insert as raw SQL

This approach fixes the immediate test failures while preserving existing API.
- Formatter registration works with extended interface
- Both old and new format methods can coexist temporarily

Update mock formatter for testing to implement new interface.

Run tests to confirm interface extension works without breaking existing functionality.

```

### Step 8: Add Database-Specific Parametrized Query Interface

**Goal**: Add native parameter binding support for database drivers by implementing `format(): {query, params}` interface.

**CRITICAL SEQUENCING**: This step must be completed BEFORE Step 9-10 (execution layer changes) because execution layer depends on this interface.

```
Add parametrized query generation interfaces to both PostgreSQL and SQLite formatters:

**IMPORTANT**: Add the new interface alongside existing methods - don't replace existing string-based interface yet as execution layer still needs it during transition.

**CRITICAL**: Raw values are already inlined during parametrization phase - formatters don't receive raw() values as parameters.

**Implementation Steps:**

1. **Add base mapSQLValue function and rename existing function in core**

   File: `src/packages/dumbo/src/core/sql/sqlFormatter.ts`
   - Rename `formatValue()` → `formatSQLValue()` (for string formatting)
   - Update all calls to `formatValue()` → `formatSQLValue()` within the file
   - Add base `mapSQLValue()` function:
   ```typescript
   export function mapSQLValue(value: unknown, formatter: SQLFormatter): unknown {
     // Handle SQL wrapper types - delegates to formatter-specific methods
     if (isIdentifier(value)) {
       return formatter.formatIdentifier(value.value);
     } else if (isRaw(value)) {
       return value.value;
     } else if (isLiteral(value)) {
       return formatter.formatLiteral(value.value);
     } else if (isSQL(value)) {
       return formatSQL(value as SQL, formatter);
     }

     // Handle complex types that need formatting - delegates to formatter
     if (value instanceof Date) {
       return formatter.formatDate ? formatter.formatDate(value) : formatter.formatLiteral(value);
     } else if (typeof value === 'bigint') {
       return formatter.formatBigInt ? formatter.formatBigInt(value) : formatter.formatLiteral(value);
     } else if (typeof value === 'object' && value !== null) {
       return formatter.formatObject ? formatter.formatObject(value) : formatter.formatLiteral(value);
     }

     // For primitive types, return as-is for parameter binding
     return value === null || value === undefined ? null : value;
   }

   export function formatParametrizedQuery(
     sql: SQL | SQL[],
     placeholderGenerator: (index: number) => string,
   ): ParametrizedQuery {
     // Handle array by merging with newline separator
     const merged = Array.isArray(sql) ? mergeSQL(sql, '\n') : sql;

     if (!isParametrizedSQL(merged)) {
       throw new Error('Expected ParametrizedSQL, got string-based SQL');
     }

     const parametrized = merged as unknown as ParametrizedSQL;
     let query = parametrized.sql;

     // Replace __P1__, __P2__ with database-specific placeholders
     parametrized.params.forEach((_, index) => {
       const placeholder = `__P${index + 1}__`;
       const dbPlaceholder = placeholderGenerator(index);
       query = query.replace(new RegExp(placeholder, 'g'), dbPlaceholder);
     });

     return { query, params: parametrized.params };
   }
   ```

   **CRITICAL ARCHITECTURAL INSIGHT**: This base function handles ALL shared logic (SQL wrapper types, complex type routing) so database-specific formatters only need to handle genuine differences.

2. **Update SQLFormatter interface to require mapSQLValue**

   File: `src/packages/dumbo/src/core/sql/sqlFormatter.ts`
   ```typescript
   export interface SQLFormatter {
     formatIdentifier: (value: unknown) => string;
     formatLiteral: (value: unknown) => string;
     formatString: (value: unknown) => string;
     formatArray?: (array: unknown[], itemFormatter: (item: unknown) => string) => string;
     formatDate?: (value: Date) => string;
     formatObject?: (value: object) => string;
     formatBigInt?: (value: bigint) => string;
     format: (sql: SQL | SQL[]) => ParametrizedQuery;
     formatRaw: (sql: SQL | SQL[]) => string;
     mapSQLValue: (value: unknown) => unknown; // Required method
   }
   ```

3. **Implement mapSQLValue in PostgreSQL formatter**

   File: `src/packages/dumbo/src/storage/postgresql/core/sql/formatter/index.ts`
   ```typescript
   import { mapSQLValue, formatParametrizedQuery } from '../../../../../core/sql/sqlFormatter';

   // In pgFormatter object:
   mapSQLValue: (value: unknown) => {
     // PostgreSQL doesn't need specific type conversions, delegate to base function
     return mapSQLValue(value, pgFormatter);
   },
   
   format: (sql) => {
     // Use shared base logic with PostgreSQL-specific placeholder generator
     return formatParametrizedQuery(sql, (index) => `$${index + 1}`);
   },
   ```

   **DELEGATION PATTERN**: PostgreSQL formatter only provides database-specific placeholder generation, all complex logic handled by base functions.

4. **Implement mapSQLValue in SQLite formatter**

   File: `src/packages/dumbo/src/storage/sqlite/core/sql/formatter/index.ts`
   ```typescript
   import { mapSQLValue, formatParametrizedQuery } from '../../../../../core/sql/sqlFormatter';

   // In sqliteFormatter object:
   mapSQLValue: (value: unknown) => {
     // Handle SQLite-specific type conversions FIRST, then delegate
     if (typeof value === 'boolean') return value ? 1 : 0; // SQLite booleans as 1/0
     if (value instanceof Date) return value.toISOString(); // SQLite dates as ISO strings
     if (typeof value === 'bigint') return value.toString(); // SQLite BigInt as string

     // Delegate to base function for SQL wrappers and complex types
     return mapSQLValue(value, sqliteFormatter);
   },
   
   format: (sql) => {
     // Use shared base logic with SQLite-specific placeholder generator
     const result = formatParametrizedQuery(sql, () => '?');
     
     // Apply SQLite-specific parameter conversions to final params
     const formattedParams = result.params.map((param) => {
       if (param === null || param === undefined) return param;
       if (typeof param === 'string' || typeof param === 'number') return param;
       if (typeof param === 'boolean') return param ? 1 : 0;
       if (param instanceof Date) return param.toISOString();
       if (typeof param === 'bigint') return param.toString();
       if (Array.isArray(param)) return JSONSerializer.serialize(param);
       if (typeof param === 'object') return JSONSerializer.serialize(param);
       return param;
     });
     
     return { query: result.query, params: formattedParams };
   },
   ```

   **KEY PATTERN**: SQLite handles its genuine type differences (boolean→1/0, date→ISO, bigint→string), then delegates to base function. Both mapSQLValue AND format methods use this pattern.

5. **Update formatter format methods to use mapSQLValue**

   Files: Both PostgreSQL and SQLite formatter index.ts
   ```typescript
   format: (sql) => {
     // ... existing placeholder replacement logic ...

     // Map parameter values for native binding using formatter's mapSQLValue
     const mappedParams = parametrized.params.map(param =>
       pgFormatter.mapSQLValue(param) // Each formatter's own implementation
     );

     return { query, params: mappedParams };
   }
   ```

6. **Update existing references to formatValue**

   File: `src/packages/dumbo/src/core/sql/sqlFormatter.ts`
   - Update `processSQL` function to call `formatSQLValue` instead of `formatValue`

7. **Write comprehensive tests for both formatters**

   Files:
   - `src/packages/dumbo/src/storage/postgresql/core/sql/formatter/parametrizedFormatter.unit.spec.ts`
   - `src/packages/dumbo/src/storage/sqlite/core/sql/formatter/parametrizedFormatter.unit.spec.ts`

   **CRITICAL TESTING INSIGHT**: Tests define behavioral contracts - implementation should match test expectations, not vice versa. Never change existing tests unless explicitly confirmed.

   Test coverage:
   - **Identifier Quoting Rules**: Cover both valid unquoted (`table_name`) and cases requiring quotes (`TableName`, reserved words)
   - SQL wrapper types: `identifier()`, `raw()`, `literal()`, nested `SQL``
   - Basic types: string, number, null/undefined
   - PostgreSQL-specific: Date objects, booleans, BigInt, arrays, objects (should remain as native objects)
   - SQLite-specific: boolean → 1/0, Date → ISO string, BigInt → string, arrays/objects → JSON strings
   - Array of SQL statements with proper parameter numbering
   - Error handling for non-ParametrizedSQL input

   **IDENTIFIER TESTING PATTERN**:
   ```typescript
   void it('should handle SQL wrapper types', () => {
     // Valid unquoted identifier (lowercase, valid chars)
     const validIdent = sqliteFormatter.mapSQLValue(identifier('table_name'));
     assert.strictEqual(validIdent, 'table_name');

     // Invalid identifier requiring quotes (mixed case)
     const quotedIdent = sqliteFormatter.mapSQLValue(identifier('TableName'));
     assert.strictEqual(quotedIdent, '"TableName"');
   });
   ```

**Expected Outcomes:**
- Clean base function handles SQL wrapper types using formatter-specific methods
- Each formatter checks DB-specific types first, then falls back to base function
- PostgreSQL: `{ query: "SELECT * FROM users WHERE id = $1", params: [123] }`
- SQLite: `{ query: "SELECT * FROM users WHERE id = ?", params: [123] }`
- Native parameter binding eliminates SQL injection risks
- Query plan reuse through consistent parameterization
- `formatRaw()` continues using `formatSQLValue()` for debugging

Write comprehensive tests for both formatters following Pongo testing patterns:

**PostgreSQL Formatter Tests** (`src/packages/dumbo/src/storage/postgresql/core/sql/formatter/parametrized.unit.spec.ts`):

```typescript
import assert from "assert";
import { describe, it } from "node:test";
import { pgFormatter } from "../index";
import { SQL, literal } from "@event-driven-io/dumbo";

void describe("PostgreSQL Parametrized Formatter", () => {
  void describe("placeholder conversion", () => {
    void it("should convert __P1__ to $1 format", () => {
      // Test __P1__, __P2__ → $1, $2 conversion
    });
  });

  void describe("parameter type formatting", () => {
    void it("should format BigInt parameters correctly", () => {
      // Test PostgreSQL-specific type handling
    });

    void it("should format Date parameters with timezone", () => {
      // Test PostgreSQL date formatting
    });

    void it("should format JSON parameters with ::jsonb cast", () => {
      // Test PostgreSQL JSON handling
    });
  });

  void describe("formatRaw debugging", () => {
    void it("should produce human-readable debug output", () => {
      // Test formatRaw() method
    });
  });
});
```

**SQLite Formatter Tests** (`src/packages/dumbo/src/storage/sqlite/core/sql/formatter/parametrized.unit.spec.ts`):

```typescript
void describe("SQLite Parametrized Formatter", () => {
  void describe("placeholder conversion", () => {
    void it("should convert __P1__ to ? format", () => {
      // Test __P1__, __P2__ → ?, ? conversion with correct order
    });
  });

  void describe("parameter type formatting", () => {
    void it("should format boolean parameters as 1/0", () => {
      // Test SQLite boolean conversion
    });

    void it("should handle BigInt range checking", () => {
      // Test SQLite INTEGER limits
    });
  });
});
```

**Multi-Database Integration Tests**:

```typescript
const databases = [
  {
    name: "PostgreSQL",
    connector: "PostgreSQL:pg" as const,
    formatter: pgFormatter,
    setupPool: () => nodePostgresPool({ connectionString }),
  },
  {
    name: "SQLite",
    connector: "SQLite:sqlite3" as const,
    formatter: sqliteFormatter,
    setupPool: () => sqlitePool({ fileName: ":memory:" }),
  },
];

databases.forEach(({ name, formatter, setupPool }) => {
  void describe(`${name} Parametrized Execution`, () => {
    // Test both databases with same test logic
  });
});
```

Run tests: `cd src && npm run test:unit && npm run test:int`

```

## Phase 4: Execution Layer Integration

### Step 9: Refactor PostgreSQL Execution to Use Parametrized Queries

**Goal**: Update PostgreSQL execution to use native parameter binding instead of string interpolation.

```

Refactor PostgreSQL execution to leverage parametrized queries:

In `src/packages/dumbo/src/storage/postgresql/pg/execute/execute.ts` (around line 94):

Current code:

```typescript
const result = await client.query<Result>(pgFormatter.format(sqls[i]!));
```

New implementation:

1. Change to use new formatter interface:

   ```typescript
   const { query, params } = pgFormatter.format(sqls[i]!);
   const result = await client.query<Result>(query, params);
   ```

2. Update batch() function signature:

   - Keep accepting SQL | SQL[] input
   - Process ParametrizedSQL objects internally
   - Handle both single queries and batch operations

3. Add debug logging:

   ```typescript
   tracer.info("db:sql:query", {
     sql: query,
     params,
     debugSQL: pgFormatter.formatRaw(sqls[i]!),
   });
   ```

4. Maintain all existing error handling and transaction logic
5. Ensure batch operations work with new parameter binding

Write integration tests:

- Test single query execution with parameters
- Test batch query execution
- Test parameter binding with real PostgreSQL database
- Test error handling with malformed parameters
- Test transaction behavior is unchanged

Run PostgreSQL-specific integration tests to verify execution works correctly.

```

### Step 10: Refactor SQLite Execution to Use Parametrized Queries

**Goal**: Update SQLite execution to use native parameter binding.

```

Apply same refactoring pattern to SQLite execution:

In `src/packages/dumbo/src/storage/sqlite/core/execute/execute.ts` (around line 73):

1. Update to use parametrized query execution:

   ```typescript
   const { query, params } = sqliteFormatter.format(sqls[i]!);
   const result = await client.query<Result>(query, params);
   ```

2. Handle SQLite-specific parameter binding format (positional ? placeholders)
3. Maintain SQLite transaction and error handling behavior
4. Add same debug logging pattern as PostgreSQL

Write integration tests:

- Test SQLite parameter binding with real database
- Test compatibility with better-sqlite3 parameter format
- Test batch operations work correctly
- Test error scenarios (too many/few parameters)
- Verify transaction behavior unchanged

Run SQLite-specific integration tests to verify execution works correctly.

```

## Phase 5: Testing and Validation

### Step 11: Update Existing Test Suite for New Execution Signatures

**Goal**: Ensure all existing tests work with the new parametrized execution following Pongo test conventions.

```

Update the existing test suite to work with new execution patterns:

1. **Review Test Files by Category**:

   - **Unit Tests** (`*.unit.spec.ts`): Should not require database connections
   - **Integration Tests** (`*.int.spec.ts`): Use TestContainers with proper setup/teardown
   - **E2E Tests** (`*.e2e.spec.ts`): Validate complete workflows

2. **Update Connection Management in Tests**:

   ```typescript
   // ✅ Correct: Pongo connection pattern
   void describe("Database Tests", () => {
     let pool: ConnectionPool;
     let connection: Connection;

     beforeEach(async () => {
       pool = sqlitePool({
         fileName: ":memory:",
         connector: "SQLite:sqlite3",
       });
       connection = await pool.connection();
     });

     afterEach(async () => {
       await connection.close();
       await pool.close();
     });
   });
   ```

3. **Update SQL Execution Patterns**:

   ```typescript
   // ✅ Update from string-based to template literals
   // Old: connection.execute.query("SELECT * FROM users")
   // New: connection.execute.query(SQL`SELECT * FROM users`)

   // ✅ Use proper parameter binding
   const result = await connection.execute.query(
     SQL`SELECT * FROM users WHERE id = ${literal(userId)}`
   );
   ```

4. **Test Categories to Update**:

   - `packages/dumbo/src/core/` - Core execution logic tests
   - `packages/dumbo/src/storage/postgresql/` - PostgreSQL-specific tests
   - `packages/dumbo/src/storage/sqlite/` - SQLite-specific tests
   - `packages/pongo/src/` - MongoDB compatibility tests

5. **Multi-Database Test Pattern**:

   ```typescript
   const databases = [
     { name: 'PostgreSQL', setupPool: () => nodePostgresPool({...}) },
     { name: 'SQLite', setupPool: () => sqlitePool({...}) }
   ];

   databases.forEach(({ name, setupPool }) => {
     void describe(`${name} Tests`, () => {
       // Same test logic for both databases
     });
   });
   ```

Run test suite: `cd src && npm run test:unit && npm run test:int && npm run test:e2e`
Ensure no regressions with: `cd src && npm run build && npm run lint`

```

### Step 12: Add Parametrization-Specific Tests

**Goal**: Comprehensive test coverage for the new parametrization features.

```

Add specific test coverage for parametrization functionality:

1. Template flattening tests:

   - Complex nested SQL scenarios
   - Mixed value types (literal, identifier, raw) in nested contexts
   - Edge cases: empty SQL, deeply nested structures
   - Parameter ordering in complex flattened queries

2. Database-specific parametrization tests:

   - PostgreSQL: Verify $1, $2, $3 placeholder generation
   - SQLite: Verify positional ? placeholder generation
   - Parameter type handling (BigInt, Date, JSON, etc.)
   - Array and object parameter serialization

3. Performance comparison tests:

   - Benchmark parametrized vs string-based query execution
   - Measure query plan reuse (if possible to test)
   - Memory usage comparison for parameter vs string formatting

4. Security and edge case tests:

   - SQL injection prevention with parameter binding
   - Malformed parameter scenarios
   - Parameter count mismatch handling
   - Very large parameter arrays

5. Debugging and observability tests:
   - formatRaw() produces human-readable output
   - Debug logging includes both query and params
   - Parameter values are properly masked/sanitized in logs

Run parametrization-specific tests to ensure robust implementation.

```

### Step 13: Query Plan Reuse Validation and Performance Benchmarking

**Goal**: Verify that the parametrization achieves the intended performance improvements.

```

Validate that query plan reuse is actually working and measure performance improvements:

1. Query Plan Reuse Testing:

   - PostgreSQL: Use EXPLAIN to verify query plans are reused with different parameters
   - SQLite: Check that prepared statements are being cached
   - Test scenarios: same query structure with different parameter values
   - Verify plan cache hit rates where possible

2. Performance Benchmarking:

   - Create benchmark suite comparing old vs new approach
   - Test scenarios: bulk inserts, complex queries, repeated queries
   - Measure: query execution time, memory usage, CPU usage
   - Test with both PostgreSQL and SQLite
   - Use realistic data volumes for meaningful results

3. Database-Specific Validation:

   - PostgreSQL: Monitor pg_stat_statements for plan reuse
   - SQLite: Verify prepared statement cache behavior
   - Test with different parameter types and query complexity
   - Validate performance improvement claims from spec

4. Create performance regression tests:
   - Establish baseline performance metrics
   - Set up CI to catch performance regressions
   - Document expected performance improvements

Document performance results and query plan reuse evidence.

Run performance validation to confirm parametrization achieves intended benefits.

```

## Implementation Timeline and Dependencies

### Implementation Order

1. **Phase 1 (Foundation)**: Steps 1-4 - Core parametrizer implementation
2. **Phase 2 (Integration)**: Steps 5-6 - SQL function updates
3. **Phase 3 (Formatters)**: Steps 7-8 - Formatter interface evolution
4. **Phase 4 (Execution)**: Steps 9-10 - Database execution refactoring
5. **Phase 5 (Validation)**: Steps 11-13 - Testing and performance validation

### Step Dependencies

- Step 2 depends on Step 1 (interface and tests)
- Step 3 depends on Step 2 (basic parametrization working)
- Step 4 depends on Step 3 (special value handling)
- Step 5 depends on Step 4 (complete parametrizer)
- Steps 7-8 can be done in parallel (different formatters)
- Steps 9-10 depend on Steps 7-8 (formatter interfaces ready)
- Step 9 and 10 can be done in parallel (different databases)
- Steps 11-13 depend on Steps 9-10 (execution refactored)

### Risk Mitigation

- **Breaking Changes**: Each step preserves user-facing API compatibility
- **Database Differences**: Test both PostgreSQL and SQLite at each step
- **Performance Regression**: Keep old implementation until validation complete
- **Test Coverage**: Write tests first, implement minimal code to pass
- **Integration Issues**: Update execution layers simultaneously to avoid partial states

## Success Criteria

- [ ] All existing tests pass with new parametrized implementation
- [ ] `SQL`` template literals work identically from user perspective
- [ ] Both PostgreSQL and SQLite use native parameter binding
- [ ] Query plan reuse demonstrated with database tooling
- [ ] Performance improvements measured and documented
- [ ] No SQL injection vulnerabilities introduced
- [ ] Debug logging provides clear query visibility
- [ ] Full test coverage for parametrization features

## TDD Prompt Sequence

Each step above represents a complete TDD cycle:
1. **Red**: Write failing tests that define desired behavior
2. **Green**: Write minimal code to make tests pass
3. **Refactor**: Improve code quality while keeping tests green

The detailed prompt for each step is provided in the implementation sections above, ready for iterative development.
```
