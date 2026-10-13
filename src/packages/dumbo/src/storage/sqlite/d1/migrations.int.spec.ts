import assert from 'assert';
import { Miniflare } from 'miniflare';
import { afterEach, beforeEach, describe, it } from 'vitest';
import {
  InvalidOperationError,
  runSQLMigrations,
  SQL,
  sqlMigration,
} from '../../../core';
import { tableExists } from '../core/schema';
import { d1Pool } from '.';

describe('D1 migrations', () => {
  let mf: Miniflare;
  let pool: ReturnType<typeof d1Pool>;

  beforeEach(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'migrations' },
    });
    pool = d1Pool({ database: await mf.getD1Database('DB') });
  });

  afterEach(async () => {
    await pool.close();
    await mf.dispose();
  });

  it('does not apply a migration when recording it fails', async () => {
    const migration = sqlMigration('users:create', [
      SQL`CREATE TABLE users (id INTEGER)`,
      SQL`INSERT INTO dmb_migrations (name, sql_hash) VALUES ('users:create', 'recorded by the migration')`,
    ]);

    await assert.rejects(
      runSQLMigrations(pool, [migration], { execute: pool.execute }),
    );

    assert.equal(await tableExists(pool.execute, 'users'), false);
  });

  it('rejects a transactional dry run without applying migrations', async () => {
    const migration = sqlMigration('users:create', [
      SQL`CREATE TABLE users (id INTEGER)`,
    ]);

    await assert.rejects(
      runSQLMigrations(pool, [migration], { dryRun: 'transactional' }),
      InvalidOperationError,
    );

    assert.equal(await tableExists(pool.execute, 'users'), false);
    assert.equal(await tableExists(pool.execute, 'dmb_migrations'), false);
  });

  it('returns pending migrations without applying them in a diff dry run', async () => {
    const migration = sqlMigration('users:create', [
      SQL`CREATE TABLE users (id INTEGER)`,
    ]);

    const result = await runSQLMigrations(pool, [migration], {
      dryRun: 'diff',
    });

    assert.deepEqual(result, { applied: [migration], skipped: [] });
    assert.equal(await tableExists(pool.execute, 'users'), false);
    assert.equal(await tableExists(pool.execute, 'dmb_migrations'), false);
  });
});
