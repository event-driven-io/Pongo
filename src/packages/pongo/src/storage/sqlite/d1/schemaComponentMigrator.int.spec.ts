import {
  InvalidOperationError,
  type MigrationStyle,
} from '@event-driven-io/dumbo';
import { Miniflare } from 'miniflare';
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
    options?: Pick<D1DatabaseDriverOptions, 'transactionOptions'> & {
      schema?: { ignoreMigrationHashMismatch?: boolean } | undefined;
    },
  ) => {
    const { schema, ...driverOptions } = options ?? {};
    const created = pongoClient({
      driver: d1Driver,
      database,
      schema: { autoMigration, ...schema },
      ...driverOptions,
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

  it('rejects transactional dry runs without creating tables', async () => {
    const db = client('None').db();
    db.collection('users');

    await assert.rejects(
      // @ts-expect-error D1 does not support transactional dry runs
      db.schema.migrate({ dryRun: 'transactional' }),
      InvalidOperationError,
    );

    assert.deepEqual(await tables(), []);
  });

  it('rejects transactional dry runs without creating tables when session-based transactions are enabled', async () => {
    const db = client('None', {
      transactionOptions: { mode: 'session_based' },
    }).db();
    db.collection('users');

    await assert.rejects(
      // @ts-expect-error D1 does not support transactional dry runs
      db.schema.migrate({ dryRun: 'transactional' }),
      InvalidOperationError,
    );

    assert.deepEqual(await tables(), []);
  });

  it('returns pending migrations without creating tables in a diff dry run', async () => {
    const db = client('None').db();
    db.collection('users');

    const result = await db.schema.migrate({ dryRun: 'diff' });

    assert.deepEqual(
      result.applied.map(({ name }) => name),
      ['table:pongo_collection:users:create'],
    );
    assert.deepEqual(await tables(), []);
  });

  schemaComponentMigratorTests({
    supportsRollback: false,
    client: (autoMigration, schema) => client(autoMigration, { schema }),
    tables,
  });
});
