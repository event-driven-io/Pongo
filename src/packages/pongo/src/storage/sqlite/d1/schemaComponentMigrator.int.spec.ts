import type { MigrationStyle } from '@event-driven-io/dumbo';
import { Miniflare } from 'miniflare';
import { D1TransactionNotSupportedError } from '@event-driven-io/dumbo/cloudflare';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { pongoClient, type PongoClient } from '../../../core';
import { schemaComponentMigratorTests } from '../../schemaComponentMigratorTests';
import { d1Driver, type D1DatabaseDriverOptions } from '.';

describe('D1 schema component migrator', () => {
  let mf: Miniflare;
  let database: Awaited<ReturnType<Miniflare['getD1Database']>>;
  let clients: PongoClient[];

  const client = (
    autoMigration: MigrationStyle,
    options?: Pick<D1DatabaseDriverOptions, 'transactionOptions'>,
  ) => {
    const created = pongoClient({
      driver: d1Driver,
      database,
      schema: { autoMigration },
      ...options,
    });
    clients.push(created);
    return created;
  };

  const tables = async () =>
    (
      await database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_cf_%' ORDER BY name",
        )
        .all<{ name: string }>()
    ).results.map(({ name }) => name);

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
    await Promise.all(clients.map((created) => created.close()));
    await mf.dispose();
  });

  it('rejects dry runs without creating tables', async () => {
    const db = client('None').db();
    db.collection('users');

    await assert.rejects(
      db.schema.migrate({ dryRun: true, migrationStyle: 'CreateOrUpdate' }),
      D1TransactionNotSupportedError,
    );

    assert.deepEqual(await tables(), []);
  });

  it('rejects dry runs without creating tables when session-based transactions are enabled', async () => {
    const db = client('None', {
      transactionOptions: { mode: 'session_based' },
    }).db();
    db.collection('users');

    await assert.rejects(
      db.schema.migrate({ dryRun: true, migrationStyle: 'CreateOrUpdate' }),
      D1TransactionNotSupportedError,
    );

    assert.deepEqual(await tables(), []);
  });

  schemaComponentMigratorTests({
    supportsRollback: false,
    client,
    tables,
  });
});
