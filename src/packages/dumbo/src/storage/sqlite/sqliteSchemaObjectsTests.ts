import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { SQL, type SQLExecutor } from '../../core';
import { columnExists, indexExists, tableExists } from './core/schema';

export const sqliteSchemaObjectsTests = (options: {
  execute: () => SQLExecutor;
}) => {
  describe('table', () => {
    it('exists by its name', async () => {
      await options.execute().command(SQL`CREATE TABLE users (id INTEGER)`);

      assert.equal(await tableExists(options.execute(), 'users'), true);
    });

    it('exists in its database schema', async () => {
      await options
        .execute()
        .command(SQL`CREATE TABLE "crm.users" (id INTEGER)`);

      assert.equal(
        await tableExists(options.execute(), 'users', {
          databaseSchemaName: 'crm',
        }),
        true,
      );
    });

    it('does not exist in another database schema', async () => {
      await options
        .execute()
        .command(SQL`CREATE TABLE "crm.users" (id INTEGER)`);

      assert.equal(
        await tableExists(options.execute(), 'users', {
          databaseSchemaName: 'sales',
        }),
        false,
      );
    });
  });

  describe('index', () => {
    it('exists by its name', async () => {
      await options.execute().command(SQL`CREATE TABLE users (id INTEGER)`);
      await options
        .execute()
        .command(SQL`CREATE INDEX users_id_idx ON users (id)`);

      assert.equal(await indexExists(options.execute(), 'users_id_idx'), true);
    });

    it('exists in its database schema', async () => {
      await options
        .execute()
        .command(SQL`CREATE TABLE "crm.users" (id INTEGER)`);
      await options
        .execute()
        .command(SQL`CREATE INDEX "crm.users_id_idx" ON "crm.users" (id)`);

      assert.equal(
        await indexExists(options.execute(), 'users_id_idx', {
          databaseSchemaName: 'crm',
        }),
        true,
      );
    });

    it('does not exist in another database schema', async () => {
      await options
        .execute()
        .command(SQL`CREATE TABLE "crm.users" (id INTEGER)`);
      await options
        .execute()
        .command(SQL`CREATE INDEX "crm.users_id_idx" ON "crm.users" (id)`);

      assert.equal(
        await indexExists(options.execute(), 'users_id_idx', {
          databaseSchemaName: 'sales',
        }),
        false,
      );
    });
  });

  describe('column', () => {
    it('exists in its table', async () => {
      await options.execute().command(SQL`CREATE TABLE users (id INTEGER)`);

      assert.equal(await columnExists(options.execute(), 'users', 'id'), true);
    });

    it('does not exist when its table does not have it', async () => {
      await options.execute().command(SQL`CREATE TABLE users (id INTEGER)`);

      assert.equal(
        await columnExists(options.execute(), 'users', 'email'),
        false,
      );
    });

    it('exists in its database schema', async () => {
      await options
        .execute()
        .command(SQL`CREATE TABLE "crm.users" (id INTEGER)`);

      assert.equal(
        await columnExists(options.execute(), 'users', 'id', {
          databaseSchemaName: 'crm',
        }),
        true,
      );
    });

    it('does not exist in another database schema', async () => {
      await options
        .execute()
        .command(SQL`CREATE TABLE "crm.users" (id INTEGER)`);

      assert.equal(
        await columnExists(options.execute(), 'users', 'id', {
          databaseSchemaName: 'sales',
        }),
        false,
      );
    });
  });
};
