import { Miniflare } from 'miniflare';
import { D1TransactionNotSupportedError } from '@event-driven-io/dumbo/cloudflare';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { pongoClient, type PongoClient } from '../../../core';
import { databaseMigratorTests } from '../../databaseMigratorTests';
import { d1Driver } from '.';

describe('D1 database migration assurance', () => {
  let mf: Miniflare;
  let database: Awaited<ReturnType<Miniflare['getD1Database']>>;
  let clients: PongoClient[];
  beforeEach(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'assurance' },
    });
    database = await mf.getD1Database('DB');
    clients = [];
  });
  afterEach(async () => {
    await Promise.all(clients.map((client) => client.close()));
    await mf.dispose();
  });
  it('rejects dry runs before creating collections or migration history', async () => {
    const client = pongoClient({
      driver: d1Driver,
      database,
      schema: { autoMigration: 'None' },
    });
    clients.push(client);
    const db = client.db();
    db.collection('users');
    await assert.rejects(
      db.schema.migrate({ dryRun: true }),
      D1TransactionNotSupportedError,
    );
    const result = await database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'dmb_migrations')",
      )
      .all();
    assert.deepEqual(result.results, []);
  });
  it('rejects migration dry runs even when session-based transactions are enabled', async () => {
    const client = pongoClient({
      driver: d1Driver,
      database,
      transactionOptions: { mode: 'session_based' },
      schema: { autoMigration: 'None' },
    });
    clients.push(client);
    const db = client.db();
    db.collection('users');

    await assert.rejects(
      db.schema.migrate({ dryRun: true }),
      D1TransactionNotSupportedError,
    );

    const tables = await database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'dmb_migrations')",
      )
      .all();
    assert.deepEqual(tables.results, []);
  });

  databaseMigratorTests({
    supportsRollback: false,
    client: (autoMigration) => {
      const client = pongoClient({
        driver: d1Driver,
        database,
        schema: { autoMigration },
      });
      clients.push(client);
      return client;
    },
    tables: async () =>
      (
        await database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_cf_%' ORDER BY name",
          )
          .all<{ name: string }>()
      ).results.map(({ name }) => name),
  });
});
