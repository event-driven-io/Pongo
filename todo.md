# SQL Parametrization Implementation Todo

## Project Status: Planning Complete

The detailed TDD implementation plan has been created in `plan.md`. Ready to begin implementation.

## Current Implementation State: Not Started

### Phase 1: Foundation - Core Parametrizer
- [ ] Step 1: Create ParametrizedSQL Interface and Basic Tests
- [ ] Step 2: Implement Basic Template Parametrization  
- [ ] Step 3: Implement Special Value Type Handling
- [ ] Step 4: Implement Nested SQL Template Flattening

### Phase 2: SQL Function Integration
- [ ] Step 5: Update SQL Template Function to Return ParametrizedSQL
- [ ] Step 6: Update Core SQL Exports and Remove Legacy Types

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

## Next Actions

1. Begin with Step 1: Create ParametrizedSQL Interface and Basic Tests
2. Follow TDD approach: Write failing tests, implement minimal code, refactor
3. Each step builds on the previous step's foundation
4. Test both PostgreSQL and SQLite at each appropriate step
5. Remove DeferredSQL and RawSQL types completely - no backward compatibility needed

## Implementation Notes

**⚠️ Critical**: Always work from `src/` directory, not project root
- Test commands: `npm run test:unit`, `npm run test:int`, `npm run test:e2e`
- Build commands: `npm run build:ts`, `npm run build`
- Quality commands: `npm run lint`, `npm run fix`
- Watch mode: `npm run build:ts:watch`, `npm run test:unit:watch`

**🗑️ Legacy Type Removal**: DeferredSQL and RawSQL will be completely removed and replaced with ParametrizedSQL. No backward compatibility maintained.

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

## Files to Create

- `src/packages/dumbo/src/core/sql/sqlParametrizer.ts` - Core parametrizer implementation
- `src/packages/dumbo/src/core/sql/sqlParametrizer.unit.spec.ts` - Tests for parametrizer

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