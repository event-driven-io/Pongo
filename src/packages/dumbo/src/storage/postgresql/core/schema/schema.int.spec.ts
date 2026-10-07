import {
  sharedPostgreSQLDatabase,
  type SharedPostgreSQLDatabase,
} from '@event-driven-io/testing/postgresql';
import assert from 'node:assert/strict';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  columnExists,
  createFunctionIfDoesNotExistSQL,
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

  describe('column', () => {
    beforeEach(() =>
      pool.execute.command(SQL`CREATE TABLE crm.users (id INTEGER)`),
    );

    it('exists in its table', async () => {
      assert.equal(
        await columnExists(pool.execute, 'users', 'id', {
          databaseSchemaName: 'crm',
        }),
        true,
      );
    });

    it('does not exist when its table does not have it', async () => {
      assert.equal(
        await columnExists(pool.execute, 'users', 'email', {
          databaseSchemaName: 'crm',
        }),
        false,
      );
    });

    it('does not exist in another database schema', async () => {
      assert.equal(
        await columnExists(pool.execute, 'users', 'id', {
          databaseSchemaName: 'public',
        }),
        false,
      );
    });

    it('does not exist without a database schema when its schema is not on the search path', async () => {
      assert.equal(await columnExists(pool.execute, 'users', 'id'), false);
    });

    it('exists without a database schema when its schema is on the search path', async () => {
      await pool.withConnection(async ({ execute }) => {
        await execute.command(SQL`SET search_path TO crm`);

        assert.equal(await columnExists(execute, 'users', 'id'), true);

        await execute.command(SQL`RESET search_path`);
      });
    });
  });

  describe('creating a function if it does not exist', () => {
    const answerReturning42 = SQL`CREATE OR REPLACE FUNCTION crm.answer() RETURNS INTEGER AS $answer$ SELECT 42 $answer$ LANGUAGE SQL;`;
    const answerReturning7 = SQL`CREATE OR REPLACE FUNCTION crm.answer() RETURNS INTEGER AS $answer$ SELECT 7 $answer$ LANGUAGE SQL;`;

    const answer = async (execute: SQLExecutor) =>
      (
        await execute.query<{ answer: number }>(
          SQL`SELECT crm.answer() AS answer`,
        )
      ).rows[0]?.answer;

    it('creates the function when its database schema does not have it', async () => {
      await pool.execute.command(
        createFunctionIfDoesNotExistSQL('answer', answerReturning42, {
          databaseSchemaName: 'crm',
        }),
      );

      assert.equal(await answer(pool.execute), 42);
    });

    it('keeps the function when its database schema already has it', async () => {
      await pool.execute.command(answerReturning42);

      await pool.execute.command(
        createFunctionIfDoesNotExistSQL('answer', answerReturning7, {
          databaseSchemaName: 'crm',
        }),
      );

      assert.equal(await answer(pool.execute), 42);
    });

    it('creates the function without a database schema when the current schema does not have it', async () => {
      await pool.withConnection(async ({ execute }) => {
        await execute.command(SQL`SET search_path TO crm`);

        await execute.command(
          createFunctionIfDoesNotExistSQL('answer', answerReturning42),
        );

        await execute.command(SQL`RESET search_path`);
      });

      assert.equal(await answer(pool.execute), 42);
    });

    it('keeps the function without a database schema when the current schema already has it', async () => {
      await pool.execute.command(answerReturning42);

      await pool.withConnection(async ({ execute }) => {
        await execute.command(SQL`SET search_path TO crm`);

        await execute.command(
          createFunctionIfDoesNotExistSQL('answer', answerReturning7),
        );

        await execute.command(SQL`RESET search_path`);
      });

      assert.equal(await answer(pool.execute), 42);
    });
  });

  describe('database schema', () => {
    it('exists after it was created', async () => {
      assert.equal(await schemaExists(pool.execute, 'crm'), true);
    });

    it('does not exist when it was not created', async () => {
      assert.equal(await schemaExists(pool.execute, 'sales'), false);
    });
  });
});
