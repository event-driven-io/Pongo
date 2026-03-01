import assert from 'assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { JSONSerializer, SQL } from '../../../../core';
import { sqlite3Client } from '../connections/connection';
import { InMemorySQLiteDatabase } from '../../core';

void describe('executeCommand changes count accuracy', () => {
  let client: ReturnType<typeof sqlite3Client>;

  beforeEach(async () => {
    client = sqlite3Client({
      fileName: InMemorySQLiteDatabase,
      serializer: JSONSerializer,
    });
    await client.connect();

    await client.command(
      SQL`CREATE TABLE changes_test (id INTEGER PRIMARY KEY, value TEXT)`,
    );
  });

  afterEach(async () => {
    await client.close();
  });

  void it('returns correct rowCount for INSERT', async () => {
    const result = await client.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (1, 'a')`,
    );
    assert.strictEqual(result.rowCount, 1);
  });

  void it('returns correct rowCount for multi-row INSERT', async () => {
    const result = await client.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (1, 'a'), (2, 'b'), (3, 'c')`,
    );
    assert.strictEqual(result.rowCount, 3);
  });

  void it('returns correct rowCount for UPDATE', async () => {
    await client.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (1, 'a'), (2, 'b'), (3, 'c')`,
    );
    const result = await client.command(
      SQL`UPDATE changes_test SET value = 'updated' WHERE id <= 2`,
    );
    assert.strictEqual(result.rowCount, 2);
  });

  void it('returns correct rowCount for DELETE', async () => {
    await client.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (1, 'a'), (2, 'b'), (3, 'c')`,
    );
    const result = await client.command(
      SQL`DELETE FROM changes_test WHERE id >= 2`,
    );
    assert.strictEqual(result.rowCount, 2);
  });

  void it('returns 0 rowCount when no rows affected', async () => {
    const result = await client.command(
      SQL`UPDATE changes_test SET value = 'x' WHERE id = 999`,
    );
    assert.strictEqual(result.rowCount, 0);
  });

  void it('returns correct rowCount for INSERT with RETURNING', async () => {
    const result = await client.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (1, 'a'), (2, 'b') RETURNING id`,
    );
    assert.strictEqual(result.rowCount, 2);
    assert.strictEqual(result.rows.length, 2);
  });

  void it('returns correct rowCount for UPDATE with RETURNING', async () => {
    await client.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (1, 'a'), (2, 'b'), (3, 'c')`,
    );
    const result = await client.command(
      SQL`UPDATE changes_test SET value = 'updated' WHERE id <= 2 RETURNING id, value`,
    );
    assert.strictEqual(result.rowCount, 2);
    assert.strictEqual(result.rows.length, 2);
  });

  void it('returns correct rowCount for INSERT ON CONFLICT DO NOTHING with RETURNING', async () => {
    await client.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (1, 'existing')`,
    );
    const result = await client.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (1, 'duplicate'), (2, 'new') ON CONFLICT DO NOTHING RETURNING id`,
    );
    // Only the non-conflicting row should be returned
    assert.strictEqual(result.rowCount, 1);
    assert.strictEqual(result.rows.length, 1);
  });

  void it('returns correct rowCount across sequential commands', async () => {
    const r1 = await client.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (1, 'a')`,
    );
    assert.strictEqual(r1.rowCount, 1);

    const r2 = await client.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (2, 'b'), (3, 'c')`,
    );
    assert.strictEqual(r2.rowCount, 2);

    const r3 = await client.command(
      SQL`UPDATE changes_test SET value = 'x' WHERE id = 1`,
    );
    assert.strictEqual(r3.rowCount, 1);

    const r4 = await client.command(
      SQL`DELETE FROM changes_test WHERE id >= 1`,
    );
    assert.strictEqual(r4.rowCount, 3);
  });
});
