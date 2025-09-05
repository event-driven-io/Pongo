import assert from 'node:assert';
import { describe, it } from 'node:test';
import { mapSQLParamValue, SQL } from '../../../../../core/sql';
import { pgFormatter } from './index';

void describe('PostgreSQL Parametrized Formatter', () => {
  void describe('format method', () => {
    void it('should convert basic parametrized SQL to PostgreSQL format', () => {
      const sql = SQL`SELECT * FROM users WHERE id = ${123}`;
      const result = pgFormatter.format(sql);

      assert.deepStrictEqual(result, {
        query: 'SELECT * FROM users WHERE id = $1',
        params: [123],
      });
    });

    void it('handles identifiers by inlining them', () => {
      const sql = SQL`CREATE TABLE ${SQL.identifier('users')} (id INTEGER, name TEXT)`;
      const result = pgFormatter.format(sql);

      assert.deepStrictEqual(result, {
        query: 'CREATE TABLE users (id INTEGER, name TEXT)',
        params: [],
      });
    });

    void it('handles quoted identifiers correctly', () => {
      const sql = SQL`CREATE TABLE ${SQL.identifier('User Table')} (id INTEGER)`;
      const result = pgFormatter.format(sql);

      assert.deepStrictEqual(result, {
        query: 'CREATE TABLE "User Table" (id INTEGER)',
        params: [],
      });
    });

    void it('should mix identifiers and parameters correctly', () => {
      const sql = SQL`SELECT ${SQL.identifier('name')} FROM ${SQL.identifier('users')} WHERE id = ${123}`;
      const result = pgFormatter.format(sql);

      assert.deepStrictEqual(result, {
        query: 'SELECT name FROM users WHERE id = $1',
        params: [123],
      });
    });

    void it('handles arrays by expanding to individual parameters', () => {
      const ids = ['id1', 'id2', 'id3'];
      const sql = SQL`SELECT * FROM users WHERE _id IN ${ids}`;
      const result = pgFormatter.format(sql);

      assert.deepStrictEqual(result, {
        query: `SELECT * FROM users WHERE _id IN ($1, $2, $3)`,
        params: ['id1', 'id2', 'id3'],
      });
    });

    void it('handles multiple parameters', () => {
      const sql = SQL`SELECT * FROM users WHERE id = ${123} AND name = ${'John'}`;
      const result = pgFormatter.format(sql);

      assert.deepStrictEqual(result, {
        query: 'SELECT * FROM users WHERE id = $1 AND name = $2',
        params: [123, 'John'],
      });
    });

    void it('handles nested SQL', () => {
      const innerSql = SQL`status = ${'active'}`;
      const outerSql = SQL`SELECT * FROM users WHERE ${innerSql} AND id = ${456}`;
      const result = pgFormatter.format(outerSql);

      assert.deepStrictEqual(result, {
        query: 'SELECT * FROM users WHERE status = $1 AND id = $2',
        params: ['active', 456],
      });
    });

    void it('handles array of SQL', () => {
      const sql1 = SQL`INSERT INTO users (name) VALUES (${'Alice'})`;
      const sql2 = SQL`INSERT INTO users (name) VALUES (${'Bob'})`;
      const result = pgFormatter.format([sql1, sql2]);

      assert.deepStrictEqual(result, {
        query:
          'INSERT INTO users (name) VALUES ($1)\nINSERT INTO users (name) VALUES ($2)',
        params: ['Alice', 'Bob'],
      });
    });

    void it('handles special value types', () => {
      const date = new Date('2023-01-01T00:00:00.000Z');
      const bigint = BigInt(123456789012345);
      const obj = { key: 'value' };

      const sql = SQL`INSERT INTO test (date, bigint, json) VALUES (${date}, ${bigint}, ${obj})`;
      const result = pgFormatter.format(sql);

      assert.deepStrictEqual(result, {
        query: 'INSERT INTO test (date, bigint, json) VALUES ($1, $2, $3)',
        params: [
          '2023-01-01 00:00:00.000+00',
          '123456789012345',
          `{"key":"value"}`,
        ],
      });
    });

    void it('handles empty parameters', () => {
      const sql = SQL`SELECT * FROM users`;
      const result = pgFormatter.format(sql);

      assert.deepStrictEqual(result, {
        query: 'SELECT * FROM users',
        params: [],
      });
    });

    void it('throws error for non-parametrized SQL', () => {
      assert.throws(() => {
        pgFormatter.format('SELECT * FROM users' as SQL);
      }, /Expected ParametrizedSQL, got string-based SQL/);
    });
  });

  void describe('formatRaw method', () => {
    void it('should return inline formatted SQL string', () => {
      const sql = SQL`SELECT * FROM users WHERE id = ${123} AND name = ${'John'}`;
      const result = pgFormatter.describe(sql);

      assert.strictEqual(typeof result, 'string');
      assert.ok(result.includes('123'));
      assert.ok(result.includes('John'));
    });

    void it('handles array of SQL', () => {
      const sql1 = SQL`SELECT ${123}`;
      const sql2 = SQL`SELECT ${'test'}`;
      const result = pgFormatter.describe([sql1, sql2]);

      assert.strictEqual(typeof result, 'string');
      assert.ok(result.includes('123'));
      assert.ok(result.includes('test'));
      assert.ok(result.includes('\n'));
    });
  });

  void describe('mapSQLValue method', () => {
    void it('handles basic types', () => {
      assert.strictEqual(mapSQLParamValue(123, pgFormatter.params), 123);
      assert.strictEqual(mapSQLParamValue('test', pgFormatter.params), 'test');
      assert.strictEqual(mapSQLParamValue(null, pgFormatter.params), null);
      assert.strictEqual(mapSQLParamValue(undefined, pgFormatter.params), null);
    });

    void it('handles SQL identifier type', () => {
      // Valid unquoted identifier (lowercase, no special chars)
      const validIdentResult = mapSQLParamValue(
        SQL.identifier('table_name'),
        pgFormatter.params,
      );
      assert.strictEqual(validIdentResult, 'table_name');

      // Invalid identifier that needs quoting (mixed case)
      const quotedIdentResult = mapSQLParamValue(
        SQL.identifier('TableName'),
        pgFormatter.params,
      );
      assert.strictEqual(quotedIdentResult, '"TableName"');
    });

    void it('handles nested SQL', () => {
      const nestedSql = SQL`SELECT ${123}`;
      const result = mapSQLParamValue(nestedSql, pgFormatter.params);
      assert.strictEqual(typeof result, 'string');
      assert.ok((result as string).includes('123'));
    });

    void it('handles complex types', () => {
      const date = new Date('2023-01-01T00:00:00.000Z');
      const dateResult = mapSQLParamValue(date, pgFormatter.params);
      assert.strictEqual(dateResult, '2023-01-01 00:00:00.000+00');

      const bigint = BigInt(123456789012345);
      const bigintResult = mapSQLParamValue(bigint, pgFormatter.params);
      assert.ok(typeof bigintResult === 'string');

      const obj = { key: 'value' };
      const objResult = mapSQLParamValue(obj, pgFormatter.params);
      assert.ok(typeof objResult === 'string');
      assert.ok(objResult.includes('{"key":"value"}'));
    });
  });
});
