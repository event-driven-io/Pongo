import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  JSONSerializer,
  migrationTableComponentFor,
  type SchemaComponent,
} from '../../../../core';
import { sqliteFormatter } from '../sql';

const migrationNames = (component: SchemaComponent): string[] =>
  component.migrations().map(({ name }) => name);

const ledgerDDL = (component: SchemaComponent): string[] =>
  component
    .migrations()
    .flatMap(({ sqls }) => sqls)
    .map(
      (sql) =>
        sqliteFormatter.format(sql, { serializer: JSONSerializer }).query,
    );

describe('keeping the migration ledger in a SQLite table', () => {
  it('creates the ledger on SQLite with the same columns in dialect types', () => {
    assert.deepStrictEqual(ledgerDDL(migrationTableComponentFor()), [
      "CREATE TABLE IF NOT EXISTS dmb_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR (255) NOT NULL UNIQUE, application VARCHAR (255) NOT NULL DEFAULT 'default', sql_hash VARCHAR (64) NOT NULL, timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    ]);
  });

  it('leaves an existing schema untouched when it is not asked to create one', () => {
    assert.deepStrictEqual(
      migrationNames(migrationTableComponentFor({ schemaName: 'infra' })),
      ['dumboTable:infra:dmb_migrations:001:createtable'],
    );
  });

  it('creates no schema when the ledger is not schema-qualified', () => {
    assert.deepStrictEqual(
      migrationNames(migrationTableComponentFor({ createSchema: true })),
      ['dumboTable:dmb_migrations:001:createtable'],
    );
  });
});
