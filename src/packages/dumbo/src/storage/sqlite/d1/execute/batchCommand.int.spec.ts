import type { D1Database } from '@cloudflare/workers-types';
import assert from 'assert';
import { Miniflare } from 'miniflare';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { BatchCommandNoChangesError, SQL } from '../../../../core';
import { d1Pool } from '../pool';

describe('D1 batchCommand with assertChanges', () => {
  let mf: Miniflare;
  let database: D1Database;
  let pool: ReturnType<typeof d1Pool>;

  beforeEach(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-db-id' },
    });
    database = await mf.getD1Database('DB');
    pool = d1Pool({ database });

    await pool.execute.command(
      SQL`CREATE TABLE test_items (id INTEGER PRIMARY KEY, value TEXT)`,
    );
    await pool.execute.command(
      SQL`INSERT INTO test_items (id, value) VALUES (1, 'original')`,
    );
  });

  afterEach(async () => {
    await pool.close();
    await mf.dispose();
  });

  it('reports the conflict with a dedicated error type distinct from a generic database failure', async () => {
    await assert.rejects(
      () =>
        pool.execute.batchCommand(
          [SQL`UPDATE test_items SET value = 'updated' WHERE id = 999`],
          { assertChanges: true },
        ),
      (error) => {
        assert.ok(error instanceof BatchCommandNoChangesError);
        assert.strictEqual(error.errorType, 'BatchCommandNoChangesError');
        assert.strictEqual(error.errorCode, 409);
        assert.strictEqual(error.statementIndex, 0);
        return true;
      },
    );
  });
});
