import assert from 'node:assert';
import { describe, it } from 'vitest';
import { SQL, SQLDefaultSchemaNameToken } from '../../sql';
import { extensionComponent } from '../extensionComponent';
import { sqlMigration } from '../sqlMigration';
import { databaseSchemaComponent } from './databaseSchemaComponent';
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
  it('holds the very table declaration it was given', () => {
    const users = usersTable();
    const schema = databaseSchemaComponent({
      schemaName: 'reporting',
      tables: { users },
    });

    assert.strictEqual(schema.tables.users, users);
  });

  it('leaves the table declaration it was given reusable in another schema', () => {
    const users = usersTable();
    const reporting = databaseSchemaComponent({
      schemaName: 'reporting',
      tables: { users },
    });
    const audit = databaseSchemaComponent({
      schemaName: 'audit',
      tables: { users },
    });

    assert.strictEqual(reporting.tables.users, users);
    assert.strictEqual(audit.tables.users, users);
  });

  it('places extensions the same way it places tables', () => {
    const audit = extensionComponent('audit', {
      migrations: () => [sqlMigration('audit:001', [SQL`SELECT 1`])],
    });
    const schema = databaseSchemaComponent({
      schemaName: 'reporting',
      extensions: { audit },
    });

    assert.strictEqual(schema.extensions.audit, audit);
  });

  it('never lets a table report which schema it was placed in', () => {
    const users = usersTable();
    const schema = databaseSchemaComponent({
      schemaName: 'reporting',
      tables: { users },
    });

    assert.ok(!('schema' in schema.tables.users));
    assert.ok(!('parent' in schema.tables.users));
    assert.ok(!('table' in schema.tables.users.indexes.email));
  });

  it('rejects two table aliases resolving to the same table name in one schema', () => {
    assert.throws(
      () =>
        databaseSchemaComponent({
          schemaName: 'reporting',
          tables: {
            users: tableComponent({ tableName: 'users' }),
            customerDirectory: tableComponent({ tableName: 'users' }),
          },
        }),
      /Table "users" is declared more than once in database schema "reporting"/,
    );
  });

  it('rejects two table aliases resolving to the same table name in the default schema', () => {
    assert.throws(
      () =>
        databaseSchemaComponent({
          schemaName: SQLDefaultSchemaNameToken.from(),
          tables: {
            users: tableComponent({ tableName: 'users' }),
            customerDirectory: tableComponent({ tableName: 'users' }),
          },
        }),
      /Table "users" is declared more than once in database schema "the default schema"/,
    );
  });
});
