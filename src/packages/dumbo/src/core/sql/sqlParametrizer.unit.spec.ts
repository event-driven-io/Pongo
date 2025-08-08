import assert from 'node:assert';
import { describe, it } from 'node:test';
import { SQL, literal, identifier, raw } from './sql';
import { parametrizeSQL } from './sqlParametrizer';

void describe('SQL Parametrizer', () => {
  void describe('ParametrizedSQL interface structure', () => {
    void it('should have correct interface structure', () => {
      const sql = SQL`SELECT * FROM users`;
      const result = parametrizeSQL(sql);

      assert.equal(result.__brand, 'parametrized-sql');
      assert.equal(typeof result.sql, 'string');
      assert.ok(Array.isArray(result.params));
    });
  });

  void describe('basic template literal parametrization', () => {
    void it('should parametrize simple value interpolation', () => {
      const sql = SQL`SELECT * FROM users WHERE id = ${123}`;
      const result = parametrizeSQL(sql);

      assert.equal(result.sql, 'SELECT * FROM users WHERE id = __P1__');
      assert.deepEqual(result.params, [123]);
    });

    void it('should handle multiple parameters', () => {
      const sql = SQL`SELECT * FROM users WHERE id = ${123} AND name = ${'John'}`;
      const result = parametrizeSQL(sql);

      assert.equal(
        result.sql,
        'SELECT * FROM users WHERE id = __P1__ AND name = __P2__',
      );
      assert.deepEqual(result.params, [123, 'John']);
    });

    void it('should handle no parameters', () => {
      const sql = SQL`SELECT * FROM users`;
      const result = parametrizeSQL(sql);

      assert.equal(result.sql, 'SELECT * FROM users');
      assert.deepEqual(result.params, []);
    });
  });

  void describe('placeholder generation', () => {
    void it('should generate sequential placeholders', () => {
      const sql = SQL`INSERT INTO users (id, name, age) VALUES (${1}, ${'Alice'}, ${30})`;
      const result = parametrizeSQL(sql);

      assert.equal(
        result.sql,
        'INSERT INTO users (id, name, age) VALUES (__P1__, __P2__, __P3__)',
      );
      assert.deepEqual(result.params, [1, 'Alice', 30]);
    });

    void it('should handle many parameters', () => {
      const values = Array.from({ length: 10 }, (_, i) => i + 1);
      const sql = SQL`SELECT * FROM table WHERE id IN (${values[0]}, ${values[1]}, ${values[2]}, ${values[3]}, ${values[4]}, ${values[5]}, ${values[6]}, ${values[7]}, ${values[8]}, ${values[9]})`;
      const result = parametrizeSQL(sql);

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
      const sql = SQL`INSERT INTO logs (id, message, created_at, count) VALUES (${123}, ${'test'}, ${date}, ${null})`;
      const result = parametrizeSQL(sql);

      assert.equal(
        result.sql,
        'INSERT INTO logs (id, message, created_at, count) VALUES (__P1__, __P2__, __P3__, __P4__)',
      );
      assert.deepEqual(result.params, [123, 'test', date, null]);
    });

    void it('should handle undefined values', () => {
      const sql = SQL`SELECT * FROM users WHERE status = ${undefined}`;
      const result = parametrizeSQL(sql);

      assert.equal(result.sql, 'SELECT * FROM users WHERE status = __P1__');
      assert.deepEqual(result.params, [undefined]);
    });
  });

  void describe('nested SQL template flattening', () => {
    void it('should flatten simple nested SQL', () => {
      const subQuery = SQL`SELECT id FROM roles WHERE name = ${'admin'}`;
      const mainQuery = SQL`SELECT * FROM users WHERE role_id IN (${subQuery})`;
      const result = parametrizeSQL(mainQuery);

      assert.equal(
        result.sql,
        'SELECT * FROM users WHERE role_id IN (SELECT id FROM roles WHERE name = __P1__)',
      );
      assert.deepEqual(result.params, ['admin']);
    });

    void it('should handle deeply nested SQL', () => {
      const inner = SQL`SELECT id FROM permissions WHERE name = ${'read'}`;
      const middle = SQL`SELECT role_id FROM role_permissions WHERE permission_id IN (${inner})`;
      const outer = SQL`SELECT * FROM users WHERE role_id IN (${middle})`;
      const result = parametrizeSQL(outer);

      assert.equal(
        result.sql,
        'SELECT * FROM users WHERE role_id IN (SELECT role_id FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE name = __P1__))',
      );
      assert.deepEqual(result.params, ['read']);
    });

    void it('should handle multiple nested SQL with parameters', () => {
      const subQuery1 = SQL`SELECT id FROM roles WHERE name = ${'admin'}`;
      const subQuery2 = SQL`SELECT id FROM departments WHERE code = ${'IT'}`;
      const mainQuery = SQL`SELECT * FROM users WHERE role_id IN (${subQuery1}) AND dept_id IN (${subQuery2})`;
      const result = parametrizeSQL(mainQuery);

      assert.equal(
        result.sql,
        'SELECT * FROM users WHERE role_id IN (SELECT id FROM roles WHERE name = __P1__) AND dept_id IN (SELECT id FROM departments WHERE code = __P2__)',
      );
      assert.deepEqual(result.params, ['admin', 'IT']);
    });
  });

  void describe('special value types', () => {
    void describe('literal() values', () => {
      void it('should parametrize literal values', () => {
        const sql = SQL`SELECT * FROM users WHERE name = ${literal('John')}`;
        const result = parametrizeSQL(sql);

        assert.equal(result.sql, 'SELECT * FROM users WHERE name = __P1__');
        assert.deepEqual(result.params, ['John']);
      });

      void it('should handle multiple literal values', () => {
        const sql = SQL`INSERT INTO users (name, age) VALUES (${literal('Alice')}, ${literal(25)})`;
        const result = parametrizeSQL(sql);

        assert.equal(
          result.sql,
          'INSERT INTO users (name, age) VALUES (__P1__, __P2__)',
        );
        assert.deepEqual(result.params, ['Alice', 25]);
      });
    });

    void describe('identifier() values', () => {
      void it('should inline identifier values without parametrization', () => {
        const sql = SQL`SELECT * FROM ${identifier('users')}`;
        const result = parametrizeSQL(sql);

        assert.equal(result.sql, 'SELECT * FROM "users"');
        assert.deepEqual(result.params, []);
      });

      void it('should handle mixed identifiers and parameters', () => {
        const sql = SQL`SELECT ${identifier('name')}, ${identifier('age')} FROM ${identifier('users')} WHERE id = ${123}`;
        const result = parametrizeSQL(sql);

        assert.equal(
          result.sql,
          'SELECT "name", "age" FROM "users" WHERE id = __P1__',
        );
        assert.deepEqual(result.params, [123]);
      });
    });

    void describe('raw() values', () => {
      void it('should inline raw SQL without parametrization', () => {
        const sql = SQL`SELECT * FROM users ${raw('ORDER BY created_at DESC')}`;
        const result = parametrizeSQL(sql);

        assert.equal(
          result.sql,
          'SELECT * FROM users ORDER BY created_at DESC',
        );
        assert.deepEqual(result.params, []);
      });

      void it('should handle mixed raw and parametrized values', () => {
        const sql = SQL`SELECT * FROM users WHERE ${raw("status = 'active'")} AND id = ${123}`;
        const result = parametrizeSQL(sql);

        assert.equal(
          result.sql,
          "SELECT * FROM users WHERE status = 'active' AND id = __P1__",
        );
        assert.deepEqual(result.params, [123]);
      });
    });

    void describe('mixed special value types', () => {
      void it('should handle all types together correctly', () => {
        const sql = SQL`
          SELECT ${identifier('id')}, ${identifier('name')}
          FROM ${identifier('users')}
          WHERE status = ${literal('active')}
            AND id > ${100}
            ${raw("AND created_at > NOW() - INTERVAL '7 days'")}
        `;
        const result = parametrizeSQL(sql);

        assert.equal(
          result.sql,
          `
          SELECT "id", "name"
          FROM "users"
          WHERE status = __P1__
            AND id > __P2__
            AND created_at > NOW() - INTERVAL '7 days'
        `,
        );
        assert.deepEqual(result.params, ['active', 100]);
      });

      void it('should maintain correct parameter numbering with mixed types', () => {
        const sql = SQL`
          INSERT INTO ${identifier('logs')} (${identifier('level')}, message, user_id, ${raw('created_at')})
          VALUES (${literal('ERROR')}, ${'Database connection failed'}, ${42}, ${raw('NOW()')})
        `;
        const result = parametrizeSQL(sql);

        assert.equal(
          result.sql,
          `
          INSERT INTO "logs" ("level", message, user_id, created_at)
          VALUES (__P1__, __P2__, __P3__, NOW())
        `,
        );
        assert.deepEqual(result.params, [
          'ERROR',
          'Database connection failed',
          42,
        ]);
      });
    });
  });
});
