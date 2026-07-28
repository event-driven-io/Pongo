import assert from 'node:assert';
import { describe, it } from 'vitest';
import {
  databaseComponent,
  databaseSchemaComponent,
  extensionComponent,
  tableComponent,
} from '../../../../core';
import { DefaultSQLiteMigratorOptions } from './migrations';

describe('SQLite logical schema mapping', () => {
  it('validates expanded database schema components in strict mode', () => {
    const auditUsers = tableComponent({ tableName: 'users' });
    const publicUsers = tableComponent({ tableName: 'users' });
    const feature = extensionComponent('audit', {
      audit: databaseSchemaComponent({
        schemaName: 'audit',
        tables: { users: auditUsers },
      }),
    });
    const database = databaseComponent({
      databaseName: 'app',
      schemas: {
        public: databaseSchemaComponent({
          schemaName: 'public',
          tables: { users: publicUsers },
        }),
      },
      extensions: { feature },
    });

    assert.throws(
      () => DefaultSQLiteMigratorOptions.schema?.validateComponent?.(database),
      /Logical schema collision detected: users/,
    );
  });
});
