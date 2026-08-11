import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  JSONSerializer,
  migrationTableComponentFor,
  type SchemaComponent,
} from '../../../../core';
import { pgFormatter } from '../sql';

const migrationNames = (component: SchemaComponent): string[] =>
  component.migrations().map(({ name }) => name);

const ledgerDDL = (component: SchemaComponent): string[] =>
  component
    .migrations()
    .flatMap(({ sqls }) => sqls)
    .map(
      (sql) => pgFormatter.format(sql, { serializer: JSONSerializer }).query,
    );

describe('keeping the migration ledger in a PostgreSQL table', () => {
  it('creates the ledger on PostgreSQL with the columns the runner records into', () => {
    assert.deepStrictEqual(ledgerDDL(migrationTableComponentFor()), [
      "CREATE TABLE IF NOT EXISTS dmb_migrations (id SERIAL PRIMARY KEY, name VARCHAR (255) NOT NULL UNIQUE, application VARCHAR (255) NOT NULL DEFAULT 'default', sql_hash VARCHAR (64) NOT NULL, timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    ]);
  });

  it('creates the schema before the ledger when the ledger lives in its own schema', () => {
    const component = migrationTableComponentFor({
      schemaName: 'infra',
      createSchema: true,
    });

    assert.deepStrictEqual(migrationNames(component), [
      'dumboSchema:infra:001:create',
      'dumboTable:infra:dmb_migrations:001:createtable',
    ]);
    assert.deepStrictEqual(
      ledgerDDL(component)[0],
      'CREATE SCHEMA IF NOT EXISTS infra',
    );
  });

  it('keeps the ledger under the table name the application asked for', () => {
    assert.deepStrictEqual(
      ledgerDDL(
        migrationTableComponentFor({ tableName: 'app_migrations' }),
      )[0]?.startsWith('CREATE TABLE IF NOT EXISTS app_migrations ('),
      true,
    );
    assert.deepStrictEqual(
      migrationNames(
        migrationTableComponentFor({ tableName: 'app_migrations' }),
      ),
      ['dumboTable:app_migrations:001:createtable'],
    );
  });
});
