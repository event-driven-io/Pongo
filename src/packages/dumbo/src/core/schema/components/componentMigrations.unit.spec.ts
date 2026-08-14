import assert from 'node:assert';
import { describe, it } from 'vitest';
import { SQL, SQLDefaultSchemaNameToken } from '../../sql';
import { dumboSchema } from '../dumboSchema';
import { extensionComponent } from '../extensionComponent';
import {
  dedupeMigrations,
  type SchemaComponentContext,
} from '../schemaComponent';
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
        'schema:crm:create',
        'table:crm:users:create',
        'index:crm:users:users_email_idx:create',
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
        'schema:crm:create',
        'table:event_store:crm:users:create',
        'index:pongo_index:crm:users:users_email_idx:create',
        'table:crm:roles:create',
        'index:crm:roles:roles_email_idx:create',
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
      ['schema:crm:create', 'table:crm:users:create'],
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
      ['table:users:create', 'index:users:users_email_idx:create'],
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
      ['table:events:create'],
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
              tables: {
                events: tableComponent({ tableName: 'events', columns }),
              },
            }),
          },
        }),
      },
    });

    assert.deepStrictEqual(Object.keys(database.schemas.audit.tables), []);
    assert.deepStrictEqual(
      database.migrations().map(({ name }) => name),
      ['schema:audit:create', 'table:audit:events:create'],
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
      ['schema:crm:create', 'table:crm:users:create', 'users:backfill'],
    );
  });

  it('runs a baseline migration instead of generated schema table and index creates', () => {
    const baseline = sqlMigration(
      'event-store:baseline',
      [SQL`SELECT 'baseline'`],
      { baseline: true },
    );
    const database = databaseComponent({
      migrations: () => [baseline],
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          tables: { users: usersTable() },
        }),
      },
    });

    assert.deepStrictEqual(database.migrations(), [baseline]);
  });

  it('runs a table baseline while keeping generated schema creates around it', () => {
    const baseline = sqlMigration('users:baseline', [SQL`SELECT 'baseline'`], {
      baseline: true,
    });
    const backfill = sqlMigration('users:backfill', [SQL`SELECT 'backfill'`]);
    const database = databaseComponent({
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          tables: {
            users: tableComponent({
              tableName: 'users',
              columns,
              migrations: () => [baseline, backfill],
              indexes: {
                email: indexComponent({
                  indexName: 'users_email_idx',
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
      ['schema:crm:create', 'users:baseline', 'users:backfill'],
    );
  });

  it('emits nothing for a table that declares no columns', () => {
    const schema = databaseSchemaComponent({
      schemaName: 'crm',
      tables: { users: tableComponent({ tableName: 'users' }) },
    });

    assert.deepStrictEqual(
      schema.migrations().map(({ name }) => name),
      ['schema:crm:create'],
    );
  });

  it('refuses to create an index it cannot place in a table', () => {
    const index = indexComponent({
      indexName: 'users_email_idx',
      columnNames: ['email'],
      isUnique: false,
    });

    assert.throws(
      () => index.migrations(),
      /Index "users_email_idx" cannot be created outside a table/,
    );
  });

  it('places a default schema in the database default schema name', () => {
    const schema = databaseSchemaComponent({
      schemaName: SQLDefaultSchemaNameToken.from(),
      tables: { users: usersTable() },
    });

    assert.deepStrictEqual(
      schema
        .migrations({ defaults: { schemaName: 'pongo' } })
        .map(({ name }) => name),
      [
        'schema:pongo:create',
        'table:pongo:users:create',
        'index:pongo:users:users_email_idx:create',
      ],
    );
  });

  it('ignores the database default schema name in an explicitly named schema', () => {
    const schema = databaseSchemaComponent({
      schemaName: 'crm',
      tables: { users: usersTable() },
    });

    assert.deepStrictEqual(
      schema
        .migrations({
          databaseSchemaName: 'audit',
          defaults: { schemaName: 'pongo' },
        })
        .map(({ name }) => name),
      [
        'schema:crm:create',
        'table:crm:users:create',
        'index:crm:users:users_email_idx:create',
      ],
    );
  });

  it('runs custom migrations with the placement of the component declaring them', () => {
    const seen: SchemaComponentContext[] = [];
    const record = (context: SchemaComponentContext) => {
      seen.push(context);
      return [];
    };
    const database = databaseComponent({
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          migrations: record,
          tables: {
            users: tableComponent({
              tableName: 'users',
              columns,
              migrations: record,
              indexes: {
                email: indexComponent({
                  indexName: 'users_email_idx',
                  columnNames: ['email'],
                  isUnique: true,
                  migrations: record,
                }),
              },
            }),
          },
        }),
      },
    });

    database.migrations({ defaults: { schemaName: 'pongo' } });

    assert.deepStrictEqual(seen, [
      { databaseSchemaName: 'crm', defaults: { schemaName: 'pongo' } },
      {
        databaseSchemaName: 'crm',
        defaults: { schemaName: 'pongo' },
        tableName: 'users',
      },
      {
        databaseSchemaName: 'crm',
        defaults: { schemaName: 'pongo' },
        tableName: 'users',
      },
    ]);
  });

  it('escapes a colon in a schema name', () => {
    const schema = databaseSchemaComponent({
      schemaName: 'a:b',
      tables: { c: tableComponent({ tableName: 'c', columns }) },
    });

    assert.deepStrictEqual(
      schema.migrations().map(({ name }) => name),
      ['schema:a%3Ab:create', 'table:a%3Ab:c:create'],
    );
  });

  it('escapes a colon in a table name', () => {
    const schema = databaseSchemaComponent({
      schemaName: 'a',
      tables: { 'b:c': tableComponent({ tableName: 'b:c', columns }) },
    });

    assert.deepStrictEqual(
      schema.migrations().map(({ name }) => name),
      ['schema:a:create', 'table:a:b%3Ac:create'],
    );
  });

  it('escapes a colon in a component kind', () => {
    const schema = databaseSchemaComponent({
      schemaName: 'c',
      tables: {
        d: tableComponent({ tableName: 'd', kind: 'a:b', columns }),
      },
    });

    assert.deepStrictEqual(
      schema.migrations().map(({ name }) => name),
      ['schema:c:create', 'table:a%3Ab:c:d:create'],
    );
  });

  it('keeps a literal percent apart from the escape it looks like', () => {
    const literal = databaseSchemaComponent({
      schemaName: 'a%3Ab',
      tables: { c: tableComponent({ tableName: 'c', columns }) },
    });
    const colon = databaseSchemaComponent({
      schemaName: 'a:b',
      tables: { c: tableComponent({ tableName: 'c', columns }) },
    });

    assert.deepStrictEqual(
      literal.migrations().map(({ name }) => name),
      ['schema:a%253Ab:create', 'table:a%253Ab:c:create'],
    );
    assert.notDeepStrictEqual(
      literal.migrations().map(({ name }) => name),
      colon.migrations().map(({ name }) => name),
    );
  });

  it('keeps a relational and a Pongo table of the same name apart', () => {
    const context = { databaseSchemaName: 'crm' };
    const relational = tableComponent({ tableName: 'users', columns });
    const collection = tableComponent({
      tableName: 'users',
      kind: 'pongo_collection',
      columns,
    });

    assert.deepStrictEqual(
      dedupeMigrations([
        ...relational.migrations(context),
        ...collection.migrations(context),
      ]).map(({ name }) => name),
      ['table:crm:users:create', 'table:pongo_collection:crm:users:create'],
    );
  });

  it('creates no schema for a placement left to the dialect', () => {
    const schema = databaseSchemaComponent({
      schemaName: SQLDefaultSchemaNameToken.from(),
      migrations: () => [sqlMigration('users:backfill', [SQL`SELECT 1`])],
      tables: { users: usersTable() },
    });

    assert.deepStrictEqual(
      schema.migrations().map(({ name }) => name),
      [
        'users:backfill',
        'table:users:create',
        'index:users:users_email_idx:create',
      ],
    );
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
