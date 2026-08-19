import { DefaultDatabaseSchemaName } from '@event-driven-io/dumbo';
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { pongoSchema, type PongoSchemaConfig } from '../core';
import { parseDbSchemaFromConfig } from './configFile';

const configWith = (
  dbs: PongoSchemaConfig['schema']['dbs'],
): Partial<{ default: PongoSchemaConfig }> => ({
  default: {
    schema: pongoSchema.client(dbs),
  },
});

describe('Pongo CLI config database resolution', () => {
  it('accepts a single named database without an explicit selector', () => {
    const parsed = parseDbSchemaFromConfig(
      configWith({
        app: pongoSchema.db('app', {
          collections: { users: pongoSchema.collection('users') },
        }),
      }),
    );

    assert.deepStrictEqual(parsed, {
      name: 'app',
      collections: [
        { name: 'users', databaseSchemaName: DefaultDatabaseSchemaName },
      ],
    });
  });

  it('selects a named database when requested', () => {
    const parsed = parseDbSchemaFromConfig(
      configWith({
        app: pongoSchema.db('app', {
          collections: { users: pongoSchema.collection('users') },
        }),
        reporting: pongoSchema.db('reporting', {
          collections: { reports: pongoSchema.collection('reports') },
        }),
      }),
      'reporting',
    );

    assert.deepStrictEqual(parsed, {
      name: 'reporting',
      collections: [
        { name: 'reports', databaseSchemaName: DefaultDatabaseSchemaName },
      ],
    });
  });

  it('fails with declared database names when several are present without a selector', () => {
    const parsed = parseDbSchemaFromConfig(
      configWith({
        app: pongoSchema.db('app', {
          collections: { users: pongoSchema.collection('users') },
        }),
        reporting: pongoSchema.db('reporting', {
          collections: { reports: pongoSchema.collection('reports') },
        }),
      }),
    );

    assert.strictEqual(
      parsed,
      'Error: Config defines multiple databases. Select one with --database-name. Found: app, reporting',
    );
  });

  it('keeps accepting a single unnamed database', () => {
    const parsed = parseDbSchemaFromConfig(
      configWith({
        database: pongoSchema.db({
          collections: { users: pongoSchema.collection('users') },
        }),
      }),
    );

    assert.deepStrictEqual(parsed, {
      name: undefined,
      collections: [
        { name: 'users', databaseSchemaName: DefaultDatabaseSchemaName },
      ],
    });
  });

  it('reports the available names when a requested database is missing', () => {
    const parsed = parseDbSchemaFromConfig(
      configWith({
        app: pongoSchema.db('app', {
          collections: { users: pongoSchema.collection('users') },
        }),
      }),
      'missing',
    );

    assert.strictEqual(
      parsed,
      'Error: Config does not define database "missing". Found: app',
    );
  });
});
