# SQL Parametrization Refactoring - Complete Implementation Guide

**Context Reference**: See `.claude/docs/sql-formatting.md` for detailed analysis of current implementation, problems, and initial refactoring plan.

## Problem Statement

The current SQL formatting system in Dumbo generates unique query strings by interpolating values directly into SQL, preventing database query plan caching and reducing performance. Each query like `"SELECT * FROM users WHERE id = 123"` and `"SELECT * FROM users WHERE id = 456"` creates separate query plans instead of reusing a parameterized plan.

**Performance Impact**:
- PostgreSQL query plans cached by exact string match - literal values prevent reuse
- SQLite loses prepared statement benefits with string interpolation
- Database must reparse and replan each unique query string

**Current Execution Points**:
- PostgreSQL: `src/packages/dumbo/src/storage/postgresql/pg/execute/execute.ts:94` - `pgFormatter.format(sqls[i]!)`  
- SQLite: `src/packages/dumbo/src/storage/sqlite/core/execute/execute.ts:73` - `sqliteFormatter.format(sqls[i]!)`

## Solution Overview

**Approach**: Keep `SQL`` template literals unchanged from user perspective, but change internal representation from string-based to parameterized format with database-agnostic placeholders.

**Current Flow**: `SQL`` → String → Database`  
**New Flow**: `SQL`` → {sql, params} → Database`

## Key Decisions Made

### 1. Placeholder Format
- **Choice**: `__P1__`, `__P2__`, etc.
- **Rationale**: Simple, readable, very low collision risk with user data
- **Alternative considered**: `{{1}}` (too risky), `{{__DUMBO_1__}}` (too verbose)

### 2. Template Flattening  
- **Approach**: Nested SQL objects get flattened into single ParametrizedSQL
- **Example**: 
  ```typescript
  const subQuery = SQL`SELECT id FROM roles WHERE name = ${literal('admin')}`;
  const main = SQL`SELECT * FROM users WHERE role_id IN (${subQuery})`;
  // Results in: { sql: "SELECT * FROM users WHERE role_id IN (SELECT id FROM roles WHERE name = __P1__)", params: ['admin'] }
  ```

### 3. Execution Interface
- **Choice**: Refactor `execute()` to take `SQL` object instead of string
- **Signature**: `execute(sql: SQL) → result` 
- **Rationale**: SQLExecutor already has formatter inside, no need for additional DatabaseFormatter
- **Breaking change**: Acceptable, no need to maintain backward compatibility unless explicitly requested

### 4. Implementation Strategy
- **Database Support**: Implement both PostgreSQL and SQLite simultaneously
- **Formatter Reuse**: Use existing formatters inside SQLExecutor for type conversion
- **User API**: `SQL`` template literals remain unchanged from user perspective

## New Internal Architecture

```typescript
interface ParametrizedSQL {
  __brand: 'deferred-sql';
  sql: string;        // "SELECT * FROM users WHERE id = __P1__ AND name = __P2__"
  params: unknown[];  // [123, "John"]
}

// SQLExecutor internally converts:
// __P1__ → $1 (PostgreSQL) or ? (MySQL/SQLite)
// Applies existing type formatting for BigInt, Date, Boolean, JSON, etc.
```

## Benefits
- Query plan reuse through consistent query strings
- Native parameter binding for security and performance  
- Maintains familiar developer experience
- Leverages existing formatter infrastructure

## Implementation Plan

### Phase 1: Core Parametrizer
- **File**: `src/packages/dumbo/src/core/sql/sqlParametrizer.ts`
- **Tasks**:
  - Create `ParametrizedSQL` interface with `__brand: 'deferred-sql'`, `sql: string`, `params: unknown[]`
  - Implement template flattening logic for nested SQL objects
  - Handle `literal()`, `identifier()`, `raw()` value types
  - Convert interpolated values to `__P1__`, `__P2__` placeholders
  - Merge parameter arrays when flattening nested SQL

### Phase 2: Update SQL Function
- **File**: `src/packages/dumbo/src/core/sql/sql.ts`
- **Tasks**:
  - Modify `SQL()` function to return `ParametrizedSQL` instead of current types
  - Update `mergeSQL()` and `concatSQL()` to work with new format
  - Ensure backward compatibility for existing helper functions

### Phase 3: Update Execution Layer
- **Files**: 
  - `src/packages/dumbo/src/storage/postgresql/pg/execute/execute.ts`
  - `src/packages/dumbo/src/storage/sqlite/core/execute/execute.ts`
- **Tasks**:
  - Change `execute()` signature from `(sqlString: string)` to `(sql: SQL)`
  - Update formatter calls: `pgFormatter.format(sql)` → `{ query, params }`
  - Use returned parameterized query: `client.query(query, params)` 
  - Implement debug logging: `formatRaw(sql)` for human-readable traces
  - Handle both single SQL and SQL array cases in batch operations

### Phase 4: Testing & Validation
- **Tasks**:
  - Update existing tests to work with new execution signature
  - Add parametrization-specific tests
  - Test template flattening with complex nested cases
  - Validate query plan reuse with database-specific tools
  - Performance benchmarks vs current string-based approach

### Files to Create:
- `src/packages/dumbo/src/core/sql/sqlParametrizer.ts`

### Files to Modify:
- `src/packages/dumbo/src/core/sql/sql.ts`
- `src/packages/dumbo/src/core/sql/index.ts` (exports)
- `src/packages/dumbo/src/storage/postgresql/pg/execute/execute.ts`
- `src/packages/dumbo/src/storage/sqlite/core/execute/execute.ts`
- All test files that call `execute()`

## Database Parameter Style Research

**Key Finding**: No universal parameter standard across databases, each has different native styles:

- **PostgreSQL**: `$1, $2, $3` (numbered placeholders) - node-postgres native  
- **MySQL**: `?` (positional placeholders) - mysql2 standard
- **SQLite**: `?` (positional) or `@name, :name, $name` (named) - better-sqlite3 supports both
- **SQL Server**: `@param1, @param2` (named with @ prefix)

**Implication**: Using database-agnostic `__P1__` placeholders internally allows us to convert to any database's native format at execution time.

## Execution Interface Evolution

**Current Issue**: Execution methods take string SQL and have formatters internally:
```typescript
// Current in SQLExecutor  
execute(sqlString: string) → result
// Formatter is internal: pgFormatter.format(sql) or sqliteFormatter.format(sql)
```

**Solution**: Change execute signature to take SQL objects directly:
```typescript
// New signature
execute(sql: SQL) → result
// SQLExecutor internally: 1) converts __P1__ to database format, 2) applies type formatting, 3) calls client.query(query, params)
```

**Rationale**: SQLExecutor already contains the formatter, so no need for additional DatabaseFormatter parameter. This is cleaner than `execute(query: string, params: unknown[])` two-parameter approach.

## Refined SQLFormatter Interface Design

**Key Decision**: Simplify formatter interface with two complementary methods:

```typescript
interface SQLFormatter {
  // Existing type formatting methods
  formatLiteral: (value: unknown) => string;
  formatIdentifier: (value: unknown) => string;
  formatString: (value: unknown) => string;
  // ... other existing methods
  
  // Core methods for new parametrized approach
  format: (sql: SQL) => { query: string; params: unknown[] };  // Primary: parameterized for execution
  formatRaw: (sql: SQL) => string;                             // Debug: string with inlined values
}
```

**Method Responsibilities**:
- **`format(sql)`**: Returns `{ query: "SELECT * FROM users WHERE id = $1", params: [123] }` for database execution
- **`formatRaw(sql)`**: Returns `"SELECT * FROM users WHERE id = '123'"` for debugging/tracing

**Usage in Execution**:
```typescript
const { query, params } = pgFormatter.format(sql);
tracer.info('db:sql:query', { 
  sql: query, 
  params,
  debugSQL: pgFormatter.formatRaw(sql)  // Optional: for human-readable logs
});
const result = await client.query(query, params);
```

**Benefits**:
- **Single Input**: Both methods operate on the same `SQL` object
- **Clear Purpose**: `format()` for execution, `formatRaw()` for debugging
- **Backward Compatibility**: `formatRaw()` provides current string behavior
- **Type Safety**: Existing type conversion logic reused for parameter values

## Template Flattening Logic

**Requirement**: Nested SQL objects should be flattened into single ParametrizedSQL:

```typescript
// Input: Nested SQL
const subQuery = SQL`SELECT id FROM roles WHERE name = ${literal('admin')}`;
const main = SQL`SELECT * FROM users WHERE role_id IN (${subQuery})`;

// Output: Flattened ParametrizedSQL
{
  __brand: 'deferred-sql',
  sql: "SELECT * FROM users WHERE role_id IN (SELECT id FROM roles WHERE name = __P1__)",
  params: ['admin']
}
```

**Benefits**: 
- Single parameter array to pass to database
- Simplified execution logic
- Better parameter indexing and debugging

## Breaking Changes Approach

**Philosophy**: Don't prioritize backward compatibility unless explicitly requested. Clean breaks are acceptable for better design.

**User-Facing Impact**: Minimal - `SQL`` template literals work identically from user perspective. Only internal execution signature changes.

**Migration Strategy**: Direct refactoring of execute() methods rather than maintaining dual APIs.

## Implementation Tasks

### 1. Core Parametrizer Implementation
**File**: `src/packages/dumbo/src/core/sql/sqlParametrizer.ts`
**Tasks**:
- Create `ParametrizedSQL` interface: `{ __brand: 'deferred-sql', sql: string, params: unknown[] }`
- Implement template flattening logic for nested SQL objects  
- Process `DeferredSQL.strings` and `DeferredSQL.values` arrays
- Handle value types: `literal()` → parameter, `identifier()`/`raw()` → inline in query
- Convert interpolated values to `__P1__`, `__P2__` placeholders sequentially
- Merge parameter arrays when flattening nested SQL structures
- Handle edge cases: empty SQL, mixed value types, deeply nested SQL

### 2. Update SQL Function  
**File**: `src/packages/dumbo/src/core/sql/sql.ts`
**Tasks**:
- Modify `SQL()` function to return `ParametrizedSQL` instead of `DeferredSQL`/`RawSQL`
- Update `mergeSQL()` to work with new ParametrizedSQL format
- Update `concatSQL()` to work with new ParametrizedSQL format  
- Ensure existing helper functions (`identifier`, `literal`, `raw`) still work
- Update type guards (`isDeferredSQL`, `isRawSQL`) or create new ones for ParametrizedSQL
- Maintain `SQL.empty`, `SQL.isEmpty()` functionality

### 3. Update Core SQL Exports
**File**: `src/packages/dumbo/src/core/sql/index.ts`  
**Tasks**:
- Export new `ParametrizedSQL` type and related interfaces
- Export parametrizer functions if needed publicly
- Ensure all existing exports remain available for backward compatibility

### 4. Refactor PostgreSQL Execution
**File**: `src/packages/dumbo/src/storage/postgresql/pg/execute/execute.ts`
**Current**: Line 94 - `pgFormatter.format(sqls[i]!)`  
**Tasks**:
- Change `batch()` function signature: accept `SQL | SQL[]` instead of processing formatted strings
- Update formatter usage: `const { query, params } = pgFormatter.format(sqls[i]!)` 
- Update `client.query()` calls: `client.query(query, params)`
- Add debug logging: `formatRaw(sqls[i]!)` for tracing
- Handle both single SQL and SQL array cases
- Maintain transaction and error handling logic

### 5. Refactor SQLite Execution  
**File**: `src/packages/dumbo/src/storage/sqlite/core/execute/execute.ts`
**Current**: Line 73 - `sqliteFormatter.format(sqls[i]!)`
**Tasks**:
- Change `batch()` function signature: accept `SQL | SQL[]` instead of processing formatted strings
- Update formatter usage: `const { query, params } = sqliteFormatter.format(sqls[i]!)` 
- Update `client.query()` calls: `client.query(query, params)`
- Add debug logging: `formatRaw(sqls[i]!)` for tracing
- Handle both single SQL and SQL array cases
- Maintain transaction and error handling logic

### 6. Test Updates
**Files**: All test files that call `execute()` methods
**Tasks**:  
- Update tests to work with new execution signatures (most should be transparent)
- Add specific parametrization tests for template flattening
- Test complex nested SQL scenarios
- Test all value types (literal, identifier, raw) in parametrized context
- Add database-specific tests for placeholder conversion
- Validate parameter binding with real database calls
- Performance tests comparing parametrized vs old string approach

### 7. Validation & Documentation
**Tasks**:
- Verify query plan reuse using database-specific tools (PostgreSQL: `EXPLAIN`, SQLite: `.eqp`)
- Performance benchmarking of parametrized vs string queries
- Update `.claude/docs/sql-formatting.md` with new implementation details
- Document breaking changes and migration notes
- Add examples of new internal flow in documentation

### Files to Create:
- `src/packages/dumbo/src/core/sql/sqlParametrizer.ts` (new parametrization logic)

### Files to Modify:
- `src/packages/dumbo/src/core/sql/sql.ts` (SQL function changes)
- `src/packages/dumbo/src/core/sql/index.ts` (new exports)
- `src/packages/dumbo/src/storage/postgresql/pg/execute/execute.ts` (execution refactor)
- `src/packages/dumbo/src/storage/sqlite/core/execute/execute.ts` (execution refactor)
- `.claude/docs/sql-formatting.md` (documentation update)
- All test files calling execute() methods

### Implementation Order:
1. **Core parametrizer** - Foundation with `__P1__` placeholders and template flattening
2. **SQL function update** - Return ParametrizedSQL format from SQL`` templates
3. **Execution refactoring** - Both PostgreSQL and SQLite simultaneously  
4. **Test updates** - Ensure all functionality works with new approach
5. **Validation & documentation** - Performance verification and doc updates

## Success Criteria

- [ ] `SQL`` template literals work identically from user perspective
- [ ] Internal representation uses `{sql, params}` format with `__P1__` placeholders  
- [ ] Both PostgreSQL and SQLite execution use native parameter binding
- [ ] Query plan reuse demonstrated through database tooling
- [ ] All existing tests pass with new implementation
- [ ] Performance improvement measurable in benchmarks
- [ ] Documentation updated to reflect new architecture