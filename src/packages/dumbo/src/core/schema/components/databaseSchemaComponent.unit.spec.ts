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

  it('databaseSchemaComponent({ tables: { users, customerDirectory } }) reports that both application aliases use the users table', () => {
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

  it('databaseSchemaComponent({ tables: { users, customerDirectory } }) reports conflicting users aliases in the default schema', () => {
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

describe('schema.findTable(tableName)', () => {
  it("schema.findTable('users') finds a table by its physical name", () => {
    const users = usersTable();
    const schema = databaseSchemaComponent({
      schemaName: 'reporting',
      tables: { customerDirectory: users },
    });

    assert.strictEqual(schema.findTable('users'), users);
  });

  it("schema.findTable('users') finds a table contributed by an extension", () => {
    const users = usersTable();
    const crm = extensionComponent('crm', { tables: { users } });
    const schema = databaseSchemaComponent({
      schemaName: 'reporting',
      extensions: { crm },
    });

    assert.strictEqual(schema.findTable('users'), users);
  });

  it("schema.findTable('users') returns undefined when the table does not exist", () => {
    const schema = databaseSchemaComponent({ schemaName: 'reporting' });

    assert.strictEqual(schema.findTable('users'), undefined);
  });

  it("schema.findTable('users') reports conflicting users declarations from the application schema and its table extension", () => {
    const crm = extensionComponent('crm', {
      tables: { users: usersTable() },
    });
    const schema = databaseSchemaComponent({
      schemaName: 'reporting',
      tables: { users: usersTable() },
      extensions: { crm },
    });

    assert.throws(
      () => schema.findTable('users'),
      /Table "users" is declared more than once in database schema "reporting"/,
    );
  });
});

describe('schema.withTable(tables)', () => {
  it('returns a schema containing its previous and added tables', () => {
    const roles = tableComponent({ tableName: 'roles' });
    const users = usersTable();
    const schema = databaseSchemaComponent({
      schemaName: 'reporting',
      tables: { roles },
    });

    const next = schema.withTable({ users });

    assert.strictEqual(next.tables.roles, roles);
    assert.strictEqual(next.tables.users, users);
  });

  it('leaves the source schema and source table records unchanged', () => {
    const roles = tableComponent({ tableName: 'roles' });
    const sourceTables = { roles };
    const schema = databaseSchemaComponent({
      schemaName: 'reporting',
      tables: sourceTables,
    });

    const next = schema.withTable({ users: usersTable() });

    assert.notStrictEqual(next, schema);
    assert.deepStrictEqual(Object.keys(schema.tables), ['roles']);
    assert.deepStrictEqual(Object.keys(sourceTables), ['roles']);
    assert.ok(Object.isFrozen(next.tables));
  });

  it('withTable preserves custom schema migration ownership and child traversal', () => {
    const audit = extensionComponent('audit', {
      migrations: () => [sqlMigration('audit:001', [SQL`SELECT 1`])],
    });
    const custom = sqlMigration('reporting:custom', [SQL`SELECT 2`]);
    const customSchema = databaseSchemaComponent({
      schemaName: 'reporting',
      kind: 'read_model',
      extensions: { audit },
      migrations: () => [custom],
    });
    const generatedSchema = databaseSchemaComponent({
      schemaName: 'reporting',
      kind: 'read_model',
    });

    const nextCustom = customSchema.withTable({ users: usersTable() });
    const nextGenerated = generatedSchema.withTable({
      users: tableComponent({ tableName: 'users' }),
    });

    assert.strictEqual(nextCustom.schemaName, 'reporting');
    assert.strictEqual(nextCustom.extensions.audit, audit);
    assert.deepStrictEqual(
      nextCustom.migrations().map(({ name }) => name),
      [
        custom.name,
        'index:reporting:users:users_email_idx:create',
        'audit:001',
      ],
    );
    assert.deepStrictEqual(
      nextGenerated.migrations().map(({ name }) => name),
      ['schema:read_model:reporting:create'],
    );
  });

  it("schema.withTable({ customerDirectory: table('users') }) reports that the application already declared the users table", () => {
    const schema = databaseSchemaComponent({
      schemaName: 'reporting',
      tables: { users: usersTable() },
    });

    assert.throws(
      () =>
        schema.withTable({
          customerDirectory: tableComponent({ tableName: 'users' }),
        }),
      /Table "users" is declared more than once in database schema "reporting"/,
    );
  });
});
