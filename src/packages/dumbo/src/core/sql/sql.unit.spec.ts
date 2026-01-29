import assert from 'assert';
import { before, describe, it } from 'node:test';
import { registerFormatter, SQLFormatter } from './formatters';
import { isSQL, RawSQL, SQL } from './sql';
import { isTokenizedSQL, type TokenizedSQL } from './tokenizedSQL';
import { SQLValueMapper } from './valueMappers';

const mockFormatter: SQLFormatter = SQLFormatter({
  valueMapper: SQLValueMapper({
    mapPlaceholder: (index: number) => `$${index + 1}`,
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    mapIdentifier: (value: unknown) => `"${value}"`,
  }),
});

void describe('SQL template', () => {
  before(() => {
    registerFormatter('test', mockFormatter);
  });

  void describe('Basic SQL Creation', () => {
    void it('should create SQL from template literals', () => {
      const query = SQL`SELECT * FROM users`;
      assert.strictEqual(isSQL(query), true);
      assert.strictEqual(isTokenizedSQL(query), true);
    });

    void it('should create SQL from raw string', () => {
      const query = SQL`SELECT * FROM users`;
      assert.strictEqual(isSQL(query), true);
      assert.strictEqual(isTokenizedSQL(query), true);
      assert.deepStrictEqual((query as unknown as TokenizedSQL).sqlChunks, [
        'SELECT * FROM users',
      ]);
    });

    void it('handles SQL with interpolated values', () => {
      const name = 'John';
      const age = 30;
      const query = SQL`SELECT * FROM users WHERE name = ${name} AND age = ${age}`;

      assert.strictEqual(isSQL(query), true);
      assert.strictEqual(isTokenizedSQL(query), true);

      const parametrized = query as unknown as TokenizedSQL;
      assert.strictEqual(parametrized.sqlTokens.length, 2);
      assert.strictEqual(parametrized.sqlChunks.includes('__P__'), true);
      assert.strictEqual(parametrized.sqlChunks.includes('__P__'), true);
    });
  });

  void describe('isEmpty function', () => {
    void it('should correctly identify empty SQL', () => {
      const empty1 = SQL``;
      const empty2 = SQL.EMPTY;
      const withContent = SQL`SELECT 1`;
      const withWhitespace = SQL`   `;

      assert.strictEqual(SQL.check.isEmpty(empty1), true);
      assert.strictEqual(SQL.check.isEmpty(empty2), true);
      assert.strictEqual(SQL.check.isEmpty(withContent), false);
      assert.strictEqual(SQL.check.isEmpty(withWhitespace), true);
    });

    void it('handles SQL with only values', () => {
      const onlyValues = SQL`${'test'}`;
      const withEmptyStrings = SQL`${''}${'test'}${''}`;

      assert.strictEqual(SQL.check.isEmpty(onlyValues), false);
      assert.strictEqual(SQL.check.isEmpty(withEmptyStrings), false);
    });

    void it('handles complex empty cases', () => {
      const emptyWithValues = SQL`${''}${''}${''}`;
      const reallyEmpty = SQL``;

      assert.strictEqual(SQL.check.isEmpty(emptyWithValues), false);
      assert.strictEqual(SQL.check.isEmpty(reallyEmpty), true);
    });
  });

  void describe('merge Method', () => {
    void it('should merge SQL objects', () => {
      const base = SQL`SELECT *`;
      const from = SQL`FROM users`;
      const where = SQL`WHERE active = ${true}`;

      const result = SQL.merge([base, SQL` `, from, SQL` `, where]);

      assert.strictEqual(isSQL(result), true);
      assert.strictEqual(isTokenizedSQL(result), true);
      assert.strictEqual(SQL.check.isEmpty(result), false);
    });

    void it('handles empty SQL in merging', () => {
      const base = SQL`SELECT * FROM users`;
      const empty = SQL.EMPTY;
      const order = SQL`ORDER BY name`;

      const result = SQL.merge([
        base,
        SQL` `,
        empty,
        SQL` `,
        order,
      ]) as unknown as TokenizedSQL;

      // Empty parts should be filtered out
      assert.deepStrictEqual(result.sqlChunks, [
        'SELECT * FROM users',
        ' ',
        'ORDER BY name',
      ]);
    });

    void it('should return appropriate types for edge cases', () => {
      const empty1 = SQL``;
      const empty2 = SQL.EMPTY;
      const content = SQL`SELECT 1`;

      // All empty should return empty
      const allEmpty = SQL.merge([empty1, SQL``, empty2]);
      assert.deepEqual(allEmpty, SQL.EMPTY);

      // Single non-empty should return that item
      const single = SQL.merge([empty1, content, empty2]);
      assert.deepEqual(single, content);
    });
  });

  void describe('format Method', () => {
    void it('should format simple SQL', () => {
      const query = SQL`SELECT * FROM ${SQL.identifier('users')} WHERE name = ${'John'}`;
      const formatted = SQL.format(query, mockFormatter);

      assert.deepStrictEqual(formatted, {
        query: 'SELECT * FROM "users" WHERE name = $1',
        params: ['John'],
      });
    });

    void it('should format complex nested SQL', () => {
      const subquery = SQL`SELECT id FROM roles WHERE name = ${'admin'}`;
      const mainQuery = SQL`SELECT * FROM users WHERE role_id IN (${subquery})`;

      const formatted = SQL.format(mainQuery, mockFormatter);

      assert.deepStrictEqual(formatted, {
        query:
          'SELECT * FROM users WHERE role_id IN (SELECT id FROM roles WHERE name = $1)',
        params: ['admin'],
      });
    });

    void it('handles all data types correctly', () => {
      const date = new Date('2024-01-01');
      const query = SQL`
        INSERT INTO test (
          str_col, num_col, bool_col, null_col, 
          array_col, obj_col, id_col
        ) VALUES (
          ${'text'}, 
          ${42}, 
          ${true}, 
          ${null},
          ${date},
          (${[1, '2', 3, date]}),
          ${{ key: 'value', num: 3 }},
          ${SQL.identifier('column_name')}
        )
      `;

      const formatted = SQL.format(query, mockFormatter);

      assert.deepStrictEqual(formatted, {
        query: `
        INSERT INTO test (
          str_col, num_col, bool_col, null_col, 
          array_col, obj_col, id_col
        ) VALUES (
          $1, 
          $2, 
          $3, 
          $4,
          $5,
          ($6, $7, $8, $9),
          $10,
          "column_name"
        )
      `,
        params: [
          'text',
          42,
          true,
          null,
          `2024-01-01T00:00:00.000Z`,
          1,
          '2',
          3,
          `2024-01-01T00:00:00.000Z`,
          `{"key":"value","num":3}`,
        ],
      });
    });

    void it('should format concatenated SQL correctly', () => {
      const base = SQL`SELECT * FROM users`;
      const where = SQL`WHERE active = ${true}`;
      const order = SQL`ORDER BY ${SQL.identifier('name')}`;

      const combined = SQL.merge([base, SQL` `, where, SQL` `, order]);
      const formatted = SQL.format(combined, mockFormatter);

      assert.deepStrictEqual(formatted, {
        query: 'SELECT * FROM users WHERE active = $1 ORDER BY "name"',
        params: [true],
      });
    });
  });

  void describe('RawSQL template', () => {
    void it('should create SQL from template literals without parameterization', () => {
      const query = RawSQL`SELECT * FROM users`;
      assert.strictEqual(isSQL(query), true);
      assert.strictEqual(isTokenizedSQL(query), true);

      const tokenized = query as unknown as TokenizedSQL;
      assert.deepStrictEqual(tokenized.sqlChunks, ['SELECT * FROM users']);
      assert.deepStrictEqual(tokenized.sqlTokens, []);
    });

    void it('should interpolate values directly into the SQL string', () => {
      const tableName = 'users';
      const columnName = 'active';
      const query = RawSQL`SELECT * FROM ${tableName} WHERE ${columnName} = true`;

      const tokenized = query as unknown as TokenizedSQL;
      assert.deepStrictEqual(tokenized.sqlChunks, [
        'SELECT * FROM users WHERE active = true',
      ]);
      assert.deepStrictEqual(tokenized.sqlTokens, []);
    });

    void it('should format without parameters', () => {
      const tableName = 'users';
      const query = RawSQL`SELECT * FROM ${tableName}`;
      const formatted = SQL.format(query, mockFormatter);

      assert.deepStrictEqual(formatted, {
        query: 'SELECT * FROM users',
        params: [],
      });
    });

    void it('should work with SQL.merge', () => {
      const base = RawSQL`SELECT * FROM users`;
      const where = SQL`WHERE id = ${123}`;
      const result = SQL.merge([base, where]);

      const formatted = SQL.format(result, mockFormatter);
      assert.deepStrictEqual(formatted, {
        query: 'SELECT * FROM users WHERE id = $1',
        params: [123],
      });
    });

    void it('should handle empty template', () => {
      const query = RawSQL``;
      assert.strictEqual(isSQL(query), true);
      assert.strictEqual(SQL.check.isEmpty(query), true);
    });
  });
});
