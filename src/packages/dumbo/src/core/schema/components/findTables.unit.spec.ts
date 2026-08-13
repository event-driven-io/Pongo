import assert from 'node:assert';
import { describe, it } from 'vitest';
import { SQLDefaultSchemaNameToken } from '../../sql';
import { extensionComponent } from '../extensionComponent';
import {
  databaseComponent,
  defaultDatabaseSchemaKey,
} from './databaseComponent';
import { databaseSchemaComponent } from './databaseSchemaComponent';
import { findTables } from './findTables';
import { tableComponent } from './tableComponent';

describe('finding tables placed in a database schema', () => {
  it('finds a table declared by the schema itself', () => {
    const users = tableComponent({ tableName: 'users' });
    const crm = databaseSchemaComponent({
      schemaName: 'crm',
      tables: { users },
    });
    const database = databaseComponent({ schemas: { crm } });

    assert.deepStrictEqual(findTables(database, 'crm', 'users'), [
      { schema: crm, table: users },
    ]);
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

    assert.deepStrictEqual(findTables(database, 'crm', 'users'), [
      { schema: crm, table: users },
    ]);
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

    assert.deepStrictEqual(findTables(database, 'readmodels', 'summaries'), [
      { schema: readmodels, table: summaries },
    ]);
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
      findTables(database, defaultDatabaseSchemaKey, 'users'),
      [{ schema: defaultSchema, table: users }],
    );
    assert.deepStrictEqual(findTables(database, 'default', 'users'), []);
  });

  it('returns every match, the schema declaration first', () => {
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

    const matches = findTables(database, 'crm', 'users');

    assert.strictEqual(matches.length, 2);
    assert.strictEqual(matches[0]!.schema, crm);
    assert.strictEqual(matches[0]!.table, declared);
    assert.strictEqual(matches[1]!.schema, crmExtension.schemas.crm);
    assert.strictEqual(matches[1]!.table, contributed);
  });

  it('returns no match for a table name placed in another schema', () => {
    const users = tableComponent({ tableName: 'users' });
    const crm = databaseSchemaComponent({
      schemaName: 'crm',
      tables: { users },
    });
    const database = databaseComponent({ schemas: { crm } });

    assert.deepStrictEqual(findTables(database, 'crm', 'orders'), []);
    assert.deepStrictEqual(findTables(database, 'audit', 'users'), []);
  });
});
