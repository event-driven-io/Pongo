import assert from 'node:assert';
import { describe, it } from 'vitest';
import { SQL, SQLDefaultSchemaNameToken } from '../../sql';
import { dumboSchema } from '../dumboSchema';
import { extensionComponent } from '../extensionComponent';
import { databaseComponent } from './databaseComponent';
import { databaseSchemaComponent } from './databaseSchemaComponent';
import { tableComponent } from './tableComponent';

const columns = {
  email: dumboSchema.column('email', SQL.column.type.Text, { notNull: true }),
};

const table = (tableName: string) => tableComponent({ tableName, columns });

describe('placing tables and schemas in a database', () => {
  it('holds unscoped tables in the nameless default schema', () => {
    const users = table('users');
    const database = databaseComponent({ tables: { users } });

    assert.ok(
      SQLDefaultSchemaNameToken.check(database.defaultSchema.schemaName),
    );
    assert.strictEqual(database.defaultSchema.tables.users, users);
    assert.strictEqual(database.tables, database.defaultSchema.tables);
    assert.strictEqual(database.tables.users, users);
    assert.deepStrictEqual(Object.keys(database.schemas), []);
  });

  it('keeps a default schema for a database declaring only named schemas', () => {
    const crm = databaseSchemaComponent({ schemaName: 'crm' });
    const database = databaseComponent({ schemas: { crm } });

    assert.deepStrictEqual(Object.keys(database.tables), []);
    assert.strictEqual(database.tables, database.defaultSchema.tables);
    assert.strictEqual(database.schemas.crm, crm);
  });

  it('declares unscoped tables and named schemas together', () => {
    const users = table('users');
    const crm = databaseSchemaComponent({
      schemaName: 'crm',
      tables: { roles: table('roles') },
    });
    const database = databaseComponent({ tables: { users }, schemas: { crm } });

    assert.strictEqual(database.tables.users, users);
    assert.strictEqual(database.schemas.crm, crm);
    assert.deepStrictEqual(Object.keys(database.schemas), ['crm']);
  });

  it('leaves the placement of unscoped tables to the dialect', () => {
    const database = databaseComponent({ tables: { users: table('users') } });

    assert.deepStrictEqual(
      database.migrations().map(({ name }) => name),
      ['table:users:create'],
    );
  });

  it('binds unscoped tables to the configured default schema name', () => {
    const database = databaseComponent({ tables: { users: table('users') } });

    assert.deepStrictEqual(
      database
        .migrations({ defaults: { schemaName: 'pongo' } })
        .map(({ name }) => name),
      ['schema:pongo:create', 'table:pongo:users:create'],
    );
  });

  it('keeps the default schema of a database declaring nothing', () => {
    const database = databaseComponent({});

    assert.deepStrictEqual(Object.keys(database.tables), []);
    assert.deepStrictEqual(database.migrations(), []);
    assert.deepStrictEqual(
      database
        .migrations({ defaults: { schemaName: 'pongo' } })
        .map(({ name }) => name),
      ['schema:pongo:create'],
    );
  });

  it('migrates the default schema before named schemas', () => {
    const database = databaseComponent({
      tables: { users: table('users') },
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          tables: { roles: table('roles') },
        }),
      },
    });

    assert.deepStrictEqual(
      database
        .migrations({ defaults: { schemaName: 'pongo' } })
        .map(({ name }) => name),
      [
        'schema:pongo:create',
        'table:pongo:users:create',
        'schema:crm:create',
        'table:crm:roles:create',
      ],
    );
  });

  it('attaches a table extension to the default schema, next to named schemas', () => {
    const eventStore = extensionComponent('event-store', {
      tables: { events: table('events') },
    });
    const database = databaseComponent({
      schemas: { crm: databaseSchemaComponent({ schemaName: 'crm' }) },
      extensions: { eventStore },
    });

    assert.strictEqual(database.extensions.eventStore, eventStore);
    assert.strictEqual(
      database.defaultSchema.extensions.eventStore,
      eventStore,
    );
    assert.deepStrictEqual(
      database
        .migrations({ defaults: { schemaName: 'pongo' } })
        .map(({ name }) => name),
      ['schema:pongo:create', 'table:pongo:events:create', 'schema:crm:create'],
    );
  });

  it('attaches a schema extension to the database, next to unscoped tables', () => {
    const eventStore = extensionComponent('event-store', {
      schemas: {
        readmodels: databaseSchemaComponent({
          schemaName: 'readmodels',
          tables: { summaries: table('summaries') },
        }),
      },
    });
    const database = databaseComponent({
      tables: { users: table('users') },
      extensions: { eventStore },
    });

    assert.strictEqual(database.extensions.eventStore, eventStore);
    assert.deepStrictEqual(Object.keys(database.defaultSchema.extensions), []);
    assert.deepStrictEqual(
      database.migrations().map(({ name }) => name),
      [
        'table:users:create',
        'schema:readmodels:create',
        'table:readmodels:summaries:create',
      ],
    );
  });

  it('traverses a neutral extension once', () => {
    let calls = 0;
    const audit = extensionComponent('audit', {
      migrations: () => {
        calls++;
        return [];
      },
    });

    databaseComponent({ tables: {}, extensions: { audit } }).migrations();

    assert.strictEqual(calls, 1);
  });

  it('traverses a table extension once', () => {
    let calls = 0;
    const eventStore = extensionComponent('event-store', {
      tables: { events: table('events') },
      migrations: () => {
        calls++;
        return [];
      },
    });

    databaseComponent({
      schemas: { crm: databaseSchemaComponent({ schemaName: 'crm' }) },
      extensions: { eventStore },
    }).migrations();

    assert.strictEqual(calls, 1);
  });
});
