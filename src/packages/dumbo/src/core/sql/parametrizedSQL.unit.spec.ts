import assert from 'node:assert';
import { describe, it } from 'node:test';
import { isParametrizedSQL, type ParametrizedSQL } from './parametrizedSQL';
import { SQL } from './sql';

const asParametrizedSQL = (sql: SQL): ParametrizedSQL =>
  sql as unknown as ParametrizedSQL;

void describe('SQL Parametrizer', () => {
  void describe('ParametrizedSQL interface structure', () => {
    void it('should have correct interface structure', () => {
      const result = asParametrizedSQL(SQL`SELECT * FROM users`);

      assert.ok(isParametrizedSQL(result));
      assert.equal(result.__brand, 'parametrized-sql');
      assert.ok(Array.isArray(result.sqlChunks));
      assert.ok(Array.isArray(result.values));
    });
  });

  void describe('basic template literal parametrization', () => {
    void it('should parametrize simple value interpolation', () => {
      const result = asParametrizedSQL(
        SQL`SELECT * FROM users WHERE id = ${123}`,
      );

      assert.deepStrictEqual(result.sqlChunks, [
        'SELECT * FROM users WHERE id = ',
        '__P__',
      ]);
      assert.deepEqual(result.values, [123]);
    });

    void it('handles multiple parameters', () => {
      const result = asParametrizedSQL(
        SQL`SELECT * FROM users WHERE id = ${123} AND name = ${'John'}`,
      );

      assert.deepStrictEqual(result.sqlChunks, [
        'SELECT * FROM users WHERE id = ',
        '__P__',
        ' AND name = ',
        '__P__',
      ]);
      assert.deepEqual(result.values, [123, 'John']);
    });

    void it('handles no parameters', () => {
      const result = asParametrizedSQL(SQL`SELECT * FROM users`);

      assert.equal(result.sqlChunks, 'SELECT * FROM users');
      assert.deepEqual(result.values, []);
    });
  });

  void describe('placeholder generation', () => {
    void it('should generate sequential placeholders', () => {
      const result = asParametrizedSQL(
        SQL`INSERT INTO users (id, name, age) VALUES (${1}, ${'Alice'}, ${30})`,
      );

      assert.deepStrictEqual(result.sqlChunks, [
        'INSERT INTO users (id, name, age) VALUES (',
        '__P__',
        ', ',
        '__P__',
        ', ',
        '__P__',
        ')',
      ]);
      assert.deepEqual(result.values, [1, 'Alice', 30]);
    });

    void it('handles many parameters', () => {
      const values = Array.from({ length: 10 }, (_, i) => i + 1);
      const result = asParametrizedSQL(
        SQL`SELECT * FROM table WHERE id IN (${values[0]}, ${values[1]}, ${values[2]}, ${values[3]}, ${values[4]}, ${values[5]}, ${values[6]}, ${values[7]}, ${values[8]}, ${values[9]})`,
      );
      assert.deepStrictEqual(result.sqlChunks, [
        'SELECT * FROM table WHERE id IN (',
        '__P__',
        ', ',
        '__P__',
        ', ',
        '__P__',
        ', ',
        '__P__',
        ', ',
        '__P__',
        ', ',
        '__P__',
        ', ',
        '__P__',
        ', ',
        '__P__',
        ', ',
        '__P__',
        ', ',
        '__P__',
        ')',
      ]);
      assert.deepEqual(result.values, values);
    });
  });

  void describe('parameter array extraction', () => {
    void it('should extract different value types', () => {
      const date = new Date('2024-01-01');
      const result = asParametrizedSQL(
        SQL`INSERT INTO logs (id, message, created_at, count) VALUES (${123}, ${'test'}, ${date}, ${null})`,
      );

      assert.deepStrictEqual(result.sqlChunks, [
        'INSERT INTO logs (id, message, created_at, count) VALUES (',
        '__P__',
        ', ',
        '__P__',
        ', ',
        '__P__',
        ', ',
        '__P__',
        ')',
      ]);
      assert.deepEqual(result.values, [123, 'test', date, null]);
    });

    void it('handles undefined values', () => {
      const result = asParametrizedSQL(
        SQL`SELECT * FROM users WHERE status = ${undefined}`,
      );

      assert.deepStrictEqual(result.sqlChunks, [
        'SELECT * FROM users WHERE status = ',
        '__P__',
      ]);
      assert.deepEqual(result.values, [undefined]);
    });
  });

  void describe('nested SQL template flattening', () => {
    void it('should flatten simple nested SQL', () => {
      const subQuery = SQL`SELECT id FROM roles WHERE name = ${'admin'}`;
      const mainQuery = asParametrizedSQL(
        SQL`SELECT * FROM users WHERE role_id IN (${subQuery})`,
      );

      assert.deepStrictEqual(mainQuery.sqlChunks, [
        'SELECT * FROM users WHERE role_id IN (',
        'SELECT id FROM roles WHERE name = ',
        '__P__',
        ')',
      ]);
      assert.deepEqual(mainQuery.values, ['admin']);
    });

    void it('handles deeply nested SQL', () => {
      const inner = SQL`SELECT id FROM permissions WHERE name = ${'read'}`;
      const middle = SQL`SELECT role_id FROM role_permissions WHERE permission_id IN (${inner})`;
      const outer = asParametrizedSQL(
        SQL`SELECT * FROM users WHERE role_id IN (${middle})`,
      );

      assert.deepStrictEqual(outer.sqlChunks, [
        'SELECT * FROM users WHERE role_id IN (',
        'SELECT role_id FROM role_permissions WHERE permission_id IN (',
        'SELECT id FROM permissions WHERE name = ',
        '__P__',
        ')',
        ')',
      ]);
      assert.deepEqual(outer.values, ['read']);
    });

    void it('handles multiple nested SQL with parameters', () => {
      const subQuery1 = SQL`SELECT id FROM roles WHERE name = ${'admin'}`;
      const subQuery2 = SQL`SELECT id FROM departments WHERE code = ${'IT'}`;
      const mainQuery = asParametrizedSQL(
        SQL`SELECT * FROM users WHERE role_id IN (${subQuery1}) AND dept_id IN (${subQuery2})`,
      );

      assert.deepStrictEqual(mainQuery.sqlChunks, [
        'SELECT * FROM users WHERE role_id IN (',
        'SELECT id FROM roles WHERE name = ',
        '__P__',
        ') AND dept_id IN (',
        'SELECT id FROM departments WHERE code = ',
        '__P__',
        ')',
      ]);
      assert.deepEqual(mainQuery.values, ['admin', 'IT']);
    });
  });

  void describe('special value types', () => {
    void describe('identifier() values', () => {
      void it('should pass through identifier values as parameters', () => {
        const result = asParametrizedSQL(
          SQL`SELECT * FROM ${SQL.identifier('users')}`,
        );

        assert.deepStrictEqual(result.sqlChunks, ['SELECT * FROM ', '__P__']);
        assert.deepEqual(result.values, [SQL.identifier('users')]);
      });

      void it('should pass through all values as parameters', () => {
        const result = asParametrizedSQL(
          SQL`SELECT ${SQL.identifier('name')}, ${SQL.identifier('age')} FROM ${SQL.identifier('users')} WHERE id = ${123}`,
        );

        assert.deepStrictEqual(result.sqlChunks, [
          'SELECT ',
          '__P__',
          ', ',
          '__P__',
          ' FROM ',
          '__P__',
          ' WHERE id = ',
          '__P__',
        ]);
        assert.deepEqual(result.values, [
          SQL.identifier('name'),
          SQL.identifier('age'),
          SQL.identifier('users'),
          123,
        ]);
      });
    });

    void describe('raw() values', () => {
      void it('should inline raw SQL immediately', () => {
        const result = asParametrizedSQL(
          SQL`SELECT * FROM users ${SQL.plain('ORDER BY created_at DESC')}`,
        );

        assert.deepStrictEqual(result.sqlChunks, [
          'SELECT * FROM users ',
          'ORDER BY created_at DESC',
        ]);
        assert.deepEqual(result.values, []);
      });

      void it('should inline raw values and parametrize other values', () => {
        const result = asParametrizedSQL(
          SQL`SELECT * FROM users WHERE ${SQL.plain("status = 'active'")} AND id = ${123}`,
        );

        assert.deepStrictEqual(result.sqlChunks, [
          'SELECT * FROM users WHERE ',
          "status = 'active'",
          ' AND id = ',
          '__P__',
        ]);
        assert.deepEqual(result.values, [123]);
      });
    });

    void describe('mixed special value types', () => {
      void it('should pass through all special types as parameters', () => {
        const result = asParametrizedSQL(SQL`
          SELECT ${SQL.identifier('id')}, ${SQL.identifier('name')}
          FROM ${SQL.identifier('users')}
          WHERE status = ${'active'}
            AND id > ${100}
            ${SQL.plain("AND created_at > NOW() - INTERVAL '7 days'")}
        `);

        assert.deepStrictEqual(result.sqlChunks, [
          '\n          SELECT ',
          '__P__',
          ', ',
          '__P__',
          '\n          FROM ',
          '__P__',
          '\n          WHERE status = ',
          '__P__',
          '\n            AND id > ',
          '__P__',
          '\n            ',
          "AND created_at > NOW() - INTERVAL '7 days'",
          '\n        ',
        ]);
        assert.deepEqual(result.values, [
          SQL.identifier('id'),
          SQL.identifier('name'),
          SQL.identifier('users'),
          'active',
          100,
        ]);
      });

      void it('should maintain sequential parameter numbering', () => {
        const result = asParametrizedSQL(SQL`
          INSERT INTO ${SQL.identifier('logs')} (${SQL.identifier('level')}, message, user_id, ${SQL.plain('created_at')})
          VALUES (${'ERROR'}, ${'Database connection failed'}, ${42}, ${SQL.plain('NOW()')})
        `);

        assert.deepStrictEqual(result.sqlChunks, [
          `
          INSERT INTO `,
          `__P__`,
          ` (`,
          `__P__`,
          `, message, user_id, `,
          `created_at`,
          `)
          VALUES (`,
          `__P__`,
          `, `,
          `__P__`,
          `, `,
          `__P__`,
          `, `,
          `NOW()`,
          `)
        `,
        ]);
        assert.deepEqual(result.values, [
          SQL.identifier('logs'),
          SQL.identifier('level'),
          'ERROR',
          'Database connection failed',
          42,
        ]);
      });
    });
  });
});
