import {
  sharedPostgreSQLDatabase,
  type SharedPostgreSQLDatabase,
} from '@event-driven-io/testing/postgresql';
import assert from 'node:assert/strict';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  functionExists,
  indexExists,
  PostgreSQLConnectionString,
  schemaExists,
  sequenceExists,
  tableExists,
} from '..';
import { dumbo, type Dumbo } from '../../../..';
import { SQL, type SQLExecutor } from '../../../../core';
import { pgDumboDriver } from '../../pg';

describe('checking if PostgreSQL schema objects exist', () => {
  let pool: Dumbo;
  let database: SharedPostgreSQLDatabase;

  beforeAll(async () => {
    database = await sharedPostgreSQLDatabase();
    pool = dumbo({
      connectionString: PostgreSQLConnectionString(database.connectionString),
      driver: pgDumboDriver,
    });
  });

  afterAll(async () => {
    await pool.close();
    await database.close();
  });

  beforeEach(() =>
    pool.execute.command(
      SQL`DROP SCHEMA IF EXISTS crm CASCADE; CREATE SCHEMA crm;`,
    ),
  );

  describe.each([
    {
      kind: 'table',
      name: 'users',
      create: SQL`CREATE TABLE crm.users (id INTEGER)`,
      objectExists: tableExists,
    },
    {
      kind: 'function',
      name: 'answer',
      create: SQL`CREATE FUNCTION crm.answer() RETURNS INTEGER AS 'SELECT 42' LANGUAGE SQL`,
      objectExists: functionExists,
    },
    {
      kind: 'index',
      name: 'users_id_idx',
      create: SQL`CREATE TABLE crm.users (id INTEGER); CREATE INDEX users_id_idx ON crm.users (id)`,
      objectExists: indexExists,
    },
    {
      kind: 'sequence',
      name: 'ids',
      create: SQL`CREATE SEQUENCE crm.ids`,
      objectExists: sequenceExists,
    },
  ])(
    '$kind',
    ({
      name,
      create,
      objectExists,
    }: {
      name: string;
      create: SQL;
      objectExists: (
        execute: SQLExecutor,
        name: string,
        options?: { databaseSchemaName?: string },
      ) => Promise<boolean>;
    }) => {
      beforeEach(() => pool.execute.command(create));

      it('exists in its database schema', async () => {
        assert.equal(
          await objectExists(pool.execute, name, { databaseSchemaName: 'crm' }),
          true,
        );
      });

      it('does not exist in another database schema', async () => {
        assert.equal(
          await objectExists(pool.execute, name, {
            databaseSchemaName: 'public',
          }),
          false,
        );
      });

      it('does not exist without a database schema when its schema is not on the search path', async () => {
        assert.equal(await objectExists(pool.execute, name), false);
      });

      it('exists without a database schema when its schema is on the search path', async () => {
        await pool.withConnection(async ({ execute }) => {
          await execute.command(SQL`SET search_path TO crm`);

          assert.equal(await objectExists(execute, name), true);

          await execute.command(SQL`RESET search_path`);
        });
      });
    },
  );

  describe('database schema', () => {
    it('exists after it was created', async () => {
      assert.equal(await schemaExists(pool.execute, 'crm'), true);
    });

    it('does not exist when it was not created', async () => {
      assert.equal(await schemaExists(pool.execute, 'sales'), false);
    });
  });
});
