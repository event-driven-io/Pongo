# TypeScript Development Patterns

Non-negitiables

- DO NOT EVER js with ts in my typsecript. Don't import .js files in my TS files. JS is a concern for the dist dir only
- You must not add Debug files, just add new tests when needed

## Branded Type Implementation Patterns

### Branded Types with Internal Structure

When you need rich internal structure behind a simple branded type:

```typescript
// Public API: Simple branded type
type SQL = string & { __brand: "sql" };

// Internal implementation: Rich structure
interface ParametrizedSQL {
  __brand: "parametrized-sql";
  sql: string;
  params: unknown[];
}

// Function returns rich structure but types as simple brand
export function SQL(strings: TemplateStringsArray, ...values: unknown[]): SQL {
  const parametrized = ParametrizedSQL(strings, values);
  return parametrized as unknown as SQL; // This casting is intentional design
}
```

**Why this pattern works:**

- Public API remains stable and simple
- Internal implementation can be complex and evolve
- Type system enforces correct usage externally

### Helper Functions for Internal Access

When you need to access internal structure repeatedly:

```typescript
// Helper avoids repetitive casting throughout codebase
const asParametrizedSQL = (sql: SQL): ParametrizedSQL =>
  sql as unknown as ParametrizedSQL;

// Usage - clean and readable
const result = asParametrizedSQL(SQL`SELECT * FROM users WHERE id = ${123}`);
assert.equal(result.sql, "SELECT * FROM users WHERE id = __P1__");
assert.deepEqual(result.params, [123]);
```

**When to use helper functions:**

- When you need the same cast repeatedly
- When type system and runtime reality intentionally diverge
- To avoid `as unknown as Type` scattered throughout code
- For testing internal behavior without exposing implementation

### Interface Design for Evolution

Design interfaces that can evolve without breaking consumers:

```typescript
// Core interface with required fields
interface ParametrizedSQL {
  __brand: "parametrized-sql";
  sql: string;
  params: unknown[];
}

// Type guards for runtime checking
export const isParametrizedSQL = (value: unknown): value is ParametrizedSQL => {
  return (
    value !== null &&
    typeof value === "object" &&
    "__brand" in value &&
    value.__brand === "parametrized-sql"
  );
};
```

## Function Pattern Matching

### Follow Existing Codebase Patterns

Match established patterns in the codebase:

```typescript
// ✅ Follow existing pattern (function + factory)
export const ParametrizedSQL = (
  strings: TemplateStringsArray,
  values: unknown[]
): ParametrizedSQL => {
  // Implementation
};

// ✅ Not: export function parametrizeSQL() - doesn't match codebase
```

### Consistent Type Structure

Use consistent patterns for similar concepts:

```typescript
// Pattern: Interface + factory function + type guard
interface ParametrizedSQL {
  /* ... */
}
export const ParametrizedSQL = () => {
  /* factory */
};
export const isParametrizedSQL = () => {
  /* type guard */
};

// Same pattern applied elsewhere
interface FormattedSQL {
  /* ... */
}
export const FormattedSQL = () => {
  /* factory */
};
export const isFormattedSQL = () => {
  /* type guard */
};
```

## Type System Realities

### Intentional Type/Runtime Divergence

Sometimes type system and runtime intentionally diverge for API design:

```typescript
// Type says "string" but runtime is object
type SQL = string & { __brand: "sql" };

// This is intentional design, not a bug
const sql = SQL`SELECT * FROM users`; // Runtime: ParametrizedSQL object
const formatted = formatSQL(sql); // Formatters know the real structure
```

**This pattern is valid when:**

- You want to hide implementation complexity
- Public API should remain simple
- Internal layers need rich structure
- Type safety is maintained at boundaries

### Helper Functions vs Type Changes

Prefer helper functions over changing branded types:

```typescript
// ✅ Helper function approach
const asParametrizedSQL = (sql: SQL): ParametrizedSQL =>
  sql as unknown as ParametrizedSQL;

// ❌ Avoid: Changing the branded type breaks everything
type SQL = ParametrizedSQL & { __brand: "sql" }; // Breaks existing code
```

## Testing TypeScript Patterns

### Testing Internal Structure

Use helper functions to test internal behavior:

```typescript
void describe("SQL parametrization", () => {
  void it("should create correct internal structure", () => {
    const sql = SQL`SELECT * FROM users WHERE id = ${123}`;
    const internal = asParametrizedSQL(sql); // Helper for clean testing

    assert.equal(internal.sql, "SELECT * FROM users WHERE id = __P1__");
    assert.deepEqual(internal.params, [123]);
  });
});
```

### Type Guard Testing

Test type guards with various inputs:

```typescript
void describe("isParametrizedSQL", () => {
  void it("should identify ParametrizedSQL objects", () => {
    const valid = { __brand: "parametrized-sql", sql: "SELECT 1", params: [] };
    const invalid = { __brand: "other", sql: "SELECT 1" };

    assert.ok(isParametrizedSQL(valid));
    assert.ok(!isParametrizedSQL(invalid));
    assert.ok(!isParametrizedSQL(null));
    assert.ok(!isParametrizedSQL(undefined));
  });
});
```

## TypeScript Development Benefits

**From our implementation experience:**

- Branded types provide API stability with implementation flexibility
- Helper functions enable clean access to internal structure
- Type guards enable safe runtime checking
- Consistent patterns make codebase easier to understand and extend
