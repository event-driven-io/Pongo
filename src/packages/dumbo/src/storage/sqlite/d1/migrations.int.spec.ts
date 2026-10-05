import assert from 'assert';
import { Miniflare } from 'miniflare';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { runSQLMigrations, SQL, sqlMigration } from '../../../core';
import { tableExists } from '../core/schema';
import { d1Pool } from './pool';

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
});
