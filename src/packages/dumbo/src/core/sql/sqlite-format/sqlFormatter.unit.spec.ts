import assert from 'assert';
import { describe, it } from 'node:test';
import { sqliteFormatter } from '.';
import {
  SQL,
  formatSQL,
  identifier,
  isSQL,
  literal,
  plainString,
  rawSql,
} from '..';

export function processSQLForTesting(sql: SQL): string {
  const formatter = sqliteFormatter;
  return formatSQL(sql, formatter);
}

void describe('SQLite SQL Tagged Template Literal', () => {
  void it('should format literals correctly', () => {
    const name: string = 'John Doe';
    const query = SQL`SELECT * FROM users WHERE name = ${literal(name)};`;

    // Expected output directly without using sqlite-format
    assert.strictEqual(
      processSQLForTesting(query),
      "SELECT * FROM users WHERE name = 'John Doe';",
    );
  });

  void it('should format identifiers correctly', () => {
    const tableName: string = 'users';
    const columnName: string = 'name';
    const query = SQL`SELECT ${identifier(columnName)} FROM ${identifier(tableName)};`;

    // Expected output directly without using sqlite-format
    assert.strictEqual(processSQLForTesting(query), 'SELECT name FROM users;');
  });

  void it('should format identifiers with CAPS correctly', () => {
    const tableName: string = 'Users';
    const columnName: string = 'Name';
    const query = SQL`SELECT ${identifier(columnName)} FROM ${identifier(tableName)};`;

    // Expected output directly without using sqlite-format
    assert.strictEqual(
      processSQLForTesting(query),
      'SELECT "Name" FROM "Users";',
    );
  });

  void it('should NOT format plain strings without escaping', () => {
    const unsafeString: string = "some'unsafe";
    const query = SQL`SELECT ${plainString(unsafeString)};`;

    // Plain string without escaping
    assert.strictEqual(processSQLForTesting(query), "SELECT some'unsafe;");
  });

  void it('should handle default literal formatting for plain values', () => {
    const name: string = 'John Doe';
    const age: number = 30;
    const query = SQL`INSERT INTO users (name, age) VALUES (${name}, ${age});`;

    // Default literal formatting for plain values
    assert.strictEqual(
      processSQLForTesting(query),
      "INSERT INTO users (name, age) VALUES ('John Doe', 30);",
    );
  });

  void it('should handle mixed types of formatting', () => {
    const name: string = 'John Doe';
    const age: number = 30;
    const table: string = 'users';
    const query = SQL`
      INSERT INTO ${identifier(table)} (name, age)
      VALUES (${literal(name)}, ${age})
      RETURNING name, age;
    `;

    // Mixed formatting for identifiers and literals
    assert.strictEqual(
      processSQLForTesting(query),
      `
      INSERT INTO users (name, age)
      VALUES ('John Doe', 30)
      RETURNING name, age;
    `,
    );
  });

  void it('should work with raw SQL', () => {
    const rawQuery: string = rawSql('SELECT * FROM users');
    assert.strictEqual(rawQuery, 'SELECT * FROM users');
    assert.strictEqual(isSQL(rawQuery), true);
  });

  void it('should NOT recognize valid SQL using isSQL', () => {
    const validSql = SQL`SELECT * FROM users;`;
    const invalidSql = 'SELECT * FROM users;';

    assert.strictEqual(isSQL(validSql), true);
    assert.strictEqual(isSQL(invalidSql), true);
  });

  void it('should escape special characters in literals', () => {
    const unsafeValue: string = "O'Reilly";
    const query = SQL`SELECT * FROM users WHERE name = ${literal(unsafeValue)};`;

    // SQLite uses the same escaping mechanism as PostgreSQL for single quotes
    assert.strictEqual(
      processSQLForTesting(query),
      "SELECT * FROM users WHERE name = 'O''Reilly';",
    );
  });

  void it('should correctly format empty strings and falsy values', () => {
    const emptyString: string = '';
    const nullValue: null = null;
    const zeroValue: number = 0;

    const query = SQL`INSERT INTO test (col1, col2, col3)
      VALUES (${literal(emptyString)}, ${literal(nullValue)}, ${literal(zeroValue)});`;

    // Handle empty string, null, and zero correctly
    assert.strictEqual(
      processSQLForTesting(query),
      `INSERT INTO test (col1, col2, col3)
      VALUES ('', NULL, 0);`,
    );
  });

  void it('should handle arrays of values using literals', () => {
    const values: string[] = ['John', 'Doe', '30'];
    const query = SQL`INSERT INTO users (first_name, last_name, age)
      VALUES (${literal(values[0])}, ${literal(values[1])}, ${literal(values[2])});`;

    // Handle array elements using literal formatting
    assert.strictEqual(
      processSQLForTesting(query),
      `INSERT INTO users (first_name, last_name, age)
      VALUES ('John', 'Doe', '30');`,
    );
  });

  void it('should handle SQL injections attempts safely', () => {
    const unsafeInput: string = "'; DROP TABLE users; --";
    const query = SQL`SELECT * FROM users WHERE name = ${literal(unsafeInput)};`;

    // Escape SQL injection attempts correctly
    assert.strictEqual(
      processSQLForTesting(query),
      "SELECT * FROM users WHERE name = '''; DROP TABLE users; --';",
    );
  });

  void describe('SQLite Auto-Detection Features', () => {
    void it('should correctly format numbers without quotes', () => {
      const age = 30;
      const query = SQL`SELECT * FROM users WHERE age = ${age};`;
      assert.strictEqual(
        processSQLForTesting(query),
        'SELECT * FROM users WHERE age = 30;',
      );
    });

    void it('should correctly format negative numbers and decimals', () => {
      const temperature = -15.5;
      const price = 99.99;
      const query = SQL`SELECT * FROM data WHERE temperature < ${temperature} AND price = ${price};`;
      assert.strictEqual(
        processSQLForTesting(query),
        'SELECT * FROM data WHERE temperature < -15.5 AND price = 99.99;',
      );
    });

    void it('should correctly format boolean values', () => {
      const isActive = true;
      const isDeleted = false;
      const query = SQL`SELECT * FROM users WHERE is_active = ${isActive} AND is_deleted = ${isDeleted};`;
      // SQLite doesn't have a native boolean type, typically uses 1/0
      assert.strictEqual(
        processSQLForTesting(query),
        'SELECT * FROM users WHERE is_active = 1 AND is_deleted = 0;',
      );
    });

    void it('should correctly format strings with quotes', () => {
      const name = "O'Reilly";
      const query = SQL`SELECT * FROM users WHERE last_name = ${name};`;
      assert.strictEqual(
        processSQLForTesting(query),
        "SELECT * FROM users WHERE last_name = 'O''Reilly';",
      );
    });

    void it('should correctly format null and undefined values', () => {
      const nullValue = null;
      const undefinedValue = undefined;
      const query = SQL`SELECT * FROM users WHERE middle_name = ${nullValue} OR nickname = ${undefinedValue};`;
      assert.strictEqual(
        processSQLForTesting(query),
        'SELECT * FROM users WHERE middle_name = NULL OR nickname = NULL;',
      );
    });

    void it('should correctly format Date objects for SQLite', () => {
      const testDate = new Date('2023-05-15T12:00:00Z');
      const query = SQL`SELECT * FROM events WHERE created_at = ${testDate};`;
      // SQLite typically stores dates as ISO strings
      assert.match(
        processSQLForTesting(query),
        /SELECT \* FROM events WHERE created_at = '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z';/,
      );
    });

    void it('should correctly format arrays as comma-separated values', () => {
      const ids = [1, 2, 3];
      const query = SQL`SELECT * FROM users WHERE id IN ${ids};`;
      assert.strictEqual(
        processSQLForTesting(query),
        'SELECT * FROM users WHERE id IN (1, 2, 3);',
      );
    });

    void it('should handle arrays differently from PostgreSQL', () => {
      const tags = ['admin', 'user'];
      // SQLite doesn't have the && operator for arrays, so common approach is to use JSON functions or LIKE
      const query = SQL`SELECT * FROM users WHERE json_extract(tags, '$') LIKE ${`%${tags[0]}%`};`;
      assert.strictEqual(
        processSQLForTesting(query),
        "SELECT * FROM users WHERE json_extract(tags, '$') LIKE '%admin%';",
      );
    });

    void it('should correctly format BigInt values', () => {
      const bigId = BigInt('9007199254740991');
      const query = SQL`SELECT * FROM large_tables WHERE id = ${bigId};`;
      // SQLite doesn't have special handling for BigInt, usually stringifies
      assert.strictEqual(
        processSQLForTesting(query),
        'SELECT * FROM large_tables WHERE id = 9007199254740991;',
      );
    });

    void it('should correctly format objects as JSON strings', () => {
      const userData = { name: 'John', age: 30, roles: ['admin', 'user'] };
      const query = SQL`INSERT INTO users (data) VALUES (${userData});`;

      // The exact format might vary depending on your implementation
      // This test asserts that it's properly formatted as a JSON string
      const result = processSQLForTesting(query);
      assert.match(result, /INSERT INTO users \(data\) VALUES \('.*'\);/);

      // Further verify that the string contains valid JSON
      const jsonMatch = result.match(/VALUES \('(.*)'\);/);
      if (jsonMatch && jsonMatch[1]) {
        const jsonStr = jsonMatch[1].replace(/''/g, "'"); // Unescape any SQL quotes
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const parsed = JSON.parse(jsonStr);
          assert.deepStrictEqual(parsed, userData);
        } catch {
          assert.fail(`Failed to parse JSON: ${jsonStr}`);
        }
      } else {
        assert.fail('Failed to extract JSON from query');
      }
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

      const result = processSQLForTesting(query);

      // Basic structure checks for SQLite
      assert.match(result, /id = 123/);
      assert.match(result, /last_name = 'Smith'/);
      assert.match(result, /is_active = 1/);
      assert.match(result, /created_at > '/);
      assert.match(result, /json_extract\(tags, '\$\[0\]'\) = 'premium'/);
      assert.match(result, /json_extract\(settings, '\$\.theme'\) = 'dark'/);
    });

    void it('should test SQLite-specific RETURNING clause behavior', () => {
      // Note: RETURNING is supported in SQLite 3.35.0 (2021-03-12) and later
      const id = 1;
      const query = SQL`DELETE FROM users WHERE id = ${id} RETURNING id, name;`;

      assert.strictEqual(
        processSQLForTesting(query),
        'DELETE FROM users WHERE id = 1 RETURNING id, name;',
      );
    });

    void it('should test SQLite row value syntax', () => {
      const point = [10, 20];
      // SQLite doesn't have native ROW constructor but supports value lists
      const query = SQL`SELECT * FROM points WHERE (x, y) = (${point[0]}, ${point[1]});`;

      assert.strictEqual(
        processSQLForTesting(query),
        'SELECT * FROM points WHERE (x, y) = (10, 20);',
      );
    });

    void it('should test SQLite UPSERT syntax', () => {
      const name = 'John';
      const age = 30;
      const query = SQL`
        INSERT INTO users (name, age) VALUES (${name}, ${age})
        ON CONFLICT(name) DO UPDATE SET age = ${age};
      `;

      assert.strictEqual(
        processSQLForTesting(query),
        `
        INSERT INTO users (name, age) VALUES ('John', 30)
        ON CONFLICT(name) DO UPDATE SET age = 30;
      `,
      );
    });

    void it('should test SQLite LIMIT and OFFSET', () => {
      const limit = 10;
      const offset = 20;
      const query = SQL`SELECT * FROM users LIMIT ${limit} OFFSET ${offset};`;

      assert.strictEqual(
        processSQLForTesting(query),
        'SELECT * FROM users LIMIT 10 OFFSET 20;',
      );
    });
  });
});
