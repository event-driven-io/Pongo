# SQL Parametrization Refactoring - TDD Implementation Plan

## Overview

This plan implements SQL query parametrization to enable database query plan reuse by converting from string-based SQL to parameterized queries with placeholders.

**Current**: `SQL`` → String → Database`  
**Target**: `SQL`` → {sql, params} → Database`

## Implementation Strategy

### Core Principles
- **Test-Driven Development**: Write failing tests first, implement minimal code to pass
- **Incremental Progress**: Small, safe steps that build on each other  
- **Database Agnostic**: Support both PostgreSQL and SQLite simultaneously
- **User API Preservation**: `SQL`` template literals remain unchanged from user perspective
- **Breaking Changes Acceptable**: Clean internal refactoring over backward compatibility
- **Simple Parametrization**: Just put placeholders where template gaps are, reuse existing formatValue/formatSQL logic
- **Complete Test Coverage**: All tests (unit, integration, e2e) must pass before step completion
- **JSONSerializer Usage**: Always use `JSONSerializer.serialize()` instead of `JSON.stringify()` for consistency

### Key Implementation Guidelines
- **CRITICAL STEP COMPLETION RULE**: NEVER mark any step as completed unless ALL of the following pass with no errors:
  - `npm run lint` passes with no errors
  - `npm run build:ts` passes with no errors  
  - `npm run test` passes with no errors (unit, integration, e2e)
  - Use `JSONSerializer.serialize()` instead of `JSON.stringify()` for consistency
- **Parameter Formatting**: Parameters should work just like they did before - parametrized formatters just put placeholders where template array has gaps
- **The only tricky part**: Flatten the SQL structure for nested SQL queries

## Phase 1: Foundation - Core Parametrizer

### Step 1: Create ParametrizedSQL Interface and Basic Tests

**Goal**: Define the target data structure and establish the testing foundation.

```
Write failing tests for the new ParametrizedSQL interface and basic parametrization logic. Create the minimum interface to make tests compile (but fail at runtime).

Create tests in `src/packages/dumbo/src/core/sql/sqlParametrizer.unit.spec.ts`:

1. Test ParametrizedSQL interface structure
2. Test basic template literal parametrization: SQL`SELECT * FROM users WHERE id = ${123}` 
3. Test placeholder generation: values become __P1__, __P2__, etc.
4. Test parameter array extraction: [123] becomes params array
5. Test nested SQL template flattening
6. Test special value types: identifier(), literal(), raw()

Create minimal `src/packages/dumbo/src/core/sql/sqlParametrizer.ts`:
- Define ParametrizedSQL interface with __brand: 'parametrized-sql', sql: string, params: unknown[]
- Export stub functions that throw "Not implemented" errors
- Make tests compile but fail

Run tests to confirm they fail as expected. Only proceed when you have red tests that define the complete behavior.
```

### Step 2: Implement Basic Template Parametrization

**Goal**: Make the simplest parametrization tests pass.

```
Implement the core template processing logic to make basic parametrization tests pass:

In `src/packages/dumbo/src/core/sql/sqlParametrizer.ts`:
1. Implement `parametrizeSQL(sql: SQL): ParametrizedSQL` function
2. Process SQL template strings and values arrays directly
3. Replace existing DeferredSQL/RawSQL logic completely
4. Replace interpolated values with __P1__, __P2__ placeholders
5. Build parameter array from extracted values
6. Handle raw() values by inlining them (no parametrization)

Focus only on making the basic tests pass. Don't worry about nested SQL or complex value types yet.

Run tests to confirm basic parametrization works. All basic tests should be green.
```

### Step 3: Implement Special Value Type Handling

**Goal**: Handle identifier(), literal(), and raw() wrapper types correctly.

```
Extend the parametrizer to handle special SQL value types according to the test cases:

1. `literal()` values → become parameters with __P1__ placeholders
2. `identifier()` values → inline in query (no parametrization, as identifiers can't be parameters)
3. `raw()` values → inline in query (no parametrization, raw SQL fragments)

Update parametrizer logic:
- Add type checking with isIdentifier(), isLiteral(), isRaw() guards
- Add value processing for each type
- Ensure parameter numbering stays sequential even when some values are inlined

Run tests to confirm special value handling works. All special value type tests should be green.
```

### Step 4: Implement Nested SQL Template Flattening

**Goal**: Support complex nested SQL structures by flattening them into single ParametrizedSQL.

```
Implement template flattening for nested SQL objects:

Test case: 
```typescript
const subQuery = SQL`SELECT id FROM roles WHERE name = ${literal('admin')}`;
const main = SQL`SELECT * FROM users WHERE role_id IN (${subQuery})`;
// Should flatten to: 
// { sql: "SELECT * FROM users WHERE role_id IN (SELECT id FROM roles WHERE name = __P1__)", params: ['admin'] }
```

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

```
Modify the core SQL template function to use parametrization while preserving the existing API:

In `src/packages/dumbo/src/core/sql/sql.ts`:

1. Update SQL() function implementation:
   - Keep same signature: SQL(strings: TemplateStringsArray, ...values: unknown[]): SQL
   - Internally call parametrizeSQL() to create ParametrizedSQL
   - Return ParametrizedSQL directly (remove DeferredSQL/RawSQL completely)
   
2. Update utility functions to work with new internal format:
   - mergeSQL() and concatSQL() need to handle ParametrizedSQL objects
   - SQL.isEmpty() should work with new structure
   - Remove legacy type guards (isDeferredSQL, isRawSQL)
   - Add SQL.isParametrized() type guard

3. Write tests that verify:
   - SQL`` templates still work identically from user perspective
   - Internal structure has changed to ParametrizedSQL format
   - Utility functions still work correctly
   - No breaking changes to existing user code patterns

4. Update type system:
   - Consider if SQL branded type needs modification
   - Ensure type compatibility with existing code
   - Add ParametrizedSQL to core exports

Run tests to confirm SQL template function integration works correctly.
```

### Step 6: Update Core SQL Exports and Remove Legacy Types

**Goal**: Clean up type system by removing legacy types and exporting ParametrizedSQL.

```
Update the core SQL module exports and remove legacy types:

In `src/packages/dumbo/src/core/sql/index.ts`:
1. Export ParametrizedSQL type and related interfaces
2. Export parametrizer functions if needed by external code
3. Remove exports for DeferredSQL and RawSQL types
4. Update any re-exports to use ParametrizedSQL

In `src/packages/dumbo/src/core/sql/sql.ts`:
1. Add type guard: isParametrizedSQL()
2. Remove legacy type guards: isDeferredSQL(), isRawSQL()
3. Remove DeferredSQL and RawSQL type definitions completely

Add tests to verify:
- ParametrizedSQL type and functions are properly exported
- Legacy DeferredSQL/RawSQL types are no longer available
- Type guards work correctly with ParametrizedSQL
- External modules can import ParametrizedSQL without issues

Run full test suite for core SQL module to ensure no regressions.
```

## Phase 3: Formatter Interface Evolution

### Step 7: Extend SQLFormatter Interface for Parametrized Queries

**Goal**: Add parametrized query support to the formatter interface without breaking existing functionality.

```
Extend the SQLFormatter interface to support both old string-based and new parametrized formatting:

In `src/packages/dumbo/src/core/sql/sqlFormatter.ts`:

1. Add new methods to SQLFormatter interface:
   - `format(sql: SQL): { query: string; params: unknown[] }` - Returns parametrized query
   - `formatRaw(sql: SQL): string` - Returns string with inlined values (for debugging)

2. Update existing format method for backward compatibility:
   - Keep existing `format(sql: SQL | SQL[]): string` for transition period
   - Consider deprecation strategy

3. Update formatter registration system to handle both interfaces:
   - Ensure new formatters implement both old and new methods
   - Provide adapter/wrapper for backward compatibility during migration

Write tests that verify:
- New interface methods are properly defined
- Formatter registration works with extended interface
- Both old and new format methods can coexist temporarily

Update mock formatter for testing to implement new interface.

Run tests to confirm interface extension works without breaking existing functionality.
```

### Step 8: Update Database-Specific Formatters for Parametrization

**Goal**: Implement parametrized query generation in PostgreSQL and SQLite formatters.

```
Update both database formatters to implement the new parametrized interface:

PostgreSQL Formatter (`src/packages/dumbo/src/storage/postgresql/core/sql/formatter/`):
1. Implement `format(sql: SQL): { query: string; params: unknown[] }`
   - Process ParametrizedSQL to convert __P1__, __P2__ to PostgreSQL $1, $2 format
   - Apply existing type formatting to parameter values (BigInt, Date, JSON, etc.)
   - Return {query: "SELECT * FROM users WHERE id = $1", params: [123]}

2. Implement `formatRaw(sql: SQL): string`
   - Use existing string-based formatting for debugging
   - Inline all parameters as escaped literals

SQLite Formatter (`src/packages/dumbo/src/storage/sqlite/core/sql/formatter/`):
1. Implement same interface but convert __P1__, __P2__ to SQLite ? format
2. Apply SQLite-specific type formatting (boolean as 1/0, etc.)
3. Handle parameter array in correct positional order

Write comprehensive tests for both formatters following Pongo testing patterns:

**PostgreSQL Formatter Tests** (`src/packages/dumbo/src/storage/postgresql/core/sql/formatter/parametrized.unit.spec.ts`):
```typescript
import assert from 'assert';
import { describe, it } from 'node:test';
import { pgFormatter } from '../index';
import { SQL, literal } from '@event-driven-io/dumbo';

void describe('PostgreSQL Parametrized Formatter', () => {
  void describe('placeholder conversion', () => {
    void it('should convert __P1__ to $1 format', () => {
      // Test __P1__, __P2__ → $1, $2 conversion
    });
  });
  
  void describe('parameter type formatting', () => {
    void it('should format BigInt parameters correctly', () => {
      // Test PostgreSQL-specific type handling
    });
    
    void it('should format Date parameters with timezone', () => {
      // Test PostgreSQL date formatting
    });
    
    void it('should format JSON parameters with ::jsonb cast', () => {
      // Test PostgreSQL JSON handling
    });
  });
  
  void describe('formatRaw debugging', () => {
    void it('should produce human-readable debug output', () => {
      // Test formatRaw() method
    });
  });
});
```

**SQLite Formatter Tests** (`src/packages/dumbo/src/storage/sqlite/core/sql/formatter/parametrized.unit.spec.ts`):
```typescript
void describe('SQLite Parametrized Formatter', () => {
  void describe('placeholder conversion', () => {
    void it('should convert __P1__ to ? format', () => {
      // Test __P1__, __P2__ → ?, ? conversion with correct order
    });
  });
  
  void describe('parameter type formatting', () => {
    void it('should format boolean parameters as 1/0', () => {
      // Test SQLite boolean conversion
    });
    
    void it('should handle BigInt range checking', () => {
      // Test SQLite INTEGER limits
    });
  });
});
```

**Multi-Database Integration Tests**:
```typescript
const databases = [
  {
    name: 'PostgreSQL',
    connector: 'PostgreSQL:pg' as const,
    formatter: pgFormatter,
    setupPool: () => nodePostgresPool({ connectionString })
  },
  {
    name: 'SQLite',  
    connector: 'SQLite:sqlite3' as const,
    formatter: sqliteFormatter,
    setupPool: () => sqlitePool({ fileName: ':memory:' })
  }
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
   tracer.info('db:sql:query', { 
     sql: query, 
     params,
     debugSQL: pgFormatter.formatRaw(sqls[i]!)
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
   void describe('Database Tests', () => {
     let pool: ConnectionPool;
     let connection: Connection;

     beforeEach(async () => {
       pool = sqlitePool({
         fileName: ':memory:',
         connector: 'SQLite:sqlite3'
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