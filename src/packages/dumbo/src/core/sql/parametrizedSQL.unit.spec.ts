import assert from 'node:assert';
import { describe, it } from 'node:test';
import { SQL, literal, identifier, raw } from './sql';
import { isParametrizedSQL, type ParametrizedSQL } from './parametrizedSQL';

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

      assert.equal(result.sql, 'SELECT * FROM users WHERE id = __P1__');
      assert.deepEqual(result.params, [123]);
    });

    void it('should handle multiple parameters', () => {
      const result = asParametrizedSQL(
        SQL`SELECT * FROM users WHERE id = ${123} AND name = ${'John'}`,
      );

      assert.equal(
        result.sql,
        'SELECT * FROM users WHERE id = __P1__ AND name = __P2__',
      );
      assert.deepEqual(result.params, [123, 'John']);
    });

    void it('should handle no parameters', () => {
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
        'INSERT INTO users (id, name, age) VALUES (__P1__, __P2__, __P3__)',
      );
      assert.deepEqual(result.params, [1, 'Alice', 30]);
    });

    void it('should handle many parameters', () => {
      const values = Array.from({ length: 10 }, (_, i) => i + 1);
      const result = asParametrizedSQL(
        SQL`SELECT * FROM table WHERE id IN (${values[0]}, ${values[1]}, ${values[2]}, ${values[3]}, ${values[4]}, ${values[5]}, ${values[6]}, ${values[7]}, ${values[8]}, ${values[9]})`,
      );

      const expectedPlaceholders = values
        .map((_, i) => `__P${i + 1}__`)
        .join(', ');
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
        'INSERT INTO logs (id, message, created_at, count) VALUES (__P1__, __P2__, __P3__, __P4__)',
      );
      assert.deepEqual(result.params, [123, 'test', date, null]);
    });

    void it('should handle undefined values', () => {
      const result = asParametrizedSQL(
        SQL`SELECT * FROM users WHERE status = ${undefined}`,
      );

      assert.equal(result.sql, 'SELECT * FROM users WHERE status = __P1__');
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
        'SELECT * FROM users WHERE role_id IN (SELECT id FROM roles WHERE name = __P1__)',
      );
      assert.deepEqual(mainQuery.params, ['admin']);
    });

    void it('should handle deeply nested SQL', () => {
      const inner = SQL`SELECT id FROM permissions WHERE name = ${'read'}`;
      const middle = SQL`SELECT role_id FROM role_permissions WHERE permission_id IN (${inner})`;
      const outer = asParametrizedSQL(
        SQL`SELECT * FROM users WHERE role_id IN (${middle})`,
      );

      assert.equal(
        outer.sql,
        'SELECT * FROM users WHERE role_id IN (SELECT role_id FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE name = __P1__))',
      );
      assert.deepEqual(outer.params, ['read']);
    });

    void it('should handle multiple nested SQL with parameters', () => {
      const subQuery1 = SQL`SELECT id FROM roles WHERE name = ${'admin'}`;
      const subQuery2 = SQL`SELECT id FROM departments WHERE code = ${'IT'}`;
      const mainQuery = asParametrizedSQL(
        SQL`SELECT * FROM users WHERE role_id IN (${subQuery1}) AND dept_id IN (${subQuery2})`,
      );

      assert.equal(
        mainQuery.sql,
        'SELECT * FROM users WHERE role_id IN (SELECT id FROM roles WHERE name = __P1__) AND dept_id IN (SELECT id FROM departments WHERE code = __P2__)',
      );
      assert.deepEqual(mainQuery.params, ['admin', 'IT']);
    });
  });

  void describe('special value types', () => {
    void describe('literal() values', () => {
      void it('should pass through literal values as parameters', () => {
        const result = asParametrizedSQL(
          SQL`SELECT * FROM users WHERE name = ${literal('John')}`,
        );

        assert.equal(result.sql, 'SELECT * FROM users WHERE name = __P1__');
        assert.deepEqual(result.params, [literal('John')]);
      });

      void it('should pass through multiple literal values as parameters', () => {
        const result = asParametrizedSQL(
          SQL`INSERT INTO users (name, age) VALUES (${literal('Alice')}, ${literal(25)})`,
        );

        assert.equal(
          result.sql,
          'INSERT INTO users (name, age) VALUES (__P1__, __P2__)',
        );
        assert.deepEqual(result.params, [literal('Alice'), literal(25)]);
      });
    });

    void describe('identifier() values', () => {
      void it('should pass through identifier values as parameters', () => {
        const result = asParametrizedSQL(
          SQL`SELECT * FROM ${identifier('users')}`,
        );

        assert.equal(result.sql, 'SELECT * FROM __P1__');
        assert.deepEqual(result.params, [identifier('users')]);
      });

      void it('should pass through all values as parameters', () => {
        const result = asParametrizedSQL(
          SQL`SELECT ${identifier('name')}, ${identifier('age')} FROM ${identifier('users')} WHERE id = ${123}`,
        );

        assert.equal(
          result.sql,
          'SELECT __P1__, __P2__ FROM __P3__ WHERE id = __P4__',
        );
        assert.deepEqual(result.params, [
          identifier('name'),
          identifier('age'),
          identifier('users'),
          123,
        ]);
      });
    });

    void describe('raw() values', () => {
      void it('should pass through raw SQL as parameters', () => {
        const result = asParametrizedSQL(
          SQL`SELECT * FROM users ${raw('ORDER BY created_at DESC')}`,
        );

        assert.equal(result.sql, 'SELECT * FROM users __P1__');
        assert.deepEqual(result.params, [raw('ORDER BY created_at DESC')]);
      });

      void it('should pass through all mixed values as parameters', () => {
        const result = asParametrizedSQL(
          SQL`SELECT * FROM users WHERE ${raw("status = 'active'")} AND id = ${123}`,
        );

        assert.equal(
          result.sql,
          'SELECT * FROM users WHERE __P1__ AND id = __P2__',
        );
        assert.deepEqual(result.params, [raw("status = 'active'"), 123]);
      });
    });

    void describe('mixed special value types', () => {
      void it('should pass through all special types as parameters', () => {
        const result = asParametrizedSQL(SQL`
          SELECT ${identifier('id')}, ${identifier('name')}
          FROM ${identifier('users')}
          WHERE status = ${literal('active')}
            AND id > ${100}
            ${raw("AND created_at > NOW() - INTERVAL '7 days'")}
        `);

        assert.equal(
          result.sql,
          `
          SELECT __P1__, __P2__
          FROM __P3__
          WHERE status = __P4__
            AND id > __P5__
            __P6__
        `,
        );
        assert.deepEqual(result.params, [
          identifier('id'),
          identifier('name'),
          identifier('users'),
          literal('active'),
          100,
          raw("AND created_at > NOW() - INTERVAL '7 days'"),
        ]);
      });

      void it('should maintain sequential parameter numbering', () => {
        const result = asParametrizedSQL(SQL`
          INSERT INTO ${identifier('logs')} (${identifier('level')}, message, user_id, ${raw('created_at')})
          VALUES (${literal('ERROR')}, ${'Database connection failed'}, ${42}, ${raw('NOW()')})
        `);

        assert.equal(
          result.sql,
          `
          INSERT INTO __P1__ (__P2__, message, user_id, __P3__)
          VALUES (__P4__, __P5__, __P6__, __P7__)
        `,
        );
        assert.deepEqual(result.params, [
          identifier('logs'),
          identifier('level'),
          raw('created_at'),
          literal('ERROR'),
          'Database connection failed',
          42,
          raw('NOW()'),
        ]);
      });
    });
  });
});
