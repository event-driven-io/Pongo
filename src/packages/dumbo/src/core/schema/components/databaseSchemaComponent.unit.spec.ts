import assert from 'node:assert';
import { describe, it } from 'vitest';
import { SQL, SQLDefaultSchemaNameToken } from '../../sql';
import { extensionComponent } from '../extensionComponent';
import { sqlMigration } from '../sqlMigration';
import {
  databaseSchemaComponent,
  resolveDatabaseSchemaName,
} from './databaseSchemaComponent';
import { indexComponent } from './indexComponent';
import { tableComponent } from './tableComponent';

const usersTable = () =>
  tableComponent({
    tableName: 'users',
    indexes: {
      email: indexComponent({
        indexName: 'users_email_idx',
        columnNames: ['email'],
        isUnique: false,
      }),
    },
  });

describe('declaring a schema with tables', () => {
  it('exposes its own copy of a table rather than the declaration it was given', () => {
    const users = usersTable();
    const schema = databaseSchemaComponent({
      schemaName: 'reporting',
      tables: { users },
    });

    assert.notStrictEqual(schema.tables.users, users);
    assert.strictEqual(schema.tables.users.tableName, 'users');
    assert.strictEqual(schema.tables.users.schema(), schema);
  });

  it('leaves the table declaration it was given on the default schema', () => {
    const users = usersTable();
    databaseSchemaComponent({ schemaName: 'reporting', tables: { users } });

    assert.strictEqual(users.schema(), undefined);
    assert.deepStrictEqual(
      resolveDatabaseSchemaName(users, 'Table "users"'),
      SQLDefaultSchemaNameToken.from(),
    );
  });

  it('places the indexes of its tables in the same schema', () => {
    const schema = databaseSchemaComponent({
      schemaName: 'reporting',
      tables: { users: usersTable() },
    });

    assert.strictEqual(
      schema.tables.users.indexes.email.table()!.schema()!.schemaName,
      'reporting',
    );
  });

  it('places extensions the same way it places tables', () => {
    const audit = extensionComponent(
      'audit',
      {},
      { migrations: () => [sqlMigration('audit:001', [SQL`SELECT 1`])] },
    );
    const schema = databaseSchemaComponent({
      schemaName: 'reporting',
      extensions: { audit },
    });

    assert.notStrictEqual(schema.extensions.audit, audit);
    assert.strictEqual(schema.extensions.audit.parent, schema);
  });

  it('leaves the tables of an unnamed schema on the default schema', () => {
    const schema = databaseSchemaComponent({ tables: { users: usersTable() } });

    assert.deepStrictEqual(
      resolveDatabaseSchemaName(schema.tables.users, 'Table "users"'),
      SQLDefaultSchemaNameToken.from(),
    );
  });
});
