import { SQL } from '@event-driven-io/dumbo';
import { sqliteFormatter } from '@event-driven-io/dumbo/sqlite3';
import { randomUUID } from 'crypto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sqliteSQLBuilder } from './index';

void describe('sqliteSQLBuilder', () => {
  const collectionName = 'testCollection';
  const builder = sqliteSQLBuilder(collectionName);

  void describe('createCollection', () => {
    void it('should generate correct CREATE TABLE statement', () => {
      const result = builder.createCollection();
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('CREATE TABLE IF NOT EXISTS'));
      assert.ok(query.includes('_id'));
      assert.ok(query.includes('data'));
      assert.ok(query.includes('json_valid(data)'));
    });
  });

  void describe('insertOne', () => {
    void it('should generate correct INSERT statement', () => {
      const document = { _id: randomUUID(), name: 'Test', age: 30 };
      const result = builder.insertOne(document);
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('INSERT OR IGNORE INTO'));
      assert.ok(query.includes('(_id, data, _version)'));
    });
  });

  void describe('find operations', () => {
    void it('should handle empty filter', () => {
      const result = builder.find({});
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('SELECT data FROM'));
      assert.ok(!query.includes('WHERE'));
    });

    void it('should handle simple equality filter', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      const result = builder.find({ name: 'John' } as any);
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('WHERE'));
      assert.ok(query.includes('json_extract'));
    });

    void it('should handle limit and skip options', () => {
      const result = builder.find({}, { limit: 10, skip: 5 });
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('LIMIT'));
      assert.ok(query.includes('OFFSET'));
    });
  });

  void describe('update operations', () => {
    void it('should handle $set operator', () => {
      const result = builder.updateOne(
        { _id: 'test-id' },
        { $set: { name: 'Updated' } },
      );
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('UPDATE'));
      assert.ok(query.includes('json_patch') || query.includes('json_set'));
    });

    void it('should handle $inc operator', () => {
      const result = builder.updateOne(
        { _id: 'test-id' },
        { $inc: { count: 1 } },
      );
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('json_set'));
      assert.ok(query.includes('json_extract'));
    });

    void it('should handle $push operator', () => {
      const result = builder.updateOne(
        { _id: 'test-id' },
        { $push: { tags: 'new-tag' } },
      );
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('json_set'));
      assert.ok(query.includes('json_type') || query.includes('json_array'));
    });
  });

  void describe('delete operations', () => {
    void it('should generate correct DELETE statement', () => {
      const result = builder.deleteOne({ _id: 'test-id' });
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('DELETE FROM'));
      assert.ok(query.includes('WHERE'));
    });

    void it('should handle expected version in deleteOne', () => {
      const result = builder.deleteOne(
        { _id: 'test-id' },
        { expectedVersion: 2n },
      );
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('_version'));
    });
  });

  void describe('countDocuments', () => {
    void it('should generate correct COUNT statement', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      const result = builder.countDocuments({ status: 'active' } as any);
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('SELECT COUNT(1) as count'));
      assert.ok(query.includes('WHERE'));
    });
  });
});
