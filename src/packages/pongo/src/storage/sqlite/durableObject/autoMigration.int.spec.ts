import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import assert from 'node:assert/strict';
import { aroundEach, describe, it } from 'vitest';
import { pongoClient, pongoSchema, type PongoClient } from '../../../core';
import { cloudflareDurableObjectSQLiteDriver } from '.';

type User = { _id?: string; name: string };

describe('Client level autoMigration', () => {
  let storage: DurableObjectStorage;
  let client: PongoClient | undefined;

  aroundEach(async (runTest) => {
    const stub = env.TEST_OBJECT.get(env.TEST_OBJECT.newUniqueId());

    await runInDurableObject(stub, async (_instance, state) => {
      storage = state.storage;
      try {
        await runTest();
      } finally {
        await client?.close();
      }
    });
  });

  it('does not create the collection when set to None', async () => {
    client = pongoClient({
      driver: cloudflareDurableObjectSQLiteDriver,
      storage,
      schema: { autoMigration: 'None' },
    });

    await assert.rejects(() =>
      client!.db().collection<User>('users').insertOne({ name: 'Oskar' }),
    );

    const tables = storage.sql
      .exec<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'",
      )
      .toArray();
    assert.deepStrictEqual(tables, []);
  });

  it('creates the collection when set to CreateOrUpdate', async () => {
    client = pongoClient({
      driver: cloudflareDurableObjectSQLiteDriver,
      storage,
      schema: { autoMigration: 'CreateOrUpdate' },
    });

    await client.db().collection<User>('users').insertOne({ name: 'Oskar' });

    const tables = storage.sql
      .exec<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'",
      )
      .toArray();
    assert.deepStrictEqual(tables, [{ name: 'users' }]);
  });

  it('creates the collection declared in a named schema when set to CreateOrUpdate', async () => {
    const definition = pongoSchema.client({
      database: pongoSchema.db({
        schemas: {
          crm: pongoSchema.schema('crm', {
            users: pongoSchema.collection<User>('users'),
          }),
        },
      }),
    });

    client = pongoClient({
      driver: cloudflareDurableObjectSQLiteDriver,
      storage,
      schema: { autoMigration: 'CreateOrUpdate', definition },
    });

    await client
      .db('database')
      .collection<User>('users', { databaseSchemaName: 'crm' })
      .insertOne({ name: 'Oskar' });

    const tables = storage.sql
      .exec<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'crm.users'",
      )
      .toArray();
    assert.deepStrictEqual(tables, [{ name: 'crm.users' }]);
  });
});
