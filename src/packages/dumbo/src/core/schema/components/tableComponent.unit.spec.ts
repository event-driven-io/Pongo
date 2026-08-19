import assert from 'node:assert';
import { describe, it } from 'vitest';
import { SQL, SQLDefaultSchemaNameToken } from '../../sql';
import { dumboSchema } from '../dumboSchema';
import { indexComponent } from './indexComponent';
import { tableComponent } from './tableComponent';

const columns = {
  email: dumboSchema.column('email', SQL.column.type.Text, { notNull: true }),
};

const usersTable = (databaseSchemaName?: string) =>
  tableComponent({
    tableName: 'users',
    ...(databaseSchemaName !== undefined ? { databaseSchemaName } : {}),
    columns,
    indexes: {
      email: indexComponent({
        indexName: 'users_email_idx',
        columnNames: ['email'],
        isUnique: true,
      }),
    },
  });

const pongoCollectionComponentType = Symbol('pongo.collectionComponent');

const pongoCollection = (databaseSchemaName?: string) =>
  Object.freeze({
    ...usersTable(databaseSchemaName),
    [pongoCollectionComponentType]: true,
  });

describe('declaring a table in a database schema', () => {
  it('leaves the placement of a table declaring no database schema to the dialect', () => {
    const users = usersTable();

    assert.ok(
      SQLDefaultSchemaNameToken.check(users.tableReference.databaseSchemaName),
    );
    assert.strictEqual(users.tableReference.tableName, 'users');
    assert.deepStrictEqual(
      users.migrations().map(({ name }) => name),
      ['table:users:create', 'index:users:users_email_idx:create'],
    );
  });

  it('reports the database schema name it was declared with', () => {
    const users = usersTable('crm');

    assert.strictEqual(users.tableReference.databaseSchemaName, 'crm');
    assert.strictEqual(users.tableReference.tableName, 'users');
    assert.deepStrictEqual(
      users.migrations().map(({ name }) => name),
      ['table:crm:users:create', 'index:crm:users:users_email_idx:create'],
    );
  });

  it('places the indexes it declares in itself', () => {
    const users = usersTable('crm');

    assert.deepStrictEqual(
      users.indexes.email.tableReference,
      users.tableReference,
    );
  });
});

describe('table.withTableName(tableName)', () => {
  it('returns a table under the new name, leaving the source table unchanged', () => {
    const users = usersTable('crm');

    const accounts = users.withTableName('accounts');

    assert.strictEqual(accounts.tableName, 'accounts');
    assert.strictEqual(accounts.tableReference.tableName, 'accounts');
    assert.strictEqual(accounts.tableReference.databaseSchemaName, 'crm');
    assert.deepStrictEqual(
      accounts.migrations().map(({ name }) => name),
      [
        'table:crm:accounts:create',
        'index:crm:accounts:users_email_idx:create',
      ],
    );
    assert.strictEqual(users.tableName, 'users');
    assert.strictEqual(users.tableReference.tableName, 'users');
  });

  it('keeps the properties an outer factory added to the table', () => {
    const collection = pongoCollection('crm');

    const renamed = collection.withTableName('accounts');

    assert.strictEqual(renamed.tableName, 'accounts');
    assert.ok(pongoCollectionComponentType in renamed);
  });
});

describe('table.withDatabaseSchemaName(databaseSchemaName)', () => {
  it('returns a table in the new database schema, leaving the source table unchanged', () => {
    const users = usersTable();

    const placed = users.withDatabaseSchemaName('crm');

    assert.strictEqual(placed.tableReference.databaseSchemaName, 'crm');
    assert.deepStrictEqual(
      placed.migrations().map(({ name }) => name),
      ['table:crm:users:create', 'index:crm:users:users_email_idx:create'],
    );
    assert.ok(
      SQLDefaultSchemaNameToken.check(users.tableReference.databaseSchemaName),
    );
  });

  it('keeps the properties an outer factory added to the table', () => {
    const collection = pongoCollection();

    const placed = collection.withDatabaseSchemaName('crm');

    assert.strictEqual(placed.tableReference.databaseSchemaName, 'crm');
    assert.ok(pongoCollectionComponentType in placed);
  });
});
