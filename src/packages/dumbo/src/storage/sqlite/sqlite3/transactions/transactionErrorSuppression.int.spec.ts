import assert from 'assert';
import { describe, it } from 'vitest';
import { sqlite3Connection } from '..';
import { JSONSerializer, SQL } from '../../../../core';
import { InMemorySQLiteDatabase } from '../../core';

describe('withTransaction error preservation', () => {
  it('should surface the original callback error, not the rollback error', async () => {
    const connection = sqlite3Connection({
      fileName: InMemorySQLiteDatabase,
      serializer: JSONSerializer,
    });

    try {
      try {
        await connection.withTransaction(async (tx) => {
          await tx.execute.command(
            SQL`CREATE TABLE IF NOT EXISTS test_error (id INTEGER, value TEXT)`,
          );

          // Close the underlying database to cause rollback to fail
          await connection.close();

          throw new Error('original callback error');
        });
        assert.fail('should have thrown');
      } catch (err) {
        assert.strictEqual(
          (err instanceof Error ? err.message : String(err)),
          'original callback error',
        );
      }
    } finally {
      try {
        await connection.close();
      } catch {
        // connection may already be closed
      }
    }
  });
});
