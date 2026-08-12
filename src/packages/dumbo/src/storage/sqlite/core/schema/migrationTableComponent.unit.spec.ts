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

  it('renders no schema statement on SQLite when the ledger is schema-qualified', () => {
    const component = migrationTableComponentFor({ schemaName: 'infra' });

    assert.deepStrictEqual(migrationNames(component), [
      'schema:relational:infra:001:create',
      'table:relational:infra:dmb_migrations:001:create',
    ]);
    assert.deepStrictEqual(ledgerDDL(component)[0], '');
  });

  it('creates no schema when the ledger is not schema-qualified', () => {
    assert.deepStrictEqual(migrationNames(migrationTableComponentFor()), [
      'table:relational:dmb_migrations:001:create',
    ]);
  });
});
