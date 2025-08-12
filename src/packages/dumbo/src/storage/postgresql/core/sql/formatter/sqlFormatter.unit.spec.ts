import assert from 'assert';
import { describe, it } from 'node:test';
import { pgFormatter } from '.';
import { SQL, formatSQLRaw, isSQL } from '../../../../../core';

export function processSQLForTesting(sql: SQL): string {
  const formatter = pgFormatter;
  return formatSQLRaw(sql, formatter);
}

void describe('SQL Tagged Template Literal', () => {
  void it('should format literals correctly', () => {
    const name: string = 'John Doe';
    const query = SQL`SELECT * FROM users WHERE name = ${SQL.literal(name)};`;

    // Expected output directly without using pg-format
    assert.strictEqual(
      processSQLForTesting(query),
      "SELECT * FROM users WHERE name = 'John Doe';",
    );
  });

  void it('should format identifiers correctly', () => {
    const tableName: string = 'users';
    const columnName: string = 'name';
    const query = SQL`SELECT ${SQL.identifier(columnName)} FROM ${SQL.identifier(tableName)};`;

    // Expected output directly without using pg-format
    assert.strictEqual(processSQLForTesting(query), 'SELECT name FROM users;');
  });

  void it('should format identifiers with CAPS correctly', () => {
    const tableName: string = 'Users';
    const columnName: string = 'Name';
    const query = SQL`SELECT ${SQL.identifier(columnName)} FROM ${SQL.identifier(tableName)};`;

    // Expected output directly without using pg-format
    assert.strictEqual(
      processSQLForTesting(query),
      'SELECT "Name" FROM "Users";',
    );
  });

  void it('should NOT format plain strings without escaping', () => {
    const unsafeString: string = "some'unsafe";
    const query = SQL`SELECT ${SQL.plain(unsafeString)};`;

    // Plain string without escaping
    assert.strictEqual(processSQLForTesting(query), "SELECT some'unsafe;");
  });

  void it('handles default literal formatting for plain values', () => {
    const name: string = 'John Doe';
    const age: number = 30;
    const query = SQL`INSERT INTO users (name, age) VALUES (${name}, ${age});`;

    // Default literal formatting for plain values
    assert.strictEqual(
      processSQLForTesting(query),
      "INSERT INTO users (name, age) VALUES ('John Doe', 30);",
    );
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
    const rawQuery = SQL`SELECT * FROM users`;
    assert.strictEqual(
      SQL.format(rawQuery, pgFormatter),
      'SELECT * FROM users',
    );
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

    // SQL-safe escaping of single quote characters
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
      VALUES (${SQL.literal(emptyString)}, ${SQL.literal(nullValue)}, ${SQL.literal(zeroValue)});`;

    // Handle empty string, null, and zero correctly
    assert.strictEqual(
      processSQLForTesting(query),
      `INSERT INTO test (col1, col2, col3)
      VALUES ('', NULL, '0');`,
    );
  });

  void it('handles arrays of values using literals', () => {
    const values: string[] = ['John', 'Doe', '30'];
    const query = SQL`INSERT INTO users (first_name, last_name, age)
      VALUES (${SQL.literal(values[0])}, ${SQL.literal(values[1])}, ${SQL.literal(values[2])});`;

    // Handle array elements using literal formatting
    assert.strictEqual(
      processSQLForTesting(query),
      `INSERT INTO users (first_name, last_name, age)
      VALUES ('John', 'Doe', '30');`,
    );
  });

  void it('handles SQL injections attempts safely', () => {
    const unsafeInput: string = "'; DROP TABLE users; --";
    const query = SQL`SELECT * FROM users WHERE name = ${SQL.literal(unsafeInput)};`;

    // Escape SQL injection attempts correctly
    assert.strictEqual(
      processSQLForTesting(query),
      "SELECT * FROM users WHERE name = '''; DROP TABLE users; --';",
    );
  });

  void describe('SQL Auto-Detection Features', () => {
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
      assert.strictEqual(
        processSQLForTesting(query),
        "SELECT * FROM users WHERE is_active = 't' AND is_deleted = 'f';",
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

    void it('should correctly format Date objects', () => {
      const testDate = new Date('2023-05-15T12:00:00Z');
      const query = SQL`SELECT * FROM events WHERE created_at = ${testDate};`;
      // Updated regex to match the standard PostgreSQL timestamp format with timezone
      assert.match(
        processSQLForTesting(query),
        /SELECT \* FROM events WHERE created_at = '\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\+00';/,
      );
    });

    void it('should correctly format arrays', () => {
      const ids = [1, 2, 3];
      const query = SQL`SELECT * FROM users WHERE id IN ${ids};`;
      assert.strictEqual(
        processSQLForTesting(query),
        'SELECT * FROM users WHERE id IN (1, 2, 3);',
      );
    });

    void it('should correctly format nested arrays', () => {
      const points = [
        [1, 2],
        [3, 4],
        [5, 6],
      ];
      const query = SQL`SELECT * FROM coordinates WHERE point IN ${points};`;
      assert.strictEqual(
        processSQLForTesting(query),
        'SELECT * FROM coordinates WHERE point IN ((1, 2), (3, 4), (5, 6));',
      );
    });

    void it('should correctly format BigInt values', () => {
      const bigId = BigInt('9007199254740991');
      const query = SQL`SELECT * FROM large_tables WHERE id = ${bigId};`;
      assert.strictEqual(
        processSQLForTesting(query),
        'SELECT * FROM large_tables WHERE id = 9007199254740991;',
      );
    });

    void it('should correctly format objects as JSON', () => {
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

    void it('should correctly handle mixed types in a complex query', () => {
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
      AND tags && ${tags}
      AND settings @> ${settings};
    `;

      const result = processSQLForTesting(query);

      // Basic structure checks
      assert.match(result, /id = 123/);
      assert.match(result, /last_name = 'Smith'/);
      assert.match(result, /is_active = 't'/);
      assert.match(result, /created_at > '/);
      assert.match(result, /tags && \('premium', 'verified'\)/);
      assert.match(result, /settings @> '/);
    });
  });
});
