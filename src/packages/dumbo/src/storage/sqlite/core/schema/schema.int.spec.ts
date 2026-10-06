import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { indexExists, InMemorySQLiteDatabase, tableExists } from '..';
import { dumbo, type Dumbo } from '../../../..';
import { SQL } from '../../../../core';
import { SQLite3DriverType } from '../../../../sqlite3';

describe('checking if SQLite schema objects exist', () => {
  let pool: Dumbo;

  beforeEach(() => {
    pool = dumbo({
      connectionString: InMemorySQLiteDatabase,
      driverType: SQLite3DriverType,
    });
  });

  afterEach(() => pool.close());

  describe('table', () => {
    it('exists by its name', async () => {
      await pool.execute.command(SQL`CREATE TABLE users (id INTEGER)`);

      assert.equal(await tableExists(pool.execute, 'users'), true);
    });

    it('exists in its database schema', async () => {
      await pool.execute.command(SQL`CREATE TABLE "crm.users" (id INTEGER)`);

      assert.equal(
        await tableExists(pool.execute, 'users', { databaseSchemaName: 'crm' }),
        true,
      );
    });

    it('does not exist in another database schema', async () => {
      await pool.execute.command(SQL`CREATE TABLE "crm.users" (id INTEGER)`);

      assert.equal(
        await tableExists(pool.execute, 'users', {
          databaseSchemaName: 'sales',
        }),
        false,
      );
    });
  });

  describe('index', () => {
    it('exists by its name', async () => {
      await pool.execute.command(SQL`CREATE TABLE users (id INTEGER)`);
      await pool.execute.command(SQL`CREATE INDEX users_id_idx ON users (id)`);

      assert.equal(await indexExists(pool.execute, 'users_id_idx'), true);
    });

    it('exists in its database schema', async () => {
      await pool.execute.command(SQL`CREATE TABLE "crm.users" (id INTEGER)`);
      await pool.execute.command(
        SQL`CREATE INDEX "crm.users_id_idx" ON "crm.users" (id)`,
      );

      assert.equal(
        await indexExists(pool.execute, 'users_id_idx', {
          databaseSchemaName: 'crm',
        }),
        true,
      );
    });

    it('does not exist in another database schema', async () => {
      await pool.execute.command(SQL`CREATE TABLE "crm.users" (id INTEGER)`);
      await pool.execute.command(
        SQL`CREATE INDEX "crm.users_id_idx" ON "crm.users" (id)`,
      );

      assert.equal(
        await indexExists(pool.execute, 'users_id_idx', {
          databaseSchemaName: 'sales',
        }),
        false,
      );
    });
  });
});
