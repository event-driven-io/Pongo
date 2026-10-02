import { DumboError, QueryCanceledError } from '@event-driven-io/dumbo';
import {
  sharedPostgreSQLDatabase,
  type SharedPostgreSQLDatabase,
} from '@event-driven-io/testing/postgresql';
import assert from 'assert';
import pg from 'pg';
import { afterAll, beforeAll, describe, it } from 'vitest';
import '../pg';
import { migrateCommand } from './migrate';

const isQueryCanceledError = (error: unknown) =>
  DumboError.isInstanceOf(error, { errorType: QueryCanceledError.ErrorType });

describe('pongo migrate run', () => {
  let database: SharedPostgreSQLDatabase;
  let connectionString: string;

  beforeAll(async () => {
    database = await sharedPostgreSQLDatabase();
    connectionString = database.connectionString;
  });

  afterAll(async () => {
    await database.close();
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
        isQueryCanceledError,
      );
    } finally {
      clearTimeout(unblock);
      await blocker.query('ROLLBACK');
      await blocker.end();
    }
  });
});
