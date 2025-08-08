# SQL Parametrization Implementation Todo

## Project Status: Planning Complete

The detailed TDD implementation plan has been created in `plan.md`. Ready to begin implementation.

## Current Implementation State: Phase 1 Complete, Phase 2 Partially Complete

### Phase 1: Foundation - Core Parametrizer ✅ COMPLETE
- [x] Step 1: Create ParametrizedSQL Interface and Basic Tests
- [x] Step 2: Implement Basic Template Parametrization  
- [x] Step 3: Special Value Types Pass Through (simplified: all become parameters)
- [x] Step 4: Implement Nested SQL Template Flattening

### Phase 2: SQL Function Integration ⚠️ PARTIALLY COMPLETE
- [x] Step 5: Update SQL Template Function to Return ParametrizedSQL (SQL function updated)
- [🔄] Step 6: Update Core SQL Exports and Remove Legacy Types (CRITICAL - 65 tests failing)

### Phase 3: Formatter Layer Integration ⚠️ CRITICAL PRIORITY
- [🔄] Step 7: Update Formatter Implementation for ParametrizedSQL (BLOCKING - tests expect strings)

### Phase 3: Formatter Interface Evolution
- [ ] Step 7: Extend SQLFormatter Interface for Parametrized Queries
- [ ] Step 8: Update Database-Specific Formatters for Parametrization

### Phase 4: Execution Layer Integration
- [ ] Step 9: Refactor PostgreSQL Execution to Use Parametrized Queries
- [ ] Step 10: Refactor SQLite Execution to Use Parametrized Queries

### Phase 5: Testing and Validation
- [ ] Step 11: Update Existing Test Suite for New Execution Signatures
- [ ] Step 12: Add Parametrization-Specific Tests
- [ ] Step 13: Query Plan Reuse Validation and Performance Benchmarking

## Next Actions - CRITICAL FIXES NEEDED

**IMMEDIATE PRIORITY**: Fix the 65 failing tests by updating formatters to handle ParametrizedSQL

1. **Step 6 (CRITICAL)**: Update Core SQL Exports and Remove Legacy Types
   - Remove DeferredSQL/RawSQL type guards and definitions
   - Update mergeSQL(), concatSQL(), isEmpty() to handle ParametrizedSQL
   - Export ParametrizedSQL types from index.ts

2. **Step 7 (CRITICAL)**: Update Formatter Implementation
   - Update formatSQL() to handle ParametrizedSQL objects
   - Process __P1__, __P2__ placeholders with parameter values
   - Apply existing formatValue() logic to parameters

**Root Cause**: SQL function now returns ParametrizedSQL but formatters expect DeferredSQL/RawSQL structure

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
- `npm run lint` passes with no errors
- `npm run build:ts` passes with no errors  
- `npm run test` passes with no errors (unit, integration, e2e)

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