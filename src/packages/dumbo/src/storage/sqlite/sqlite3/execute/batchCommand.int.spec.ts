import assert from 'assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  BatchCommandNoChangesError,
  JSONSerializer,
  SQL,
} from '../../../../core';
import { sqlite3Client } from '../connections/connection';
import { InMemorySQLiteDatabase } from '../../core';

void describe('batchCommand with assertChanges', () => {
  let client: ReturnType<typeof sqlite3Client>;

  beforeEach(async () => {
    client = sqlite3Client({
      fileName: InMemorySQLiteDatabase,
      serializer: JSONSerializer,
    });
    await client.connect();

    await client.command(
      SQL`CREATE TABLE test_items (id INTEGER PRIMARY KEY, value TEXT)`,
    );
    await client.command(
      SQL`INSERT INTO test_items (id, value) VALUES (1, 'original')`,
    );
    await client.command(
      SQL`INSERT INTO test_items (id, value) VALUES (2, 'original')`,
    );
  });

  afterEach(async () => {
    await client.close();
  });

  void it('throws BatchCommandNoChangesError when assertChanges is true and a command affects no rows', async () => {
    try {
      await client.batchCommand(
        [
          SQL`UPDATE test_items SET value = 'updated' WHERE id = 1`,
          SQL`UPDATE test_items SET value = 'updated' WHERE id = 999`,
        ],
        { assertChanges: true },
      );
      assert.fail('Expected BatchCommandNoChangesError');
    } catch (error) {
      assert.ok(error instanceof BatchCommandNoChangesError);
      assert.strictEqual(error.statementIndex, 1);
    }
  });

  void it('stops executing subsequent commands after assertChanges failure', async () => {
    try {
      await client.batchCommand(
        [
          SQL`UPDATE test_items SET value = 'changed' WHERE id = 999`,
          SQL`UPDATE test_items SET value = 'changed' WHERE id = 1`,
        ],
        { assertChanges: true },
      );
      assert.fail('Expected BatchCommandNoChangesError');
    } catch (error) {
      assert.ok(error instanceof BatchCommandNoChangesError);
      assert.strictEqual(error.statementIndex, 0);
    }

    const result = await client.query<{ value: string }>(
      SQL`SELECT value FROM test_items WHERE id = 1`,
    );
    assert.strictEqual(result.rows[0]!.value, 'original');
  });

  void it('succeeds when assertChanges is true and all commands affect rows', async () => {
    const results = await client.batchCommand(
      [
        SQL`UPDATE test_items SET value = 'updated1' WHERE id = 1`,
        SQL`UPDATE test_items SET value = 'updated2' WHERE id = 2`,
      ],
      { assertChanges: true },
    );

    assert.strictEqual(results.length, 2);
    assert.ok((results[0]!.rowCount ?? 0) > 0);
    assert.ok((results[1]!.rowCount ?? 0) > 0);
  });

  void it('does not check changes when assertChanges is not set', async () => {
    const results = await client.batchCommand([
      SQL`UPDATE test_items SET value = 'updated' WHERE id = 999`,
    ]);

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0]!.rowCount, 0);
  });
});
