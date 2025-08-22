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
      assert.equal(typeof result.sql, 'string');
      assert.ok(Array.isArray(result.params));
    });
  });

  void describe('basic template literal parametrization', () => {
    void it('should parametrize simple value interpolation', () => {
      const result = asParametrizedSQL(
        SQL`SELECT * FROM users WHERE id = ${123}`,
      );

      assert.equal(result.sql, 'SELECT * FROM users WHERE id = __P__');
      assert.deepEqual(result.params, [123]);
    });

    void it('handles multiple parameters', () => {
      const result = asParametrizedSQL(
        SQL`SELECT * FROM users WHERE id = ${123} AND name = ${'John'}`,
      );

      assert.equal(
        result.sql,
        'SELECT * FROM users WHERE id = __P__ AND name = __P__',
      );
      assert.deepEqual(result.params, [123, 'John']);
    });

    void it('handles no parameters', () => {
      const result = asParametrizedSQL(SQL`SELECT * FROM users`);

      assert.equal(result.sql, 'SELECT * FROM users');
      assert.deepEqual(result.params, []);
    });
  });

  void describe('placeholder generation', () => {
    void it('should generate sequential placeholders', () => {
      const result = asParametrizedSQL(
        SQL`INSERT INTO users (id, name, age) VALUES (${1}, ${'Alice'}, ${30})`,
      );

      assert.equal(
        result.sql,
        'INSERT INTO users (id, name, age) VALUES (__P__, __P__, __P__)',
      );
      assert.deepEqual(result.params, [1, 'Alice', 30]);
    });

    void it('handles many parameters', () => {
      const values = Array.from({ length: 10 }, (_, i) => i + 1);
      const result = asParametrizedSQL(
        SQL`SELECT * FROM table WHERE id IN (${values[0]}, ${values[1]}, ${values[2]}, ${values[3]}, ${values[4]}, ${values[5]}, ${values[6]}, ${values[7]}, ${values[8]}, ${values[9]})`,
      );

      const expectedPlaceholders = values.map(() => `__P__`).join(', ');
      assert.equal(
        result.sql,
        `SELECT * FROM table WHERE id IN (${expectedPlaceholders})`,
      );
      assert.deepEqual(result.params, values);
    });
  });

  void describe('parameter array extraction', () => {
    void it('should extract different value types', () => {
      const date = new Date('2024-01-01');
      const result = asParametrizedSQL(
        SQL`INSERT INTO logs (id, message, created_at, count) VALUES (${123}, ${'test'}, ${date}, ${null})`,
      );

      assert.equal(
        result.sql,
        'INSERT INTO logs (id, message, created_at, count) VALUES (__P__, __P__, __P__, __P__)',
      );
      assert.deepEqual(result.params, [123, 'test', date, null]);
    });

    void it('handles undefined values', () => {
      const result = asParametrizedSQL(
        SQL`SELECT * FROM users WHERE status = ${undefined}`,
      );

      assert.equal(result.sql, 'SELECT * FROM users WHERE status = __P__');
      assert.deepEqual(result.params, [undefined]);
    });
  });

  void describe('nested SQL template flattening', () => {
    void it('should flatten simple nested SQL', () => {
      const subQuery = SQL`SELECT id FROM roles WHERE name = ${'admin'}`;
      const mainQuery = asParametrizedSQL(
        SQL`SELECT * FROM users WHERE role_id IN (${subQuery})`,
      );

      assert.equal(
        mainQuery.sql,
        'SELECT * FROM users WHERE role_id IN (SELECT id FROM roles WHERE name = __P__)',
      );
      assert.deepEqual(mainQuery.params, ['admin']);
    });

    void it('handles deeply nested SQL', () => {
      const inner = SQL`SELECT id FROM permissions WHERE name = ${'read'}`;
      const middle = SQL`SELECT role_id FROM role_permissions WHERE permission_id IN (${inner})`;
      const outer = asParametrizedSQL(
        SQL`SELECT * FROM users WHERE role_id IN (${middle})`,
      );

      assert.equal(
        outer.sql,
        'SELECT * FROM users WHERE role_id IN (SELECT role_id FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE name = __P__))',
      );
      assert.deepEqual(outer.params, ['read']);
    });

    void it('handles multiple nested SQL with parameters', () => {
      const subQuery1 = SQL`SELECT id FROM roles WHERE name = ${'admin'}`;
      const subQuery2 = SQL`SELECT id FROM departments WHERE code = ${'IT'}`;
      const mainQuery = asParametrizedSQL(
        SQL`SELECT * FROM users WHERE role_id IN (${subQuery1}) AND dept_id IN (${subQuery2})`,
      );

      assert.equal(
        mainQuery.sql,
        'SELECT * FROM users WHERE role_id IN (SELECT id FROM roles WHERE name = __P__) AND dept_id IN (SELECT id FROM departments WHERE code = __P__)',
      );
      assert.deepEqual(mainQuery.params, ['admin', 'IT']);
    });
  });

  void describe('special value types', () => {
    void describe('literal() values', () => {
      void it('should pass through literal values as parameters', () => {
        const result = asParametrizedSQL(
          SQL`SELECT * FROM users WHERE name = ${SQL.literal('John')}`,
        );

        assert.equal(result.sql, 'SELECT * FROM users WHERE name = __P__');
        assert.deepEqual(result.params, [SQL.literal('John')]);
      });

      void it('should pass through multiple literal values as parameters', () => {
        const result = asParametrizedSQL(
          SQL`INSERT INTO users (name, age) VALUES (${SQL.literal('Alice')}, ${SQL.literal(25)})`,
        );

        assert.equal(
          result.sql,
          'INSERT INTO users (name, age) VALUES (__P__, __P__)',
        );
        assert.deepEqual(result.params, [
          SQL.literal('Alice'),
          SQL.literal(25),
        ]);
      });
    });

    void describe('identifier() values', () => {
      void it('should pass through identifier values as parameters', () => {
        const result = asParametrizedSQL(
          SQL`SELECT * FROM ${SQL.identifier('users')}`,
        );

        assert.equal(result.sql, 'SELECT * FROM __P__');
        assert.deepEqual(result.params, [SQL.identifier('users')]);
      });

      void it('should pass through all values as parameters', () => {
        const result = asParametrizedSQL(
          SQL`SELECT ${SQL.identifier('name')}, ${SQL.identifier('age')} FROM ${SQL.identifier('users')} WHERE id = ${123}`,
        );

        assert.equal(
          result.sql,
          'SELECT __P__, __P__ FROM __P__ WHERE id = __P__',
        );
        assert.deepEqual(result.params, [
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

        assert.equal(
          result.sql,
          'SELECT * FROM users ORDER BY created_at DESC',
        );
        assert.deepEqual(result.params, []);
      });

      void it('should inline raw values and parametrize other values', () => {
        const result = asParametrizedSQL(
          SQL`SELECT * FROM users WHERE ${SQL.plain("status = 'active'")} AND id = ${123}`,
        );

        assert.equal(
          result.sql,
          "SELECT * FROM users WHERE status = 'active' AND id = __P__",
        );
        assert.deepEqual(result.params, [123]);
      });
    });

    void describe('mixed special value types', () => {
      void it('should pass through all special types as parameters', () => {
        const result = asParametrizedSQL(SQL`
          SELECT ${SQL.identifier('id')}, ${SQL.identifier('name')}
          FROM ${SQL.identifier('users')}
          WHERE status = ${SQL.literal('active')}
            AND id > ${100}
            ${SQL.plain("AND created_at > NOW() - INTERVAL '7 days'")}
        `);

        assert.equal(
          result.sql,
          `
          SELECT __P__, __P__
          FROM __P__
          WHERE status = __P__
            AND id > __P__
            AND created_at > NOW() - INTERVAL '7 days'
        `,
        );
        assert.deepEqual(result.params, [
          SQL.identifier('id'),
          SQL.identifier('name'),
          SQL.identifier('users'),
          SQL.literal('active'),
          100,
        ]);
      });

      void it('should maintain sequential parameter numbering', () => {
        const result = asParametrizedSQL(SQL`
          INSERT INTO ${SQL.identifier('logs')} (${SQL.identifier('level')}, message, user_id, ${SQL.plain('created_at')})
          VALUES (${SQL.literal('ERROR')}, ${'Database connection failed'}, ${42}, ${SQL.plain('NOW()')})
        `);

        assert.equal(
          result.sql,
          `
          INSERT INTO __P__ (__P__, message, user_id, created_at)
          VALUES (__P__, __P__, __P__, NOW())
        `,
        );
        assert.deepEqual(result.params, [
          SQL.identifier('logs'),
          SQL.identifier('level'),
          SQL.literal('ERROR'),
          'Database connection failed',
          42,
        ]);
      });
    });
  });
});
