# SQL Parametrization Implementation Todo

## Project Status: Planning Complete

The detailed TDD implementation plan has been created in `plan.md`. Ready to begin implementation.

## Current Implementation State: Phase 3 Complete, Ready for Phase 4

### Phase 1: Foundation - Core Parametrizer ✅ COMPLETE
- [x] Step 1: Create ParametrizedSQL Interface and Basic Tests
- [x] Step 2: Implement Basic Template Parametrization  
- [x] Step 3: Special Value Types Pass Through (simplified: all become parameters)
- [x] Step 4: Implement Nested SQL Template Flattening

### Phase 2: SQL Function Integration ✅ COMPLETE
- [x] Step 5: Update SQL Template Function to Return ParametrizedSQL (SQL function updated)
- [x] Step 6: Update Core SQL Exports and Remove Legacy Types ✅ FIXED - All tests now passing

### Phase 3: Formatter Interface Evolution ✅ COMPLETE
- [x] Step 7: Update Formatter Implementation for ParametrizedSQL ✅ COMPLETE - Handles __P1__ placeholders correctly
- [x] Step 8: Add Database-Specific Parametrized Query Interface ✅ COMPLETE - Base function delegation pattern successful

### Phase 4: Execution Layer Integration
- [ ] Step 9: Refactor PostgreSQL Execution to Use Parametrized Queries
- [ ] Step 10: Refactor SQLite Execution to Use Parametrized Queries

### Phase 5: Testing and Validation
- [ ] Step 11: Update Existing Test Suite for New Execution Signatures
- [ ] Step 12: Add Parametrization-Specific Tests
- [ ] Step 13: Query Plan Reuse Validation and Performance Benchmarking

## Next Actions - Ready for Phase 4

**CURRENT PRIORITY**: Implement native parameter binding in database execution layers

**MAJOR ACHIEVEMENT**: ✅ Phase 3 Complete! Database-specific parameter mapping implemented with:
- Clean base function delegation pattern
- PostgreSQL and SQLite formatters with mapSQLValue interface
- All 156 unit tests passing
- DRY architecture with minimal database-specific code
- Base function handles complex SQL wrapper types

**Next Implementation Phase**: Phase 4 - Execution Layer Integration

**Step 8 Implementation Details** (✅ COMPLETED):
```
**CRITICAL**: Raw values are already inlined during parametrization phase - formatters don't receive raw() values as parameters.

**Implementation Steps (COMPLETED):**

1. **Add base mapSQLValue function and rename existing function in core**
   File: `src/packages/dumbo/src/core/sql/sqlFormatter.ts`
   - ✅ Rename `formatValue()` → `formatSQLValue()` (for string formatting)
   - ✅ Update all calls to `formatValue()` → `formatSQLValue()` within the file  
   - ✅ Add base `mapSQLValue()` function for parameter binding

2. **Update SQLFormatter interface to require mapSQLValue**
   File: `src/packages/dumbo/src/core/sql/sqlFormatter.ts`
   - ✅ Add `mapSQLValue: (value: unknown) => unknown;` to interface

3. **Implement mapSQLValue in PostgreSQL formatter**
   File: `src/packages/dumbo/src/storage/postgresql/core/sql/formatter/index.ts`
   - ✅ PostgreSQL doesn't need specific type conversions, use base function

4. **Implement mapSQLValue in SQLite formatter**
   File: `src/packages/dumbo/src/storage/sqlite/core/sql/formatter/index.ts`
   - ✅ Check SQLite-specific types first (boolean → 1/0, Date → ISO string, BigInt → string)
   - ✅ Fall back to base for SQL wrappers and other types

5. **Update formatter format methods to use mapSQLValue**
   - ✅ Map parameter values using formatter's mapSQLValue method
   - ✅ Return { query, params: mappedParams }

6. **Update existing references to formatValue**
   - ✅ Update processSQL function to call formatSQLValue instead of formatValue

7. **Write comprehensive tests for both formatters**
   - ✅ Test SQL wrapper types, basic types, DB-specific conversions
   - ✅ Error handling for non-ParametrizedSQL input

**Expected Outcomes (ACHIEVED):**
- PostgreSQL: { query: "SELECT * FROM users WHERE id = $1", params: [123] }
- SQLite: { query: "SELECT * FROM users WHERE id = ?", params: [123] }
```

1. **Step 9**: Refactor PostgreSQL Execution to Use Parametrized Queries
   - Update PostgreSQL execution to use native parameter binding
   - Replace string interpolation with `client.query(query, params)`

2. **Step 10**: Refactor SQLite Execution to Use Parametrized Queries  
   - Apply same pattern to SQLite execution
   - Handle SQLite-specific parameter binding format

## Implementation Notes

**⚠️ Critical**: Always work from `src/` directory, not project root
- Test commands: `npm run test:unit`, `npm run test:int`, `npm run test:e2e`
- Build commands: `npm run build:ts`, `npm run build`
- Quality commands: `npm run lint`, `npm run fix`
- Watch mode: `npm run build:ts:watch`, `npm run test:unit:watch`

**🗑️ Legacy Type Removal**: DeferredSQL and RawSQL will be completely removed and replaced with ParametrizedSQL. No backward compatibility maintained.

**🎯 Parametrizer Simplicity**: ✅ CONFIRMED - The parametrizer has ONE job - convert values to parameters. Everything becomes a parameter except nested SQL which gets flattened. Special value handling (identifier, literal, raw) happens in formatters, not parametrizer.

**⚠️ Breaking Change Impact**: Changing SQL function return type from DeferredSQL/RawSQL to ParametrizedSQL breaks 65 tests. Formatters must be updated to handle new structure before proceeding.

**Pongo Testing Conventions**:
- Use Node.js test runner: `describe`, `it` from `node:test`
- Test categories: `*.unit.spec.ts`, `*.int.spec.ts`, `*.e2e.spec.ts`
- AAA pattern: Arrange, Act, Assert
- Connection management: Lazy singleton pattern with proper cleanup
- Multi-database testing: Test both PostgreSQL and SQLite

**Code Quality Standards**:
- TypeScript strict mode with `exactOptionalPropertyTypes`
- ESLint + Prettier compliance
- Proper error handling and logging
- JSDoc comments for public APIs
- Type-safe database operations

**CRITICAL STEP COMPLETION RULE**: NEVER mark any step as completed unless ALL of the following pass with no errors:
- `npm run fix` tries to fix errors and passes if all was solved and there are no errors left to manually fix
- `npm run build:ts` passes with no errors  
- `npm run test` passes with no errors (unit, integration, e2e)
- Use `JSONSerializer.serialize()` instead of `JSON.stringify()` for consistency

## Files Created

- ✅ `src/packages/dumbo/src/core/sql/parametrizedSQL.ts` - Core parametrizer implementation
- ✅ `src/packages/dumbo/src/core/sql/parametrizedSQL.unit.spec.ts` - Tests for parametrizer

## Files to Modify

- `src/packages/dumbo/src/core/sql/sql.ts` - SQL function updates + remove DeferredSQL/RawSQL types
- `src/packages/dumbo/src/core/sql/index.ts` - New exports + remove legacy type exports
- `src/packages/dumbo/src/core/sql/sqlFormatter.ts` - Interface extensions
- `src/packages/dumbo/src/storage/postgresql/core/sql/formatter/` - PostgreSQL formatter
- `src/packages/dumbo/src/storage/sqlite/core/sql/formatter/` - SQLite formatter  
- `src/packages/dumbo/src/storage/postgresql/pg/execute/execute.ts` - PostgreSQL execution
- `src/packages/dumbo/src/storage/sqlite/core/execute/execute.ts` - SQLite execution
- Various test files throughout the codebase

## Ready for Implementation

The plan is comprehensive, step-by-step, and follows TDD principles. Each step has clear acceptance criteria and builds incrementally toward the final goal of SQL parametrization for query plan reuse. DeferredSQL and RawSQL will be completely removed in favor of the unified ParametrizedSQL approach.