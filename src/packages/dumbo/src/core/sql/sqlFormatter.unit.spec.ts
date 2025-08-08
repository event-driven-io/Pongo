import assert from 'assert';
import { before, describe, it } from 'node:test';
import { identifier, isSQL, literal, SQL } from './sql';
import { isParametrizedSQL, type ParametrizedSQL } from './parametrizedSQL';
import { registerFormatter, type SQLFormatter } from './sqlFormatter';

const mockFormatter: SQLFormatter = {
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  formatIdentifier: (value: unknown) => `"${value}"`,
  formatLiteral: (value: unknown) => {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
    if (typeof value === 'boolean') return value ? "'t'" : "'f'";
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value))
      return (
        '(' + value.map((v) => mockFormatter.formatLiteral(v)).join(', ') + ')'
      );
    if (typeof value === 'object') return `'${JSON.stringify(value)}'::jsonb`;
    // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions
    return `'${value}'`;
  },
  formatString: (value: unknown) => String(value),
  formatArray: (array: unknown[], itemFormatter) => {
    return '(' + array.map(itemFormatter).join(', ') + ')';
  },
  mapSQLValue: (value: unknown) => value, // Simple pass-through for mock
  format: (_sql) => ({ query: 'mocked query', params: [] }),
  formatRaw: (_sql) => 'mocked raw query',
};

void describe('SQL template', () => {
  before(() => {
    registerFormatter('test', mockFormatter);
  });

  void describe('Basic SQL Creation', () => {
    void it('should create SQL from template literals', () => {
      const query = SQL`SELECT * FROM users`;
      assert.strictEqual(isSQL(query), true);
      assert.strictEqual(isParametrizedSQL(query), true);
    });

    void it('should create SQL from raw string', () => {
      const query = SQL`SELECT * FROM users`;
      assert.strictEqual(isSQL(query), true);
      assert.strictEqual(isParametrizedSQL(query), true);
      assert.strictEqual(
        (query as unknown as ParametrizedSQL).sql,
        'SELECT * FROM users',
      );
    });

    void it('should handle SQL with interpolated values', () => {
      const name = 'John';
      const age = 30;
      const query = SQL`SELECT * FROM users WHERE name = ${literal(name)} AND age = ${age}`;

      assert.strictEqual(isSQL(query), true);
      assert.strictEqual(isParametrizedSQL(query), true);

      const parametrized = query as unknown as ParametrizedSQL;
      assert.strictEqual(parametrized.params.length, 2);
      assert.strictEqual(parametrized.sql.includes('__P1__'), true);
      assert.strictEqual(parametrized.sql.includes('__P2__'), true);
    });
  });

  void describe('isEmpty function', () => {
    void it('should correctly identify empty SQL', () => {
      const empty1 = SQL``;
      const empty2 = SQL.empty;
      const withContent = SQL`SELECT 1`;
      const withWhitespace = SQL`   `;

      assert.strictEqual(SQL.isEmpty(empty1), true);
      assert.strictEqual(SQL.isEmpty(empty2), true);
      assert.strictEqual(SQL.isEmpty(withContent), false);
      assert.strictEqual(SQL.isEmpty(withWhitespace), true);
    });

    void it('should handle SQL with only values', () => {
      const onlyValues = SQL`${literal('test')}`;
      const withEmptyStrings = SQL`${''}${literal('test')}${''}`;

      assert.strictEqual(SQL.isEmpty(onlyValues), false);
      assert.strictEqual(SQL.isEmpty(withEmptyStrings), false);
    });

    void it('should handle complex empty cases', () => {
      const emptyWithValues = SQL`${''}${''}${''}`;
      const reallyEmpty = SQL``;

      assert.strictEqual(SQL.isEmpty(emptyWithValues), false);
      assert.strictEqual(SQL.isEmpty(reallyEmpty), true);
    });
  });

  void describe('merge Method', () => {
    void it('should merge SQL objects', () => {
      const base = SQL`SELECT *`;
      const from = SQL`FROM users`;
      const where = SQL`WHERE active = ${literal(true)}`;

      const result = SQL.merge([base, SQL` `, from, SQL` `, where]);

      assert.strictEqual(isSQL(result), true);
      assert.strictEqual(isParametrizedSQL(result), true);
      assert.strictEqual(SQL.isEmpty(result), false);
    });

    void it('should handle empty SQL in merging', () => {
      const base = SQL`SELECT * FROM users`;
      const empty = SQL.empty;
      const order = SQL`ORDER BY name`;

      const result = SQL.merge([base, SQL` `, empty, SQL` `, order]);
      const formatted = SQL.format(result, mockFormatter);

      // Empty parts should be filtered out
      assert.strictEqual(
        formatted.includes('SELECT * FROM users ORDER BY name'),
        true,
      );
    });

    void it('should return appropriate types for edge cases', () => {
      const empty1 = SQL``;
      const empty2 = SQL.empty;
      const content = SQL`SELECT 1`;

      // All empty should return empty
      const allEmpty = SQL.merge([empty1, SQL``, empty2]);
      assert.deepEqual(allEmpty, SQL.empty);

      // Single non-empty should return that item
      const single = SQL.merge([empty1, content, empty2]);
      assert.deepEqual(single, content);
    });
  });

  void describe('format Method', () => {
    void it('should format simple SQL', () => {
      const query = SQL`SELECT * FROM ${identifier('users')} WHERE name = ${literal('John')}`;
      const formatted = SQL.format(query, mockFormatter);

      assert.strictEqual(
        formatted,
        'SELECT * FROM "users" WHERE name = \'John\'',
      );
    });

    void it('should format complex nested SQL', () => {
      const subquery = SQL`SELECT id FROM roles WHERE name = ${literal('admin')}`;
      const mainQuery = SQL`SELECT * FROM users WHERE role_id IN (${subquery})`;

      const formatted = SQL.format(mainQuery, mockFormatter);

      assert.strictEqual(formatted.includes('SELECT * FROM users'), true);
      assert.strictEqual(formatted.includes('WHERE role_id IN'), true);
      assert.strictEqual(formatted.includes('SELECT id FROM roles'), true);
      assert.strictEqual(formatted.includes("'admin'"), true);
    });

    void it('should handle all data types correctly', () => {
      const query = SQL`
        INSERT INTO test (
          str_col, num_col, bool_col, null_col, 
          array_col, obj_col, id_col
        ) VALUES (
          ${literal('text')}, 
          ${42}, 
          ${literal(true)}, 
          ${literal(null)},
          ${[1, '2', 3]},
          ${{ key: 'value', num: 3 }},
          ${identifier('column_name')}
        )
      `;

      const formatted = SQL.format(query, mockFormatter);

      assert.strictEqual(formatted.includes("'text'"), true);
      assert.strictEqual(formatted.includes('42'), true);
      assert.strictEqual(formatted.includes("'t'"), true);
      assert.strictEqual(formatted.includes('NULL'), true);
      assert.strictEqual(formatted.includes("(1, '2', 3)"), true);
      assert.strictEqual(
        formatted.includes('\'{"key":"value","num":3}\'::jsonb'),
        true,
      );
      assert.strictEqual(formatted.includes('"column_name"'), true);
    });

    void it('should format concatenated SQL correctly', () => {
      const base = SQL`SELECT * FROM users`;
      const where = SQL`WHERE active = ${literal(true)}`;
      const order = SQL`ORDER BY ${identifier('name')}`;

      const combined = SQL.merge([base, SQL` `, where, SQL` `, order]);
      const formatted = SQL.format(combined, mockFormatter);

      assert.strictEqual(
        formatted,
        'SELECT * FROM users WHERE active = \'t\' ORDER BY "name"',
      );
    });
  });
});
