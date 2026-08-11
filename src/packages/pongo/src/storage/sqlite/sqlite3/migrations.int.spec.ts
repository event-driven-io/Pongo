import { SQL } from '@event-driven-io/dumbo';
import {
  SQLiteConnectionString,
  sqlite3Pool,
} from '@event-driven-io/dumbo/sqlite3';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, it } from 'vitest';
import { pongoClient, pongoSchema } from '../../../core';
import { sqlite3Driver } from '.';

describe('SQLite3 migration integration', () => {
  const fileName = path.resolve(
    '/tmp',
    `pongo-sqlite3-migrations-${randomUUID()}.db`,
  );
  const connectionString = SQLiteConnectionString(`file:${fileName}`);

  afterEach(() => {
    for (const suffix of ['', '-shm', '-wal']) {
      try {
        fs.unlinkSync(`${fileName}${suffix}`);
      } catch {
        // ignore missing files
      }
    }
  });

  it('applies default and schema-prefixed collection migrations in order', async () => {
    const schema = pongoSchema.client({
      database: pongoSchema.db({
        schemas: {
          main: pongoSchema.schema('main', {
            users: pongoSchema.collection('users'),
            explicitDefaultUsers: pongoSchema.collection(
              'explicit_default_users',
              {
                indexes: {
                  email: pongoSchema.index(
                    'explicit_default_email_idx',
                    'email',
                  ),
                },
              },
            ),
          }),
          crm: pongoSchema.schema('crm', {
            crmUsers: pongoSchema.collection('users', {
              indexes: {
                email: pongoSchema.index('users_email_idx', 'email'),
                externalId: pongoSchema.index.unique('users_external_id_uq', [
                  'external',
                  'id',
                ]),
                document: pongoSchema.index.json('users_data_idx'),
                custom: pongoSchema.index.custom(
                  'users_custom_data_idx',
                  ({ tableReference, indexReference }) =>
                    SQL`CREATE INDEX IF NOT EXISTS ${indexReference} ON ${tableReference} (data)`,
                ),
              },
            }),
          }),
          audit: pongoSchema.schema('audit', {
            auditUsers: pongoSchema.collection('users', {
              indexes: {
                email: pongoSchema.index('audit_users_email_idx', 'email'),
              },
            }),
          }),
        },
      }),
    });
    const client = pongoClient({
      driver: sqlite3Driver,
      connectionString,
      schema: { definition: schema },
    });
    const pool = sqlite3Pool({ fileName });
    const expectedMigrationNames = [
      'pongoSchema:main:001:create',
      'pongoCollection:main:users:001:createtable',
      'pongoCollection:main:explicit_default_users:001:createtable',
      'pongoIndex:main:explicit_default_users:explicit_default_email_idx:create',
      'pongoSchema:crm:001:create',
      'pongoCollection:crm:users:001:createtable',
      'pongoIndex:crm:users:users_email_idx:create',
      'pongoIndex:crm:users:users_external_id_uq:create',
      'pongoIndex:crm:users:users_data_idx:create',
      'pongoIndex:crm:users:users_custom_data_idx:create',
      'pongoSchema:audit:001:create',
      'pongoCollection:audit:users:001:createtable',
      'pongoIndex:audit:users:audit_users_email_idx:create',
    ];
    const expectedAppliedNames = expectedMigrationNames.filter(
      (name) => !name.startsWith('pongoSchema:'),
    );

    try {
      const db = client.db('database');
      assert.deepStrictEqual(
        db.schema.migrations.map((migration) => migration.name),
        expectedMigrationNames,
      );
      await db.schema.migrate();
      await db.schema.migrate();

      await db
        .collection('users')
        .insertOne({ _id: 'default-user', email: 'default@test' });
      await db
        .collection('users', { databaseSchemaName: 'crm' })
        .insertOne({ _id: 'crm-user', email: 'crm@test' });

      const objects = await pool.execute.query<{ name: string; type: string }>(
        SQL`
          SELECT name, type
          FROM sqlite_master
          WHERE name IN (
            'users',
            'explicit_default_users',
            'crm.users',
            'audit.users',
            'explicit_default_email_idx',
            'crm.users_email_idx',
            'crm.users_external_id_uq',
            'crm.users_data_idx',
            'crm.users_custom_data_idx',
            'audit.audit_users_email_idx'
          )
          ORDER BY type, name`,
      );
      const migrationNames = await pool.execute.query<{ name: string }>(
        SQL`SELECT name FROM dmb_migrations ORDER BY id`,
      );
      const defaultCount = await pool.execute.query<{ count: number }>(
        SQL`SELECT COUNT(*) as count FROM users`,
      );
      const crmCount = await pool.execute.query<{ count: number }>(
        SQL`SELECT COUNT(*) as count FROM ${SQL.identifier('crm.users')}`,
      );
      const auditCount = await pool.execute.query<{ count: number }>(
        SQL`SELECT COUNT(*) as count FROM ${SQL.identifier('audit.users')}`,
      );

      assert.deepStrictEqual(objects.rows, [
        { name: 'audit.audit_users_email_idx', type: 'index' },
        { name: 'crm.users_custom_data_idx', type: 'index' },
        { name: 'crm.users_data_idx', type: 'index' },
        { name: 'crm.users_email_idx', type: 'index' },
        { name: 'crm.users_external_id_uq', type: 'index' },
        { name: 'explicit_default_email_idx', type: 'index' },
        { name: 'audit.users', type: 'table' },
        { name: 'crm.users', type: 'table' },
        { name: 'explicit_default_users', type: 'table' },
        { name: 'users', type: 'table' },
      ]);
      assert.deepStrictEqual(
        migrationNames.rows.map((row) => row.name),
        expectedAppliedNames,
      );
      assert.strictEqual(defaultCount.rows[0]?.count, 1);
      assert.strictEqual(crmCount.rows[0]?.count, 1);
      assert.strictEqual(auditCount.rows[0]?.count, 0);
    } finally {
      await client.close();
      await pool.close();
    }
  });
});
