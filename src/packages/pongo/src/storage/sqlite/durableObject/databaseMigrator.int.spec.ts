import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { aroundEach, describe } from 'vitest';
import { pongoClient, type PongoClient } from '../../../core';
import { databaseMigratorTests } from '../../databaseMigratorTests';
import { cloudflareDurableObjectSQLiteDriver } from '.';

describe('Durable Object database migrator', () => {
  let storage: DurableObjectStorage;
  let clients: PongoClient[];
  aroundEach(async (runTest) => {
    const stub = env.TEST_OBJECT.get(env.TEST_OBJECT.newUniqueId());
    await runInDurableObject(stub, async (_instance, state) => {
      storage = state.storage;
      clients = [];
      try {
        await runTest();
      } finally {
        await Promise.all(clients.map((client) => client.close()));
      }
    });
  });
  databaseMigratorTests({
    client: (autoMigration) => {
      const client = pongoClient({
        driver: cloudflareDurableObjectSQLiteDriver,
        storage,
        schema: { autoMigration },
      });
      clients.push(client);
      return client;
    },
    tables: () =>
      Promise.resolve(
        storage.sql
          .exec<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
          )
          .toArray()
          .map(({ name }) => name),
      ),
  });
});
