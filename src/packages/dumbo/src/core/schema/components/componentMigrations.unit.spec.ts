import assert from 'node:assert';
import { describe, it } from 'vitest';
import { SQL, SQLDefaultSchemaNameToken } from '../../sql';
import { dumboSchema } from '../dumboSchema';
import { extensionComponent } from '../extensionComponent';
import { sqlMigration } from '../sqlMigration';
import { databaseComponent } from './databaseComponent';
import { databaseSchemaComponent } from './databaseSchemaComponent';
import { indexComponent } from './indexComponent';
import { tableComponent } from './tableComponent';

const columns = {
  email: dumboSchema.column('email', SQL.column.type.Text, { notNull: true }),
};

const usersTable = () =>
  tableComponent({
    tableName: 'users',
    columns,
    indexes: {
      email: indexComponent({
        indexName: 'users_email_idx',
        columnNames: ['email'],
        isUnique: true,
      }),
    },
  });

describe('components emitting their own migrations', () => {
  it('names them in schema, table, and index order', () => {
    const database = databaseComponent({
      databaseName: 'app',
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          tables: { crmUsers: usersTable() },
        }),
      },
    });

    assert.deepStrictEqual(
      database.migrations().map(({ name }) => name),
      [
        'schema:relational:crm:001:create',
        'table:relational:crm:users:001:create',
        'index:relational:crm:users:users_email_idx:001:create',
      ],
    );
  });

  it('keeps custom component kinds local to their declarations', () => {
    const database = databaseComponent({
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          tables: {
            users: tableComponent({
              tableName: 'users',
              kind: 'event_store',
              columns,
              indexes: {
                email: indexComponent({
                  indexName: 'users_email_idx',
                  kind: 'pongo_index',
                  columnNames: ['email'],
                  isUnique: true,
                }),
              },
            }),
            roles: tableComponent({
              tableName: 'roles',
              columns,
              indexes: {
                email: indexComponent({
                  indexName: 'roles_email_idx',
                  columnNames: ['email'],
                  isUnique: true,
                }),
              },
            }),
          },
        }),
      },
    });

    assert.deepStrictEqual(
      database.migrations().map(({ name }) => name),
      [
        'schema:relational:crm:001:create',
        'table:event_store:crm:users:001:create',
        'index:pongo_index:crm:users:users_email_idx:001:create',
        'table:relational:crm:roles:001:create',
        'index:relational:crm:roles:roles_email_idx:001:create',
      ],
    );
  });

  it('builds the same migrations with and without a database name', () => {
    const schemas = () => ({
      crm: databaseSchemaComponent({
        schemaName: 'crm',
        tables: { users: tableComponent({ tableName: 'users', columns }) },
      }),
    });

    const named = databaseComponent({
      databaseName: 'app',
      schemas: schemas(),
    }).migrations();
    const unnamed = databaseComponent({ schemas: schemas() }).migrations();

    assert.deepStrictEqual(
      named.map(({ name }) => name),
      [
        'schema:relational:crm:001:create',
        'table:relational:crm:users:001:create',
      ],
    );
    assert.deepStrictEqual(unnamed, named);
  });

  it('leaves the schema segment out of a default schema', () => {
    const database = databaseComponent({
      schemas: {
        main: databaseSchemaComponent({
          schemaName: SQLDefaultSchemaNameToken.from(),
          tables: { users: usersTable() },
        }),
      },
    });

    assert.deepStrictEqual(
      database.migrations().map(({ name }) => name),
      [
        'schema:relational:001:create',
        'table:relational:users:001:create',
        'index:relational:users:users_email_idx:001:create',
      ],
    );
  });

  it('qualifies a table in a database extension with the default schema', () => {
    const database = databaseComponent({
      extensions: {
        eventStore: extensionComponent('event-store', {
          schemas: {
            default: databaseSchemaComponent({
              schemaName: SQLDefaultSchemaNameToken.from(),
              tables: {
                events: tableComponent({ tableName: 'events', columns }),
              },
            }),
          },
        }),
      },
    });

    assert.deepStrictEqual(
      database.migrations().map(({ name }) => name),
      ['schema:relational:001:create', 'table:relational:events:001:create'],
    );
  });

  it('qualifies a table nested in a schema extension with its schema', () => {
    const database = databaseComponent({
      databaseName: 'app',
      schemas: {
        audit: databaseSchemaComponent({
          schemaName: 'audit',
          extensions: {
            eventStore: extensionComponent('event-store', {
              schemas: {
                audit: databaseSchemaComponent({
                  schemaName: 'audit',
                  tables: {
                    events: tableComponent({ tableName: 'events', columns }),
                  },
                }),
              },
            }),
          },
        }),
      },
    });

    assert.deepStrictEqual(Object.keys(database.schemas.audit.tables), []);
    assert.deepStrictEqual(
      database.migrations().map(({ name }) => name),
      [
        'schema:relational:audit:001:create',
        'table:relational:audit:events:001:create',
      ],
    );
  });

  it('creates a table before running the migrations declared on it', () => {
    const database = databaseComponent({
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          tables: {
            users: tableComponent({
              tableName: 'users',
              columns,
              migrations: () => [
                sqlMigration('users:backfill', [SQL`SELECT 1`]),
              ],
            }),
          },
        }),
      },
    });

    assert.deepStrictEqual(
      database.migrations().map(({ name }) => name),
      [
        'schema:relational:crm:001:create',
        'table:relational:crm:users:001:create',
        'users:backfill',
      ],
    );
  });

  it('emits nothing for a table that declares no columns', () => {
    const schema = databaseSchemaComponent({
      schemaName: 'crm',
      tables: { users: tableComponent({ tableName: 'users' }) },
    });

    assert.deepStrictEqual(
      schema.migrations().map(({ name }) => name),
      ['schema:relational:crm:001:create'],
    );
  });

  it('emits nothing for an index it cannot place in a table', () => {
    const index = indexComponent({
      indexName: 'users_email_idx',
      columnNames: ['email'],
      isUnique: false,
    });

    assert.deepStrictEqual(index.migrations(), []);
  });

  it('rejects two components declaring the same migration name differently', () => {
    const database = databaseComponent({
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          tables: {
            users: tableComponent({
              tableName: 'users',
              migrations: () => [
                sqlMigration('shared:001', [SQL`SELECT 'users'`]),
              ],
            }),
            roles: tableComponent({
              tableName: 'roles',
              migrations: () => [
                sqlMigration('shared:001', [SQL`SELECT 'roles'`]),
              ],
            }),
          },
        }),
      },
    });

    assert.throws(
      () => database.migrations(),
      /Duplicate migration name "shared:001"/,
    );
  });

  it('applies one migration when two components declare the same one', () => {
    const shared = () => sqlMigration('shared:001', [SQL`SELECT 'shared'`]);
    const database = databaseComponent({
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          tables: {
            users: tableComponent({
              tableName: 'users',
              migrations: () => [shared()],
            }),
            roles: tableComponent({
              tableName: 'roles',
              migrations: () => [shared()],
            }),
          },
        }),
      },
    });

    assert.deepStrictEqual(
      database.migrations().filter(({ name }) => name === 'shared:001').length,
      1,
    );
  });
});
