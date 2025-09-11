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
          `{"key":"value"}`,
        ],
      });
    });

    void it('handles boolean values', () => {
      const sql = SQL`INSERT INTO test (active, inactive) VALUES (${true}, ${false})`;
      const result = sqliteFormatter.format(sql);

      assert.deepStrictEqual(result, {
        query: 'INSERT INTO test (active, inactive) VALUES (?, ?)',
        params: [true, false],
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
      assert.strictEqual(sqliteFormatter.valueMapper.mapValue(123), 123);
      assert.strictEqual(sqliteFormatter.valueMapper.mapValue('test'), 'test');
      assert.strictEqual(sqliteFormatter.valueMapper.mapValue(null), null);
      assert.strictEqual(sqliteFormatter.valueMapper.mapValue(undefined), null);
    });

    void it('handles SQLite-specific type conversions', () => {
      // Boolean conversion
      assert.strictEqual(sqliteFormatter.valueMapper.mapValue(true), true);
      assert.strictEqual(sqliteFormatter.valueMapper.mapValue(false), false);

      // Date conversion
      const date = new Date('2023-01-01T00:00:00.000Z');
      assert.strictEqual(
        sqliteFormatter.valueMapper.mapValue(date),
        '2023-01-01T00:00:00.000Z',
      );

      // BigInt conversion
      const bigint = BigInt(123456789012345);
      assert.strictEqual(
        sqliteFormatter.valueMapper.mapValue(bigint),
        '123456789012345',
      );
    });

    void it('handles SQL identifier type', () => {
      const validIdentResult = sqliteFormatter.valueMapper.mapValue(
        SQL.identifier('table_name'),
      );
      assert.strictEqual(validIdentResult, 'table_name');

      const quotedIdentResult = sqliteFormatter.valueMapper.mapValue(
        SQL.identifier('TableName'),
      );
      assert.strictEqual(quotedIdentResult, '"TableName"');
    });

    void it('handles nested SQL', () => {
      const nestedSql = SQL`SELECT ${123}`;
      const result = sqliteFormatter.valueMapper.mapValue(nestedSql);
      assert.strictEqual(typeof result, 'string');
      assert.ok((result as string).includes('123'));
    });

    void it('handles complex types', () => {
      const obj = { key: 'value' };
      const objResult = sqliteFormatter.valueMapper.mapValue(obj);
      assert.ok(typeof objResult === 'string');
      assert.ok(objResult.includes('{"key":"value"}'));
    });
  });
});
