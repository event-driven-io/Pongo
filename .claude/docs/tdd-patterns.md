# TDD Implementation Patterns

## TDD Process Reality

### Write Comprehensive Tests First

Define complete behavior with failing tests before implementing:

```typescript
// ✅ Define complete behavior with failing tests
void describe('SQL parametrization', () => {
  void describe('basic template literal parametrization', () => {
    void it('should parametrize simple value interpolation', () => {
      const result = SQL`SELECT * FROM users WHERE id = ${123}`;
      
      assert.equal(result.sql, 'SELECT * FROM users WHERE id = __P1__');
      assert.deepEqual(result.params, [123]);
    });

    void it('should handle multiple parameters', () => {
      const result = SQL`SELECT * FROM users WHERE id = ${123} AND name = ${'John'}`;
      
      assert.equal(result.sql, 'SELECT * FROM users WHERE id = __P1__ AND name = __P2__');
      assert.deepEqual(result.params, [123, 'John']);
    });
  });

  void describe('nested SQL template flattening', () => {
    void it('should flatten simple nested SQL', () => {
      const subQuery = SQL`SELECT id FROM roles WHERE name = ${'admin'}`;
      const mainQuery = SQL`SELECT * FROM users WHERE role_id IN (${subQuery})`;
      
      assert.equal(mainQuery.sql, 'SELECT * FROM users WHERE role_id IN (SELECT id FROM roles WHERE name = __P1__)');
      assert.deepEqual(mainQuery.params, ['admin']);
    });
  });
});
```

### Comprehensive Test Coverage

- Write 200+ lines of tests to define behavior completely
- Cover all scenarios: basic, edge cases, error conditions
- Test nested structures and complex interactions
- Use meaningful test descriptions that define expected behavior

### Implementation Strategy

1. **Red**: Write failing tests that define desired behavior
2. **Green**: Write minimal code to make tests pass  
3. **Refactor**: Improve code quality while keeping tests green

### Handle Type System Realities

When type system and runtime diverge, use helper functions:

```typescript
// Helper avoids repetitive casting throughout test suite
const asParametrizedSQL = (sql: SQL): ParametrizedSQL => 
  sql as unknown as ParametrizedSQL;

// Usage in tests - clean and readable
const result = asParametrizedSQL(SQL`SELECT * FROM users WHERE id = ${123}`);
assert.equal(result.sql, 'SELECT * FROM users WHERE id = __P1__');
```

## TDD Benefits Realized

- **Early Design Validation**: Comprehensive tests catch design issues before implementation
- **Behavior Documentation**: Tests serve as living documentation of expected behavior
- **Refactoring Safety**: Complete test coverage enables confident refactoring
- **Quality Assurance**: Forces thinking through edge cases and error conditions

## TDD Anti-Patterns to Avoid

- Writing implementation first, then adding tests
- Shallow test coverage that misses edge cases
- Generic test names that don't describe behavior
- Skipping the refactor step after making tests pass