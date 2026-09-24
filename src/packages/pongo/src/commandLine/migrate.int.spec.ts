import { QueryCanceledError } from '@event-driven-io/dumbo';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import assert from 'assert';
import pg from 'pg';
import { afterAll, beforeAll, describe, it } from 'vitest';
import '../pg';
import { migrateCommand } from './migrate';

describe('pongo migrate run', () => {
  let postgres: StartedPostgreSqlContainer;
  let connectionString: string;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:18.0').start();
    connectionString = postgres.getConnectionUri();
  });

  afterAll(async () => {
    await postgres.stop();
  });

  it('cancels a migration statement exceeding --timeout', async () => {
    const blocker = new pg.Client({ connectionString });
    await blocker.connect();
    await blocker.query('BEGIN');
    await blocker.query('CREATE TABLE users (_id TEXT)');
    const unblock = setTimeout(() => void blocker.query('ROLLBACK'), 1000);

    try {
      await assert.rejects(
        () =>
          migrateCommand.parseAsync(
            [
              'run',
              '--cs',
              connectionString,
              '--drv',
              'pg',
              '--col',
              'users',
              '--timeout',
              '100',
            ],
            { from: 'user' },
          ),
        QueryCanceledError,
      );
    } finally {
      clearTimeout(unblock);
      await blocker.query('ROLLBACK');
      await blocker.end();
    }
  });
});
