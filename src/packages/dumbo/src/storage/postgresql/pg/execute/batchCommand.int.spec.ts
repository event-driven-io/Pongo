import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import assert from 'assert';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { BatchCommandNoChangesError, SQL } from '../../../../core';
import { pgPool, type PgNativePool } from '../connections';

describe('PostgreSQL batchCommand with assertChanges', () => {
  let postgres: StartedPostgreSqlContainer;
  let pool: PgNativePool;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:18.0').start();
    pool = pgPool({ connectionString: postgres.getConnectionUri() });

    await pool.execute.command(
      SQL`CREATE TABLE test_items (id INT PRIMARY KEY, value TEXT)`,
    );
    await pool.execute.command(
      SQL`INSERT INTO test_items (id, value) VALUES (1, 'original')`,
    );
  });

  afterAll(async () => {
    await pool.close();
    await postgres.stop();
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
