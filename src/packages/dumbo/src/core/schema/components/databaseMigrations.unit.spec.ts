import assert from 'node:assert';
import { describe, it } from 'vitest';
import { SQL } from '../../sql';
import { extensionComponent } from '../extensionComponent';
import { sqlMigration } from '../sqlMigration';
import { databaseComponent } from './databaseComponent';
import {
  databaseMigrations,
  type DatabaseMigrationBuilder,
} from './databaseMigrations';
import { databaseSchemaComponent } from './databaseSchemaComponent';
import { indexComponent } from './indexComponent';
import { tableComponent } from './tableComponent';

describe('building migrations for a database hierarchy', () => {
  it('gives the driver complete identifiers in schema, table, and index order', () => {
    const usersEmail = indexComponent({
      indexName: 'users_email_idx',
      columnNames: ['email'],
      isUnique: true,
    });
    const users = tableComponent({
      tableName: 'users',
      indexes: { email: usersEmail },
    });
    const database = databaseComponent({
      databaseName: 'app',
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          tables: { crmUsers: users },
        }),
      },
    });
    const seen: unknown[] = [];
    const builder: DatabaseMigrationBuilder = {
      databaseSchema: (_schema, identifier) => {
        seen.push(identifier);
        return [sqlMigration('crm:create', [SQL`SELECT 1`])];
      },
      table: (_table, identifier) => {
        seen.push(identifier);
        return [sqlMigration('crm:users:create', [SQL`SELECT 2`])];
      },
      index: (_index, identifier) => {
        seen.push(identifier);
        return [sqlMigration('crm:users:email:create', [SQL`SELECT 3`])];
      },
    };

    const migrations = databaseMigrations(database, builder);

    assert.deepStrictEqual(seen, [
      { databaseName: 'app', databaseSchemaName: 'crm' },
      {
        databaseName: 'app',
        databaseSchemaName: 'crm',
        tableName: 'users',
      },
      {
        databaseName: 'app',
        databaseSchemaName: 'crm',
        tableName: 'users',
        indexName: 'users_email_idx',
      },
    ]);
    assert.deepStrictEqual(
      migrations.map(({ name }) => name),
      ['crm:create', 'crm:users:create', 'crm:users:email:create'],
    );
  });

  it('keeps declared migrations before driver migrations on each component', () => {
    const declaredTable = sqlMigration('users:declared', [SQL`SELECT 1`]);
    const declaredIndex = sqlMigration('users:email:declared', [SQL`SELECT 2`]);
    const database = databaseComponent({
      databaseName: 'app',
      schemas: {
        public: databaseSchemaComponent({
          schemaName: 'public',
          tables: {
            users: tableComponent({
              tableName: 'users',
              migrations: () => [declaredTable],
              indexes: {
                email: indexComponent({
                  indexName: 'users_email_idx',
                  columnNames: ['email'],
                  isUnique: false,
                  migrations: () => [declaredIndex],
                }),
              },
            }),
          },
        }),
      },
    });

    const migrations = databaseMigrations(database, {
      table: () => [sqlMigration('users:driver', [SQL`SELECT 3`])],
      index: () => [sqlMigration('users:email:driver', [SQL`SELECT 4`])],
    });

    assert.deepStrictEqual(
      migrations.map(({ name }) => name),
      [
        'users:declared',
        'users:driver',
        'users:email:declared',
        'users:email:driver',
      ],
    );
  });

  it('identifies tables nested in a schema extension without promoting them', () => {
    const events = tableComponent({ tableName: 'events' });
    const database = databaseComponent({
      databaseName: 'app',
      schemas: {
        audit: databaseSchemaComponent({
          schemaName: 'audit',
          extensions: {
            eventStore: extensionComponent('event-store', { events }),
          },
        }),
      },
    });
    const seen: unknown[] = [];

    databaseMigrations(database, {
      table: (_table, identifier) => {
        seen.push(identifier);
        return [];
      },
    });

    assert.deepStrictEqual(Object.keys(database.schemas.audit.tables), []);
    assert.deepStrictEqual(seen, [
      {
        databaseName: 'app',
        databaseSchemaName: 'audit',
        tableName: 'events',
      },
    ]);
  });

  it('rejects duplicate migration names before execution', () => {
    const database = databaseComponent({
      databaseName: 'app',
      schemas: {
        public: databaseSchemaComponent({
          schemaName: 'public',
          tables: {
            users: tableComponent({
              tableName: 'users',
              migrations: () => [
                sqlMigration('users:create', [SQL`SELECT 'declared'`]),
              ],
            }),
          },
        }),
      },
    });

    assert.throws(
      () =>
        databaseMigrations(database, {
          table: () => [sqlMigration('users:create', [SQL`SELECT 'driver'`])],
        }),
      /Duplicate migration name "users:create"/,
    );
  });

  it('applies one migration when a table and its builder declare the same one', () => {
    const database = databaseComponent({
      databaseName: 'app',
      schemas: {
        public: databaseSchemaComponent({
          schemaName: 'public',
          tables: {
            users: tableComponent({
              tableName: 'users',
              migrations: () => [
                sqlMigration('users:create', [SQL`SELECT 'shared'`]),
              ],
            }),
          },
        }),
      },
    });

    const migrations = databaseMigrations(database, {
      table: () => [sqlMigration('users:create', [SQL`SELECT 'shared'`])],
    });

    assert.deepStrictEqual(
      migrations.map((migration) => migration.name),
      ['users:create'],
    );
  });
});
