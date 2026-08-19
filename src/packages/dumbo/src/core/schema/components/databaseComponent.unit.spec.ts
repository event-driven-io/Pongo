import assert from 'node:assert';
import { describe, it } from 'vitest';
import { SQL, SQLDefaultSchemaNameToken } from '../../sql';
import { dumboSchema } from '../dumboSchema';
import { extensionComponent } from '../extensionComponent';
import { sqlMigration } from '../sqlMigration';
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

describe('database.findTable(tableName, options)', () => {
  it("database.findTable('users') finds a default-schema table", () => {
    const users = table('users');
    const database = databaseComponent({
      tables: { customerDirectory: users },
    });

    assert.strictEqual(database.findTable('users'), users);
  });

  it("database.findTable('users', { databaseSchemaName: 'crm' }) finds a named-schema table", () => {
    const users = table('users');
    const database = databaseComponent({
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          tables: { customerDirectory: users },
        }),
      },
    });

    assert.strictEqual(
      database.findTable('users', { databaseSchemaName: 'crm' }),
      users,
    );
  });

  it("database.findTable('users') finds a table in the configured default schema", () => {
    const users = table('users');
    const database = databaseComponent({
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          tables: { users },
        }),
      },
    });

    assert.strictEqual(
      database.findTable('users', { defaultSchemaName: 'crm' }),
      users,
    );
  });

  it("database.findTable('users', { databaseSchemaName: 'readmodels' }) finds a table contributed by a database extension", () => {
    const users = table('users');
    const eventStore = extensionComponent('event-store', {
      schemas: {
        readmodels: databaseSchemaComponent({
          schemaName: 'readmodels',
          tables: { users },
        }),
      },
    });
    const database = databaseComponent({ extensions: { eventStore } });

    assert.strictEqual(
      database.findTable('users', { databaseSchemaName: 'readmodels' }),
      users,
    );
  });

  it("database.findTable('users', { defaultSchemaName: 'crm' }) reports conflicting users declarations across the default and crm schemas", () => {
    const database = databaseComponent({
      tables: { users: table('users') },
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          tables: { users: table('users') },
        }),
      },
    });

    assert.throws(
      () => database.findTable('users', { defaultSchemaName: 'crm' }),
      /Table "users" is declared more than once in database schema "crm"/,
    );
  });

  it("database.findTable('users') reports conflicting users declarations from the application and its table extension", () => {
    const eventStore = extensionComponent('event-store', {
      tables: { users: table('users') },
    });
    const database = databaseComponent({
      tables: { users: table('users') },
      extensions: { eventStore },
    });

    assert.throws(
      () => database.findTable('users'),
      /Table "users" is declared more than once in the default database schema/,
    );
  });
});

describe('database.withSchema(schemas)', () => {
  it('returns a database containing its previous and added schemas', () => {
    const audit = databaseSchemaComponent({ schemaName: 'audit' });
    const crm = databaseSchemaComponent({ schemaName: 'crm' });
    const database = databaseComponent({ schemas: { audit } });

    const next = database.withSchema({ crm });

    assert.strictEqual(next.schemas.audit, audit);
    assert.strictEqual(next.schemas.crm, crm);
    assert.deepStrictEqual(Object.keys(database.schemas), ['audit']);
  });

  it('replaces one schema without changing unrelated schemas', () => {
    const audit = databaseSchemaComponent({ schemaName: 'audit' });
    const crm = databaseSchemaComponent({ schemaName: 'crm' });
    const replacement = crm.withTable({ users: table('users') });
    const database = databaseComponent({ schemas: { audit, crm } });

    const next = database.withSchema({ crm: replacement });

    assert.strictEqual(next.schemas.audit, audit);
    assert.strictEqual(next.schemas.crm, replacement);
    assert.strictEqual(database.schemas.crm, crm);
  });

  it('preserves default tables, extensions, and custom database migrations', () => {
    const users = table('users');
    const audit = extensionComponent('audit', {});
    const custom = sqlMigration('database:custom', [SQL`SELECT 1`]);
    const database = databaseComponent({
      databaseName: 'app',
      tables: { users },
      extensions: { audit },
      migrations: () => [custom],
    });

    const next = database.withSchema({
      crm: databaseSchemaComponent({ schemaName: 'crm' }),
    });

    assert.strictEqual(next.databaseName, 'app');
    assert.strictEqual(next.tables.users, users);
    assert.strictEqual(next.extensions.audit, audit);
    assert.deepStrictEqual(
      next.migrations().map(({ name }) => name),
      [custom.name, 'table:users:create', 'schema:crm:create'],
    );
  });
});

describe('database.withTable(tables)', () => {
  it('adds a table to the default schema without changing the source database', () => {
    const roles = table('roles');
    const users = table('users');
    const database = databaseComponent({ tables: { roles } });

    const next = database.withTable({ users });

    assert.strictEqual(next.tables.roles, roles);
    assert.strictEqual(next.tables.users, users);
    assert.strictEqual(next.defaultSchema.tables, next.tables);
    assert.deepStrictEqual(Object.keys(database.tables), ['roles']);
    assert.ok(SQLDefaultSchemaNameToken.check(next.defaultSchema.schemaName));
  });

  it('preserves database extensions and custom database migrations', () => {
    const audit = extensionComponent('audit', {});
    const custom = sqlMigration('database:custom', [SQL`SELECT 1`]);
    const database = databaseComponent({
      extensions: { audit },
      migrations: () => [custom],
    });

    const next = database.withTable({ users: table('users') });

    assert.strictEqual(next.extensions.audit, audit);
    assert.deepStrictEqual(
      next.migrations().map(({ name }) => name),
      [custom.name, 'table:users:create'],
    );
  });
});

describe('database.withTable(tables, schemaName)', () => {
  it('adds a table to an existing named schema', () => {
    const roles = table('roles');
    const users = table('users');
    const crm = databaseSchemaComponent({
      schemaName: 'crm',
      tables: { roles },
    });
    const database = databaseComponent({ schemas: { crm } });

    const next = database.withTable({ users }, 'crm');

    assert.strictEqual(next.schemas.crm.tables.roles, roles);
    assert.strictEqual(next.schemas.crm.tables.users, users);
    assert.strictEqual(database.schemas.crm, crm);
    assert.deepStrictEqual(Object.keys(crm.tables), ['roles']);
  });

  it('creates the named schema when it does not exist', () => {
    const users = table('users');

    const next = databaseComponent({}).withTable({ users }, 'crm');

    assert.strictEqual(next.schemas.crm.schemaName, 'crm');
    assert.strictEqual(next.schemas.crm.tables.users, users);
    assert.deepStrictEqual(
      next.migrations().map(({ name }) => name),
      ['schema:crm:create', 'table:crm:users:create'],
    );
  });

  it('creates a named schema whose name collides with an Object prototype member', () => {
    const users = table('users');

    const next = databaseComponent({}).withTable({ users }, 'toString');

    assert.strictEqual(next.schemas.toString.schemaName, 'toString');
    assert.strictEqual(next.schemas.toString.tables.users, users);
  });
});
