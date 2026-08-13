import assert from 'node:assert';
import { describe, it } from 'vitest';
import { SQLDefaultSchemaNameToken } from '../../sql';
import { extensionComponent } from '../extensionComponent';
import { databaseComponent } from './databaseComponent';
import { databaseSchemaComponent } from './databaseSchemaComponent';
import { findTable, findTables } from './findTables';
import { tableComponent } from './tableComponent';

describe('finding tables placed in a database schema', () => {
  it('finds a table declared by the schema itself', () => {
    const users = tableComponent({ tableName: 'users' });
    const crm = databaseSchemaComponent({
      schemaName: 'crm',
      tables: { users },
    });
    const database = databaseComponent({ schemas: { crm } });

    assert.deepStrictEqual(
      findTables(database, { databaseSchemaName: 'crm', tableName: 'users' }),
      [{ databaseSchemaName: 'crm', table: users }],
    );
  });

  it('finds a table declared directly by the database', () => {
    const users = tableComponent({ tableName: 'users' });
    const database = databaseComponent({ tables: { users } });

    assert.deepStrictEqual(
      findTables(database, {
        databaseSchemaName: SQLDefaultSchemaNameToken.from(),
        tableName: 'users',
      }),
      [{ databaseSchemaName: SQLDefaultSchemaNameToken.from(), table: users }],
    );
  });

  it('finds a table declared by an extension attached to the database', () => {
    const events = tableComponent({ tableName: 'events' });
    const eventStore = extensionComponent('event-store', {
      tables: { events },
    });
    const database = databaseComponent({
      tables: {},
      extensions: { eventStore },
    });

    assert.deepStrictEqual(
      findTables(database, {
        databaseSchemaName: SQLDefaultSchemaNameToken.from(),
        tableName: 'events',
      }),
      [{ databaseSchemaName: SQLDefaultSchemaNameToken.from(), table: events }],
    );
  });

  it('finds a table declared by an extension attached to the schema', () => {
    const users = tableComponent({ tableName: 'users' });
    const crmExtension = extensionComponent('crm-extension', {
      tables: { users },
    });
    const crm = databaseSchemaComponent({
      schemaName: 'crm',
      extensions: { crmExtension },
    });
    const database = databaseComponent({ schemas: { crm } });

    assert.deepStrictEqual(
      findTables(database, { databaseSchemaName: 'crm', tableName: 'users' }),
      [{ databaseSchemaName: 'crm', table: users }],
    );
  });

  it('finds a table in a schema contributed by a database extension', () => {
    const summaries = tableComponent({ tableName: 'summaries' });
    const readmodels = databaseSchemaComponent({
      schemaName: 'readmodels',
      tables: { summaries },
    });
    const eventStore = extensionComponent('event-store', {
      schemas: { readmodels },
    });
    const database = databaseComponent({ extensions: { eventStore } });

    assert.deepStrictEqual(
      findTables(database, {
        databaseSchemaName: 'readmodels',
        tableName: 'summaries',
      }),
      [{ databaseSchemaName: 'readmodels', table: summaries }],
    );
  });

  it('matches a contributed schema by its resolved placement, not by its record key', () => {
    const users = tableComponent({ tableName: 'users' });
    const defaultSchema = databaseSchemaComponent({
      schemaName: SQLDefaultSchemaNameToken.from(),
      tables: { users },
    });
    const eventStore = extensionComponent('event-store', {
      schemas: { default: defaultSchema },
    });
    const database = databaseComponent({ extensions: { eventStore } });

    assert.deepStrictEqual(
      findTables(database, {
        databaseSchemaName: SQLDefaultSchemaNameToken.from(),
        tableName: 'users',
      }),
      [{ databaseSchemaName: SQLDefaultSchemaNameToken.from(), table: users }],
    );
    assert.deepStrictEqual(
      findTables(database, {
        databaseSchemaName: 'default',
        tableName: 'users',
      }),
      [],
    );
  });

  it('searches a configured default and a schema of that name as one namespace', () => {
    const direct = tableComponent({ tableName: 'users' });
    const named = tableComponent({ tableName: 'users' });
    const database = databaseComponent({
      tables: { users: direct },
      schemas: {
        pongo: databaseSchemaComponent({
          schemaName: 'pongo',
          tables: { users: named },
        }),
      },
    });

    assert.deepStrictEqual(
      findTables(database, {
        databaseSchemaName: 'pongo',
        tableName: 'users',
        defaults: { schemaName: 'pongo' },
      }),
      [
        { databaseSchemaName: 'pongo', table: direct },
        { databaseSchemaName: 'pongo', table: named },
      ],
    );
    assert.deepStrictEqual(
      findTables(database, {
        databaseSchemaName: 'pongo',
        tableName: 'users',
      }),
      [{ databaseSchemaName: 'pongo', table: named }],
    );
  });

  it('returns every match, the database declaration first', () => {
    const declared = tableComponent({ tableName: 'users' });
    const contributed = tableComponent({ tableName: 'users' });
    const crmExtension = extensionComponent('crm-extension', {
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          tables: { users: contributed },
        }),
      },
    });
    const crm = databaseSchemaComponent({
      schemaName: 'crm',
      tables: { users: declared },
    });
    const database = databaseComponent({
      schemas: { crm },
      extensions: { crmExtension },
    });

    const matches = findTables(database, {
      databaseSchemaName: 'crm',
      tableName: 'users',
    });

    assert.strictEqual(matches.length, 2);
    assert.strictEqual(matches[0]!.table, declared);
    assert.strictEqual(matches[1]!.table, contributed);
  });

  it('returns no match for a table name placed in another schema', () => {
    const users = tableComponent({ tableName: 'users' });
    const crm = databaseSchemaComponent({
      schemaName: 'crm',
      tables: { users },
    });
    const database = databaseComponent({ schemas: { crm } });

    assert.deepStrictEqual(
      findTables(database, { databaseSchemaName: 'crm', tableName: 'orders' }),
      [],
    );
    assert.deepStrictEqual(
      findTables(database, { databaseSchemaName: 'audit', tableName: 'users' }),
      [],
    );
  });
});

describe('finding the single table placed under a physical name', () => {
  it('returns the only match', () => {
    const users = tableComponent({ tableName: 'users' });
    const database = databaseComponent({ tables: { users } });

    assert.deepStrictEqual(
      findTable(database, {
        databaseSchemaName: SQLDefaultSchemaNameToken.from(),
        tableName: 'users',
      }),
      { databaseSchemaName: SQLDefaultSchemaNameToken.from(), table: users },
    );
  });

  it('returns nothing when no table is placed under that name', () => {
    const database = databaseComponent({ tables: {} });

    assert.strictEqual(
      findTable(database, {
        databaseSchemaName: SQLDefaultSchemaNameToken.from(),
        tableName: 'users',
      }),
      undefined,
    );
  });

  it('rejects two tables sharing one physical name in the default schema', () => {
    const declared = tableComponent({ tableName: 'users' });
    const contributed = tableComponent({ tableName: 'users' });
    const eventStore = extensionComponent('event-store', {
      tables: { users: contributed },
    });
    const database = databaseComponent({
      tables: { users: declared },
      extensions: { eventStore },
    });

    assert.throws(
      () =>
        findTable(database, {
          databaseSchemaName: SQLDefaultSchemaNameToken.from(),
          tableName: 'users',
        }),
      /Table "users" is declared more than once in the default database schema/,
    );
  });

  it('rejects two tables sharing one physical name in a named schema', () => {
    const declared = tableComponent({ tableName: 'users' });
    const contributed = tableComponent({ tableName: 'users' });
    const crmExtension = extensionComponent('crm-extension', {
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          tables: { users: contributed },
        }),
      },
    });
    const database = databaseComponent({
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          tables: { users: declared },
        }),
      },
      extensions: { crmExtension },
    });

    assert.throws(
      () =>
        findTable(database, { databaseSchemaName: 'crm', tableName: 'users' }),
      /Table "users" is declared more than once in database schema "crm"/,
    );
  });
});
