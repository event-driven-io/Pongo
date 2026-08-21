import assert from 'node:assert';
import { describe, it } from 'vitest';
import {
  DefaultDatabaseSchemaName,
  SQL,
  SQLIndexReference,
  SQLTableReference,
} from '../../sql';
import {
  databaseComponent,
  databaseSchemaComponent,
  extensionComponent,
  indexComponent,
  tableComponent,
} from '../components';
import { dumboSchema } from '../dumboSchema';
import { dedupeMigrations } from '../schemaComponent';
import { sqlMigration } from '../sqlMigration';

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
          schemaName: DefaultDatabaseSchemaName,
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
              schemaName: DefaultDatabaseSchemaName,
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

    assert.deepStrictEqual(Object.keys(database.schemas.audit.tables), [
      'events',
    ]);
    assert.deepStrictEqual(
      database.migrations().map(({ name }) => name),
      ['schema:audit:create', 'table:audit:events:create'],
    );
  });

  it('uses custom table migrations instead of generated table creation', () => {
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
      ['schema:crm:create', 'users:backfill'],
    );
  });

  it('runs custom database migrations before generated subtree migrations', () => {
    const custom = sqlMigration('event-store:custom', [SQL`SELECT 'custom'`]);
    const database = databaseComponent({
      migrations: () => [custom],
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          tables: { users: usersTable() },
        }),
      },
    });

    assert.deepStrictEqual(
      database.migrations().map(({ name }) => name),
      [
        custom.name,
        'schema:crm:create',
        'table:crm:users:create',
        'index:crm:users:users_email_idx:create',
      ],
    );
  });

  it('uses custom table migrations while still creating declared indexes', () => {
    const custom = sqlMigration('users:custom', [SQL`SELECT 'custom'`]);
    const backfill = sqlMigration('users:backfill', [SQL`SELECT 'backfill'`]);
    const database = databaseComponent({
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          tables: {
            users: tableComponent({
              tableName: 'users',
              columns,
              migrations: () => [custom, backfill],
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
      [
        'schema:crm:create',
        'users:custom',
        'users:backfill',
        'index:crm:users:users_email_idx:create',
      ],
    );
  });

  it('uses custom table and index migrations exactly once', () => {
    const database = databaseComponent({
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          tables: {
            users: tableComponent({
              tableName: 'users',
              migrations: () => [
                sqlMigration('users:001:create-table', [
                  SQL`CREATE TABLE users (email TEXT NOT NULL)`,
                ]),
              ],
              indexes: {
                email: indexComponent({
                  indexName: 'users_email_idx',
                  columnNames: ['email'],
                  isUnique: true,
                  migrations: () => [
                    sqlMigration('users:email:002:custom', [SQL`SELECT 1`]),
                  ],
                }),
              },
            }),
          },
        }),
      },
    });

    assert.deepStrictEqual(
      database.migrations().map(({ name }) => name),
      ['schema:crm:create', 'users:001:create-table', 'users:email:002:custom'],
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

    assert.throws(() => index.migrations(), {
      errorType: 'InvalidOperationError',
      errorCode: 400,
      message: /Index "users_email_idx" cannot be created outside a table/,
    });
  });

  it('places a default schema in the database default schema name', () => {
    const database = databaseComponent({
      defaultSchemaName: 'pongo',
      tables: { users: usersTable() },
    });

    assert.deepStrictEqual(
      database.migrations().map(({ name }) => name),
      [
        'schema:pongo:create',
        'table:pongo:users:create',
        'index:pongo:users:users_email_idx:create',
      ],
    );
  });

  it('ignores the database default schema name in an explicitly named schema', () => {
    const database = databaseComponent({
      defaultSchemaName: 'pongo',
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          tables: { users: usersTable() },
        }),
      },
    });

    assert.deepStrictEqual(
      database.schemas.crm.migrations().map(({ name }) => name),
      [
        'schema:crm:create',
        'table:crm:users:create',
        'index:crm:users:users_email_idx:create',
      ],
    );
  });

  it('runs custom migrations with the placement of the component declaring them', () => {
    const seen: unknown[] = [];
    const record = (placement: unknown) => {
      seen.push(placement);
      return [];
    };
    const database = databaseComponent({
      defaultSchemaName: 'pongo',
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

    database.migrations();

    assert.deepStrictEqual(seen, [
      'crm',
      SQLTableReference.from({
        databaseSchemaName: 'crm',
        tableName: 'users',
      }),
      SQLIndexReference.from({
        databaseSchemaName: 'crm',
        tableName: 'users',
        indexName: 'users_email_idx',
      }),
    ]);
  });

  it('runs table and index migrations with their declaring placement', () => {
    const seen: unknown[] = [];
    const record = (placement: unknown) => {
      seen.push(placement);
      return [];
    };
    const database = databaseComponent({
      defaultSchemaName: 'pongo',
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          tables: {
            users: tableComponent({
              tableName: 'users',
              columns,
              indexes: {
                email: indexComponent({
                  indexName: 'users_email_idx',
                  columnNames: ['email'],
                  isUnique: true,
                  migrations: record,
                }),
              },
            }),
            roles: tableComponent({
              tableName: 'roles',
              columns,
              migrations: record,
            }),
          },
        }),
      },
    });

    database.migrations();

    assert.deepStrictEqual(seen, [
      SQLIndexReference.from({
        databaseSchemaName: 'crm',
        tableName: 'users',
        indexName: 'users_email_idx',
      }),
      SQLTableReference.from({
        databaseSchemaName: 'crm',
        tableName: 'roles',
      }),
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
    const relational = tableComponent({
      tableName: 'users',
      databaseSchemaName: 'crm',
      columns,
    });
    const collection = tableComponent({
      tableName: 'users',
      databaseSchemaName: 'crm',
      kind: 'pongo_collection',
      columns,
    });

    assert.deepStrictEqual(
      dedupeMigrations([
        ...relational.migrations(),
        ...collection.migrations(),
      ]).map(({ name }) => name),
      ['table:crm:users:create', 'table:pongo_collection:crm:users:create'],
    );
  });

  it('creates no schema for a placement left to the dialect', () => {
    const schema = databaseSchemaComponent({
      schemaName: DefaultDatabaseSchemaName,
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

    assert.throws(() => database.migrations(), {
      errorType: 'InvalidOperationError',
      errorCode: 400,
      message: /Duplicate migration name "shared:001"/,
    });
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
