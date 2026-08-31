import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import assert from 'node:assert/strict';
import { aroundEach, describe, it } from 'vitest';
import { DataError, JSONSerializer, SQL } from '../../../../core';
import { cloudflareDurableObjectSQLiteClient } from '../connections';

describe('Cloudflare Durable Object SQLite direct client async API', () => {
  let storage: DurableObjectStorage;

  aroundEach(async (runTest) => {
    const stub = env.TEST_OBJECT.get(env.TEST_OBJECT.newUniqueId());

    await runInDurableObject(stub, async (_instance, state) => {
      storage = state.storage;
      await runTest();
    });
  });

  it('returns a promise and rejects query asynchronously for invalid SQL', async () => {
    const client = cloudflareDurableObjectSQLiteClient({
      storage,
      serializer: JSONSerializer,
    });
    let result: Promise<unknown> | undefined;

    assert.doesNotThrow(() => {
      result = client.query(SQL`SELECT FROM`);
    });
    assert.ok(result instanceof Promise);
    await assert.rejects(result);
  });

  it('returns a promise and rejects batchQuery asynchronously for invalid SQL', async () => {
    const client = cloudflareDurableObjectSQLiteClient({
      storage,
      serializer: JSONSerializer,
    });
    let result: Promise<unknown> | undefined;

    assert.doesNotThrow(() => {
      result = client.batchQuery([SQL`SELECT 1`, SQL`SELECT FROM`]);
    });
    assert.ok(result instanceof Promise);
    await assert.rejects(result);
  });

  it('returns a promise and rejects command asynchronously for invalid SQL', async () => {
    const client = cloudflareDurableObjectSQLiteClient({
      storage,
      serializer: JSONSerializer,
    });
    let result: Promise<unknown> | undefined;

    assert.doesNotThrow(() => {
      result = client.command(SQL`INSERT INTO`);
    });
    assert.ok(result instanceof Promise);
    await assert.rejects(result);
  });

  it('returns a promise and rejects batchCommand asynchronously for invalid SQL', async () => {
    const client = cloudflareDurableObjectSQLiteClient({
      storage,
      serializer: JSONSerializer,
    });
    let result: Promise<unknown> | undefined;

    assert.doesNotThrow(() => {
      result = client.batchCommand([
        SQL`CREATE TABLE test (id INTEGER)`,
        SQL`INSERT INTO`,
      ]);
    });
    assert.ok(result instanceof Promise);
    await assert.rejects(result);
  });

  it('supports a parameterized null binding', async () => {
    const client = cloudflareDurableObjectSQLiteClient({
      storage,
      serializer: JSONSerializer,
    });

    await client.command(SQL`CREATE TABLE nullable_items (value TEXT)`);
    await client.command(
      SQL`INSERT INTO nullable_items (value) VALUES (${null})`,
    );
    const result = await client.query<{ value: null }>(
      SQL`SELECT value FROM nullable_items`,
    );

    assert.strictEqual(result.rowCount, 1);
    assert.deepStrictEqual(result.rows, [{ value: null }]);
  });

  it('rejects unsupported formatted binding values through the async API', async () => {
    const client = cloudflareDurableObjectSQLiteClient({
      storage,
      serializer: JSONSerializer,
    });

    await assert.rejects(
      client.query(SQL`SELECT ${Symbol('unsupported')}`),
      DataError,
    );
  });
});
