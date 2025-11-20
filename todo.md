# Foreign Key Type Validation - Implementation Checklist

## Phase 1: Foundation - Type Extraction Utilities
- [x] Step 1: Add ExpectError Helper
- [x] Step 2: Create Foreign Key Types File Structure
- [ ] Step 3: Implement ExtractSchemaNames Type Utility
- [ ] Step 4: Implement ExtractTableNames Type Utility
- [ ] Step 5: Implement ExtractColumnNames Type Utility

## Phase 2: Column Reference Generation
- [ ] Step 6: Implement AllColumnReferences Type Utility (Single Schema)
- [ ] Step 7: Test AllColumnReferences with Multi-Schema Database

## Phase 3: Foreign Key Type Definition
- [ ] Step 8: Define ForeignKeyDefinition Type
- [ ] Step 9: Update TableSchemaComponent to Include Foreign Keys
- [ ] Step 10: Update dumboTable to Accept Foreign Keys

## Phase 4: Single Foreign Key Validation
- [ ] Step 11: Implement ValidateForeignKeyLength
- [ ] Step 12: Implement ValidateForeignKeyColumns
- [ ] Step 13: Implement ValidateForeignKeyReferences
- [ ] Step 14: Implement ValidateSingleForeignKey (Combine Validations)

## Phase 5: Full Database Validation
- [ ] Step 15: Implement ValidateTableForeignKeys
- [ ] Step 16: Implement ValidateSchemaForeignKeys
- [ ] Step 17: Implement ValidateDatabaseForeignKeys

## Phase 6: Integration with dumboSchema
- [ ] Step 18: Create Foreign Keys Barrel Export
- [ ] Step 19: Wire Validation to database() Function
- [ ] Step 20: Wire Validation to schema() Function

## Phase 7: Real-World Testing
- [ ] Step 21: Add Real-World Test Cases
- [ ] Step 22: Update Existing Example in Test File

---

## Quality Gates (Run after EVERY step as subagents)

After each step is complete, you MUST run:

1. ✓ `npm run fix` - Fix linting issues
2. ✓ `npm run build:ts` - Ensure TypeScript compiles
3. ✓ `npm run test:unit` - Run all tests

**All three must pass before proceeding to the next step.**

If any fail and cannot be fixed automatically, **STOP and ask for help**.

---

## Progress Tracking

**Current Step:** Not started

**Completed Steps:** 0 / 22

**Estimated Time Remaining:** 4-6 hours

---

## Notes

- Follow TDD: Write type tests first, then implement
- Use `describe`/`it` for tests
- No unnecessary comments
- Keep code simple and maintainable
- Follow existing codebase patterns
