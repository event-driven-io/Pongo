import assert from 'assert';
import { describe, it } from 'node:test';
import { sqliteFormatter } from '.';
import { SQL, isParametrizedSQL, isSQL } from '../../../../../core/sql';

void describe('SQLite SQL Tagged Template Literal', () => {
  void it('should format literals correctly', () => {
    const name: string = 'John Doe';
    const query = SQL`SELECT * FROM users WHERE name = ${SQL.literal(name)};`;

    // Expected output directly without using sqlite-format
    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: 'SELECT * FROM users WHERE name = ?;',
      params: [`'John Doe'`],
    });
  });

  void it('should format identifiers correctly', () => {
    const tableName: string = 'users';
    const columnName: string = 'name';
    const query = SQL`SELECT ${SQL.identifier(columnName)} FROM ${SQL.identifier(tableName)};`;

    // Expected output directly without using sqlite-format
    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: 'SELECT name FROM users;',
      params: [],
    });
  });

  void it('should format identifiers with CAPS correctly', () => {
    const tableName: string = 'Users';
    const columnName: string = 'Name';
    const query = SQL`SELECT ${SQL.identifier(columnName)} FROM ${SQL.identifier(tableName)};`;

    // Expected output directly without using sqlite-format
    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: 'SELECT "Name" FROM "Users";',
      params: [],
    });
  });

  void it('should NOT format plain strings without escaping', () => {
    const unsafeString: string = "some'unsafe";
    const query = SQL`SELECT ${SQL.plain(unsafeString)};`;

    // Plain string without escaping
    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: "SELECT some'unsafe;",
      params: [],
    });
  });

  void it('handles default literal formatting for plain values', () => {
    const name: string = 'John Doe';
    const age: number = 30;
    const query = SQL`INSERT INTO users (name, age) VALUES (${name}, ${age});`;

    // Default literal formatting for plain values
    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: 'INSERT INTO users (name, age) VALUES (?, ?);',
      params: ['John Doe', 30],
    });
  });

  void it('handles mixed types of formatting', () => {
    const name: string = 'John Doe';
    const age: number = 30;
    const table: string = 'users';
    const query = SQL`
      INSERT INTO ${SQL.identifier(table)} (name, age)
      VALUES (${SQL.literal(name)}, ${age})
      RETURNING name, age;
    `;

    // Mixed formatting for identifiers and literals
    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: `
      INSERT INTO users (name, age)
      VALUES (?, ?)
      RETURNING name, age;
    `,
      params: ["'John Doe'", 30],
    });
  });

  void it('should work with raw SQL', () => {
    const rawQuery = SQL`SELECT * FROM users`;
    assert.strictEqual(isSQL(rawQuery), true);
    assert.strictEqual(isParametrizedSQL(rawQuery), true);
    assert.deepStrictEqual(SQL.format(rawQuery, sqliteFormatter), {
      query: 'SELECT * FROM users',
      params: [],
    });
  });

  void it('should NOT recognize valid SQL using isSQL', () => {
    const validSql = SQL`SELECT * FROM users;`;
    const invalidSql = 'SELECT * FROM users;';

    assert.strictEqual(isSQL(validSql), true);
    assert.strictEqual(isSQL(invalidSql), false);
  });

  void it('should escape special characters in literals', () => {
    const unsafeValue: string = "O'Reilly";
    const query = SQL`SELECT * FROM users WHERE name = ${SQL.literal(unsafeValue)};`;

    // SQLite uses the same escaping mechanism as PostgreSQL for single quotes
    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: 'SELECT * FROM users WHERE name = ?;',
      params: ["'O''Reilly'"],
    });
  });

  void it('should correctly format empty strings and falsy values', () => {
    const emptyString: string = '';
    const nullValue: null = null;
    const zeroValue: number = 0;

    const query = SQL`INSERT INTO test (col1, col2, col3)
      VALUES (${SQL.literal(emptyString)}, ${SQL.literal(nullValue)}, ${SQL.literal(zeroValue)});`;

    // Handle empty string, null, and zero correctly
    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: `INSERT INTO test (col1, col2, col3)
      VALUES (?, ?, ?);`,
      params: [`''`, 'NULL', `0`],
    });
  });

  void it('handles arrays of values using literals', () => {
    const values: string[] = ['John', 'Doe', '30'];
    const query = SQL`INSERT INTO users (first_name, last_name, age)
      VALUES (${SQL.literal(values[0])}, ${SQL.literal(values[1])}, ${SQL.literal(values[2])});`;

    // Handle array elements using literal formatting
    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: `INSERT INTO users (first_name, last_name, age)
      VALUES (?, ?, ?);`,
      params: [`'John'`, `'Doe'`, `'30'`],
    });
  });

  void it('handles SQL injections attempts safely', () => {
    const unsafeInput: string = "'; DROP TABLE users; --";
    const query = SQL`SELECT * FROM users WHERE name = ${SQL.literal(unsafeInput)};`;

    // Escape SQL injection attempts correctly
    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: 'SELECT * FROM users WHERE name = ?;',
      params: ["'''; DROP TABLE users; --'"],
    });
  });

  void describe('SQLite Auto-Detection Features', () => {
    void it('should correctly format numbers without quotes', () => {
      const age = 30;
      const query = SQL`SELECT * FROM users WHERE age = ${age};`;
      assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
        query: 'SELECT * FROM users WHERE age = ?;',
        params: [30],
      });
    });
  });

  void it('should correctly format negative numbers and decimals', () => {
    const temperature = -15.5;
    const price = 99.99;
    const query = SQL`SELECT * FROM data WHERE temperature < ${temperature} AND price = ${price};`;
    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: 'SELECT * FROM data WHERE temperature < ? AND price = ?;',
      params: [-15.5, 99.99],
    });
  });

  void it('should correctly format boolean values', () => {
    const isActive = true;
    const isDeleted = false;
    const query = SQL`SELECT * FROM users WHERE is_active = ${isActive} AND is_deleted = ${isDeleted};`;
    // SQLite doesn't have a native boolean type, typically uses 1/0
    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: 'SELECT * FROM users WHERE is_active = ? AND is_deleted = ?;',
      params: [1, 0],
    });
  });

  void it('should correctly format strings with quotes', () => {
    const name = "O'Reilly";
    const query = SQL`SELECT * FROM users WHERE last_name = ${name};`;
    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: 'SELECT * FROM users WHERE last_name = ?;',
      params: ["O'Reilly"],
    });
  });

  void it('should correctly format null and undefined values', () => {
    const nullValue = null;
    const undefinedValue = undefined;
    const query = SQL`SELECT * FROM users WHERE middle_name = ${nullValue} OR nickname = ${undefinedValue};`;
    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: 'SELECT * FROM users WHERE middle_name = ? OR nickname = ?;',
      params: [null, null],
    });
  });

  void it('should correctly format Date objects for SQLite', () => {
    const testDate = new Date('2023-05-15T12:00:00Z');
    const query = SQL`SELECT * FROM events WHERE created_at = ${testDate};`;

    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: 'SELECT * FROM events WHERE created_at = ?;',
      params: [testDate.toISOString()],
    });
  });

  void it('should correctly format arrays as comma-separated values', () => {
    const ids = [1, 2, 3];
    const query = SQL`SELECT * FROM users WHERE id IN ${ids};`;
    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: 'SELECT * FROM users WHERE id IN (?, ?, ?);',
      params: [1, 2, 3],
    });
  });

  void it('handles arrays differently from PostgreSQL', () => {
    const tags = ['admin', 'user'];
    // SQLite doesn't have the && operator for arrays, so common approach is to use JSON functions or LIKE
    const query = SQL`SELECT * FROM users WHERE json_extract(tags, '$') LIKE ${`%${tags[0]}%`};`;
    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: "SELECT * FROM users WHERE json_extract(tags, '$') LIKE ?;",
      params: [`%${tags[0]}%`],
    });
  });

  void it('should correctly format BigInt values', () => {
    const bigId = BigInt('9007199254740991');
    const query = SQL`SELECT * FROM large_tables WHERE id = ${bigId};`;
    // SQLite doesn't have special handling for BigInt, usually stringifies
    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: 'SELECT * FROM large_tables WHERE id = ?;',
      params: [bigId.toString()],
    });
  });

  void it('should correctly format objects as JSON strings', () => {
    const userData = { name: 'John', age: 30, roles: ['admin', 'user'] };
    const query = SQL`INSERT INTO users (data) VALUES (${userData});`;

    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: 'INSERT INTO users (data) VALUES (?);',
      params: [`'{"name":"John","age":30,"roles":["admin","user"]}'`],
    });
  });

  void it('should correctly handle mixed types in a complex query for SQLite', () => {
    const id = 123;
    const name = 'Smith';
    const active = true;
    const createdAt = new Date('2023-01-01T00:00:00Z');
    const tags = ['premium', 'verified'];
    const settings = { notifications: true, theme: 'dark' };

    const query = SQL`
      SELECT * FROM users
      WHERE id = ${id}
      AND last_name = ${name}
      AND is_active = ${active}
      AND created_at > ${createdAt}
      AND (
        json_extract(tags, '$[0]') = ${tags[0]}
        OR json_extract(tags, '$[1]') = ${tags[1]}
      )
      AND json_extract(settings, '$.theme') = ${settings.theme};
    `;

    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: `
      SELECT * FROM users
      WHERE id = ?
      AND last_name = ?
      AND is_active = ?
      AND created_at > ?
      AND (
        json_extract(tags, '$[0]') = ?
        OR json_extract(tags, '$[1]') = ?
      )
      AND json_extract(settings, '$.theme') = ?;
    `,
      params: [
        id,
        name,
        1,
        '2023-01-01T00:00:00.000Z',
        tags[0],
        tags[1],
        settings.theme,
      ],
    });
  });

  void it('should test SQLite-specific RETURNING clause behavior', () => {
    // Note: RETURNING is supported in SQLite 3.35.0 (2021-03-12) and later
    const id = 1;
    const query = SQL`DELETE FROM users WHERE id = ${id} RETURNING id, name;`;

    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: 'DELETE FROM users WHERE id = ? RETURNING id, name;',
      params: [id],
    });
  });

  void it('should test SQLite row value syntax', () => {
    const point = [10, 20];
    // SQLite doesn't have native ROW constructor but supports value lists
    const query = SQL`SELECT * FROM points WHERE (x, y) = (${point[0]}, ${point[1]});`;

    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: 'SELECT * FROM points WHERE (x, y) = (?, ?);',
      params: [10, 20],
    });
  });

  void it('should test SQLite UPSERT syntax', () => {
    const name = 'John';
    const age = 30;
    const query = SQL`
        INSERT INTO users (name, age) VALUES (${name}, ${age})
        ON CONFLICT(name) DO UPDATE SET age = ${age};
      `;

    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: `
        INSERT INTO users (name, age) VALUES (?, ?)
        ON CONFLICT(name) DO UPDATE SET age = ?;
      `,
      params: [name, age, age],
    });
  });

  void it('should test SQLite LIMIT and OFFSET', () => {
    const limit = 10;
    const offset = 20;
    const query = SQL`SELECT * FROM users LIMIT ${limit} OFFSET ${offset};`;

    assert.deepStrictEqual(SQL.format(query, sqliteFormatter), {
      query: 'SELECT * FROM users LIMIT ? OFFSET ?;',
      params: [limit, offset],
    });
  });
});
