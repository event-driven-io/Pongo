import assert from 'assert';
import { describe, it } from 'node:test';
import { SQL, identifier, isSQL, literal, plainString, rawSql } from '.';

void describe('SQL Tagged Template Literal', () => {
  void it('should format literals correctly', () => {
    const name: string = 'John Doe';
    const query: string = SQL`SELECT * FROM users WHERE name = ${literal(name)};`;

    // Expected output directly without using pg-format
    assert.strictEqual(query, "SELECT * FROM users WHERE name = 'John Doe';");
  });

  void it('should format identifiers correctly', () => {
    const tableName: string = 'users';
    const columnName: string = 'name';
    const query: string = SQL`SELECT ${identifier(columnName)} FROM ${identifier(tableName)};`;

    // Expected output directly without using pg-format
    assert.strictEqual(query, 'SELECT name FROM users;');
  });

  void it('should format identifiers with CAPS correctly', () => {
    const tableName: string = 'Users';
    const columnName: string = 'Name';
    const query: string = SQL`SELECT ${identifier(columnName)} FROM ${identifier(tableName)};`;

    // Expected output directly without using pg-format
    assert.strictEqual(query, 'SELECT "Name" FROM "Users";');
  });

  void it('should NOT format plain strings without escaping', () => {
    const unsafeString: string = "some'unsafe";
    const query: string = SQL`SELECT ${plainString(unsafeString)};`;

    // Plain string without escaping
    assert.strictEqual(query, "SELECT some'unsafe;");
  });

  void it('should handle default literal formatting for plain values', () => {
    const name: string = 'John Doe';
    const age: number = 30;
    const query: string = SQL`INSERT INTO users (name, age) VALUES (${name}, ${age});`;

    // Default literal formatting for plain values
    assert.strictEqual(
      query,
      "INSERT INTO users (name, age) VALUES ('John Doe', 30);",
    );
  });

  void it('should handle mixed types of formatting', () => {
    const name: string = 'John Doe';
    const age: number = 30;
    const table: string = 'users';
    const query: string = SQL`
      INSERT INTO ${identifier(table)} (name, age)
      VALUES (${literal(name)}, ${age})
      RETURNING name, age;
    `;

    // Mixed formatting for identifiers and literals
    assert.strictEqual(
      query,
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
    const validSql: string = SQL`SELECT * FROM users;`;
    const invalidSql: string = 'SELECT * FROM users;';

    assert.strictEqual(isSQL(validSql), true);
    assert.strictEqual(isSQL(invalidSql), true);
  });

  void it('should escape special characters in literals', () => {
    const unsafeValue: string = "O'Reilly";
    const query: string = SQL`SELECT * FROM users WHERE name = ${literal(unsafeValue)};`;

    // SQL-safe escaping of single quote characters
    assert.strictEqual(query, "SELECT * FROM users WHERE name = 'O''Reilly';");
  });

  void it('should correctly format empty strings and falsy values', () => {
    const emptyString: string = '';
    const nullValue: null = null;
    const zeroValue: number = 0;

    const query: string = SQL`INSERT INTO test (col1, col2, col3)
      VALUES (${literal(emptyString)}, ${literal(nullValue)}, ${literal(zeroValue)});`;

    // Handle empty string, null, and zero correctly
    assert.strictEqual(
      query,
      `INSERT INTO test (col1, col2, col3)
      VALUES ('', NULL, '0');`,
    );
  });

  void it('should handle arrays of values using literals', () => {
    const values: string[] = ['John', 'Doe', '30'];
    const query: string = SQL`INSERT INTO users (first_name, last_name, age)
      VALUES (${literal(values[0])}, ${literal(values[1])}, ${literal(values[2])});`;

    // Handle array elements using literal formatting
    assert.strictEqual(
      query,
      `INSERT INTO users (first_name, last_name, age)
      VALUES ('John', 'Doe', '30');`,
    );
  });

  void it('should handle SQL injections attempts safely', () => {
    const unsafeInput: string = "'; DROP TABLE users; --";
    const query: string = SQL`SELECT * FROM users WHERE name = ${literal(unsafeInput)};`;

    // Escape SQL injection attempts correctly
    assert.strictEqual(
      query,
      "SELECT * FROM users WHERE name = '''; DROP TABLE users; --';",
    );
  });
});
