import assert from 'node:assert';
import { describe, it } from 'node:test';
import { SQL } from '../../../../../core/sql';
import { sqliteFormatter } from './index';

void describe('SQLite Parametrized Formatter', () => {
  void describe('format method', () => {
    void it('should convert basic parametrized SQL to SQLite format', () => {
      const sql = SQL`SELECT * FROM users WHERE id = ${123}`;
      const result = sqliteFormatter.format(sql);

      assert.deepStrictEqual(result, {
        query: 'SELECT * FROM users WHERE id = ?',
        params: [123],
      });
    });

    void it('handles identifiers by inlining them', () => {
      const sql = SQL`CREATE TABLE ${SQL.identifier('users')} (id INTEGER, name TEXT)`;
      const result = sqliteFormatter.format(sql);

      assert.deepStrictEqual(result, {
        query: 'CREATE TABLE users (id INTEGER, name TEXT)',
        params: [],
      });
    });

    void it('handles quoted identifiers correctly', () => {
      const sql = SQL`CREATE TABLE ${SQL.identifier('User Table')} (id INTEGER)`;
      const result = sqliteFormatter.format(sql);

      assert.deepStrictEqual(result, {
        query: 'CREATE TABLE "User Table" (id INTEGER)',
        params: [],
      });
    });

    void it('should mix identifiers and parameters correctly', () => {
      const sql = SQL`SELECT ${SQL.identifier('name')} FROM ${SQL.identifier('users')} WHERE id = ${123}`;
      const result = sqliteFormatter.format(sql);

      assert.deepStrictEqual(result, {
        query: 'SELECT name FROM users WHERE id = ?',
        params: [123],
      });
    });

    void it('handles arrays by expanding to individual parameters', () => {
      const ids = ['id1', 'id2', 'id3'];
      const sql = SQL`SELECT * FROM users WHERE _id IN ${ids}`;
      const result = sqliteFormatter.format(sql);

      assert.deepStrictEqual(result, {
        query: `SELECT * FROM users WHERE _id IN (?, ?, ?)`,
        params: ['id1', 'id2', 'id3'],
      });
    });

    void it('throws error for empty arrays in IN clauses', () => {
      const ids: string[] = [];

      assert.throws(
        () => SQL`SELECT * FROM users WHERE _id IN ${ids}`,
        /Empty arrays in IN clauses are not supported/,
      );
    });

    void it('handles multiple parameters', () => {
      const sql = SQL`SELECT * FROM users WHERE id = ${123} AND name = ${'John'}`;
      const result = sqliteFormatter.format(sql);

      assert.deepStrictEqual(result, {
        query: 'SELECT * FROM users WHERE id = ? AND name = ?',
        params: [123, 'John'],
      });
    });

    void it('handles nested SQL', () => {
      const innerSql = SQL`status = ${'active'}`;
      const outerSql = SQL`SELECT * FROM users WHERE ${innerSql} AND id = ${456}`;
      const result = sqliteFormatter.format(outerSql);

      assert.deepStrictEqual(result, {
        query: 'SELECT * FROM users WHERE status = ? AND id = ?',
        params: ['active', 456],
      });
    });

    void it('handles array of SQL', () => {
      const sql1 = SQL`INSERT INTO users (name) VALUES (${'Alice'})`;
      const sql2 = SQL`INSERT INTO users (name) VALUES (${'Bob'})`;
      const result = sqliteFormatter.format([sql1, sql2]);

      assert.deepStrictEqual(result, {
        query:
          'INSERT INTO users (name) VALUES (?)\nINSERT INTO users (name) VALUES (?)',
        params: ['Alice', 'Bob'],
      });
    });

    void it('handles special value types', () => {
      const date = new Date('2023-01-01T00:00:00.000Z');
      const bigint = BigInt(123456789012345);
      const obj = { key: 'value' };

      const sql = SQL`INSERT INTO test (date, bigint, json) VALUES (${date}, ${bigint}, ${obj})`;
      const result = sqliteFormatter.format(sql);

      assert.deepStrictEqual(result, {
        query: 'INSERT INTO test (date, bigint, json) VALUES (?, ?, ?)',
        params: [
          '2023-01-01T00:00:00.000Z',
          '123456789012345',
          `'{"key":"value"}'`,
        ],
      });
    });

    void it('handles boolean values', () => {
      const sql = SQL`INSERT INTO test (active, inactive) VALUES (${true}, ${false})`;
      const result = sqliteFormatter.format(sql);

      assert.deepStrictEqual(result, {
        query: 'INSERT INTO test (active, inactive) VALUES (?, ?)',
        params: [1, 0],
      });
    });

    void it('handles empty parameters', () => {
      const sql = SQL`SELECT * FROM users`;
      const result = sqliteFormatter.format(sql);

      assert.deepStrictEqual(result, {
        query: 'SELECT * FROM users',
        params: [],
      });
    });

    void it('throws error for non-parametrized SQL', () => {
      assert.throws(() => {
        sqliteFormatter.format('SELECT * FROM users' as SQL);
      }, /Expected ParametrizedSQL, got string-based SQL/);
    });
  });

  void describe('formatRaw method', () => {
    void it('should return inline formatted SQL string', () => {
      const sql = SQL`SELECT * FROM users WHERE id = ${123} AND name = ${'John'}`;
      const result = sqliteFormatter.describe(sql);

      assert.strictEqual(typeof result, 'string');
      assert.ok(result.includes('123'));
      assert.ok(result.includes('John'));
    });

    void it('handles array of SQL', () => {
      const sql1 = SQL`SELECT ${123}`;
      const sql2 = SQL`SELECT ${'test'}`;
      const result = sqliteFormatter.describe([sql1, sql2]);

      assert.strictEqual(typeof result, 'string');
      assert.ok(result.includes('123'));
      assert.ok(result.includes('test'));
      assert.ok(result.includes('\n'));
    });
  });

  void describe('mapSQLValue method', () => {
    void it('handles basic types', () => {
      assert.strictEqual(sqliteFormatter.params.mapParam(123), 123);
      assert.strictEqual(sqliteFormatter.params.mapParam('test'), 'test');
      assert.strictEqual(sqliteFormatter.params.mapParam(null), null);
      assert.strictEqual(sqliteFormatter.params.mapParam(undefined), null);
    });

    void it('handles SQLite-specific type conversions', () => {
      // Boolean conversion
      assert.strictEqual(sqliteFormatter.params.mapParam(true), 1);
      assert.strictEqual(sqliteFormatter.params.mapParam(false), 0);

      // Date conversion
      const date = new Date('2023-01-01T00:00:00.000Z');
      assert.strictEqual(
        sqliteFormatter.params.mapParam(date),
        '2023-01-01T00:00:00.000Z',
      );

      // BigInt conversion
      const bigint = BigInt(123456789012345);
      assert.strictEqual(
        sqliteFormatter.params.mapParam(bigint),
        '123456789012345',
      );
    });

    void it('handles SQL wrapper types', () => {
      // Valid unquoted identifier (lowercase, no special chars)
      const validIdentResult = sqliteFormatter.params.mapParam(
        SQL.identifier('table_name'),
      );
      assert.strictEqual(validIdentResult, 'table_name');

      // Invalid identifier that needs quoting (mixed case)
      const quotedIdentResult = sqliteFormatter.params.mapParam(
        SQL.identifier('TableName'),
      );
      assert.strictEqual(quotedIdentResult, '"TableName"');

      const literalResult = sqliteFormatter.params.mapParam(
        SQL.literal('value'),
      );
      assert.strictEqual(literalResult, "'value'");

      const rawResult = sqliteFormatter.params.mapParam(
        SQL.plain('CURRENT_TIMESTAMP'),
      );
      assert.strictEqual(rawResult, 'CURRENT_TIMESTAMP');
    });

    void it('handles nested SQL', () => {
      const nestedSql = SQL`SELECT ${123}`;
      const result = sqliteFormatter.params.mapParam(nestedSql);
      assert.strictEqual(typeof result, 'string');
      assert.ok((result as string).includes('123'));
    });

    void it('handles complex types', () => {
      const obj = { key: 'value' };
      const objResult = sqliteFormatter.params.mapParam(obj);
      assert.ok(typeof objResult === 'string');
      assert.ok(objResult.includes('{"key":"value"}'));
    });
  });
});
