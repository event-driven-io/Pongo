import assert from 'node:assert';
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, expectTypeOf, it } from 'vitest';
import { SQL } from '../sql';
import {
  DatabaseSchemaURNType,
  FeatureSchemaComponentURNType,
  SchemaComponentMigrator,
  TableURNType,
  assertLogicalSchemaMapping,
  columnSchemaComponent,
  databaseSchemaComponent,
  databaseFeatureSchemaComponent,
  databaseSchemaSchemaComponent,
  databaseSchemaFeatureSchemaComponent,
  featureSchemaComponent,
  findComponent,
  findComponents,
  findExpandedSchemaComponentsOfType,
  findFeature,
  findFeatures,
  isFeatureSchemaComponent,
  indexSchemaComponent,
  extendSchemaComponent,
  schemaComponent,
  sqlMigration,
  tableSchemaComponent,
  type AnySchemaComponent,
  type TableSchemaComponent,
} from './index';

const requireSingleComponent = <T extends AnySchemaComponent>(
  root: AnySchemaComponent,
  keyPrefix: string,
  label: string,
): T => {
  const matches = findComponents<T>(root, keyPrefix);

  if (matches.length === 1) return matches[0]!;

  if (matches.length === 0) {
    throw new Error(`Expected one ${label}, found none`);
  }

  throw new Error(
    `Expected one ${label}, found ${matches.length}: ${matches
      .map((component) => component.schemaComponentKey)
      .join(', ')}`,
  );
};

describe('SchemaComponent', () => {
  it('collects child migrations exactly once when component is created upfront', () => {
    const migration = sqlMigration('child:001', [SQL`SELECT 1`]);
    const child = schemaComponent('sc:test:child', {
      migrations: [migration],
    });
    const parent = schemaComponent('sc:test:parent', {
      components: [child],
    });

    assert.deepStrictEqual(parent.migrations, [migration]);
  });

  it('does not duplicate child migrations when addComponent is used', () => {
    const migration = sqlMigration('child:001', [SQL`SELECT 1`]);
    const child = schemaComponent('sc:test:child', {
      migrations: [migration],
    });
    const parent = schemaComponent('sc:test:parent', {});

    parent.addComponent(child);

    assert.deepStrictEqual(parent.migrations, [migration]);
  });

  it('extends a component with additional children without mutating the source', () => {
    const sourceMigration = sqlMigration('source:001', [SQL`SELECT 1`]);
    const extraMigration = sqlMigration('extra:001', [SQL`SELECT 2`]);
    const sourceChild = schemaComponent('sc:test:source-child', {
      migrations: [sourceMigration],
    });
    const extraChild = schemaComponent('sc:test:extra-child', {
      migrations: [extraMigration],
    });
    const source = schemaComponent('sc:test:source', {
      components: [sourceChild],
    });

    const extended = extendSchemaComponent(source, {
      components: [extraChild],
    });

    assert.strictEqual(
      source.components.has(extraChild.schemaComponentKey),
      false,
    );
    assert.strictEqual(
      extended.components.has(extraChild.schemaComponentKey),
      true,
    );
    assert.deepStrictEqual(extended.migrations, [
      sourceMigration,
      extraMigration,
    ]);
  });

  it('keeps extension migration order deterministic', () => {
    const sourceMigration = sqlMigration('source:001', [SQL`SELECT 1`]);
    const localMigration = sqlMigration('local:001', [SQL`SELECT 2`]);
    const firstChildMigration = sqlMigration('first-child:001', [
      SQL`SELECT 3`,
    ]);
    const secondChildMigration = sqlMigration('second-child:001', [
      SQL`SELECT 4`,
    ]);
    const source = schemaComponent('sc:test:source', {
      migrations: [sourceMigration],
    });
    const firstChild = schemaComponent('sc:test:first-child', {
      migrations: [firstChildMigration],
    });
    const secondChild = schemaComponent('sc:test:second-child', {
      migrations: [secondChildMigration],
    });

    const extended = extendSchemaComponent(source, {
      migrations: [localMigration],
      components: [firstChild],
    });
    extended.addComponent(secondChild);

    assert.deepStrictEqual(extended.migrations, [
      sourceMigration,
      localMigration,
      firstChildMigration,
      secondChildMigration,
    ]);
  });
});

describe('FeatureSchemaComponent', () => {
  it('detects Dumbo feature components by key', () => {
    const feature = featureSchemaComponent({
      featureKind: 'test_feature',
      featureName: 'audit',
    });
    const table = tableSchemaComponent({ tableName: 'audit_log' });

    assert.strictEqual(
      feature.schemaComponentKey,
      `${FeatureSchemaComponentURNType}:test_feature:audit`,
    );
    assert.strictEqual(isFeatureSchemaComponent(feature), true);
    assert.strictEqual(isFeatureSchemaComponent(table), false);
  });

  it('keeps feature internals out of direct schema table access', () => {
    const internalTable = tableSchemaComponent({ tableName: 'audit_log' });
    const feature = featureSchemaComponent({
      featureKind: 'audit',
      featureName: 'audit',
      components: [internalTable],
    });
    const schema = databaseSchemaSchemaComponent({
      schemaName: 'public',
      components: [feature],
    });

    assert.strictEqual(schema.tables.size, 0);
    assert.strictEqual(schema.features.get('audit'), feature);
    assert.strictEqual(schema.components.has(feature.schemaComponentKey), true);
  });

  it('finds internals through expanded traversal, including nested features', () => {
    const internalTable = tableSchemaComponent({
      tableName: 'audit_log',
      columns: {
        id: columnSchemaComponent({ columnName: 'id', type: 'varchar' }),
      },
    });
    const nestedFeature = featureSchemaComponent({
      featureKind: 'audit_storage',
      featureName: 'audit',
      components: [internalTable],
    });
    const feature = featureSchemaComponent({
      featureKind: 'audit',
      featureName: 'audit',
      components: [nestedFeature],
    });
    const schema = databaseSchemaSchemaComponent({
      schemaName: 'public',
      components: [feature],
    });

    const tables = findExpandedSchemaComponentsOfType<TableSchemaComponent>(
      schema,
      TableURNType,
    );

    assert.strictEqual(tables.length, 1);
    assert.strictEqual(tables[0]?.tableName, 'audit_log');
  });

  it('supports scoped feature maps on databases and schemas', () => {
    const eventStore = databaseFeatureSchemaComponent({
      featureKind: 'event_store',
      featureName: 'eventStore',
      components: [
        databaseSchemaSchemaComponent({
          schemaName: 'events',
          tables: {
            events: tableSchemaComponent({ tableName: 'events' }),
          },
        }),
      ],
    });
    const audit = databaseSchemaFeatureSchemaComponent({
      featureKind: 'audit',
      featureName: 'audit',
      components: [tableSchemaComponent({ tableName: 'audit_log' })],
    });
    const schema = databaseSchemaSchemaComponent({
      schemaName: 'crm',
      features: { audit },
    });
    const database = databaseSchemaComponent({
      databaseName: 'app',
      schemas: { crm: schema },
      features: { eventStore },
    });

    assert.strictEqual(database.features.eventStore, eventStore);
    assert.strictEqual(database.features.eventStore.featureScope, 'database');
    assert.strictEqual(schema.features.audit, audit);
    assert.strictEqual(schema.features.audit.featureScope, 'database_schema');

    expectTypeOf(database.features.eventStore).toEqualTypeOf(eventStore);
    expectTypeOf(schema.features.audit).toEqualTypeOf(audit);
  });

  it('includes scoped feature migrations in deterministic database order', () => {
    const schemaTableMigration = sqlMigration('schema-table:001', [
      SQL`SELECT 1`,
    ]);
    const schemaFeatureMigration = sqlMigration('schema-feature:001', [
      SQL`SELECT 2`,
    ]);
    const databaseFeatureMigration = sqlMigration('database-feature:001', [
      SQL`SELECT 3`,
    ]);
    const audit = databaseSchemaFeatureSchemaComponent({
      featureKind: 'audit',
      featureName: 'audit',
      migrations: [schemaFeatureMigration],
    });
    const eventStore = databaseFeatureSchemaComponent({
      featureKind: 'event_store',
      featureName: 'eventStore',
      migrations: [databaseFeatureMigration],
    });
    const database = databaseSchemaComponent({
      databaseName: 'app',
      schemas: {
        crm: databaseSchemaSchemaComponent({
          schemaName: 'crm',
          tables: {
            users: tableSchemaComponent({
              tableName: 'users',
              migrations: [schemaTableMigration],
            }),
          },
          features: { audit },
        }),
      },
      features: { eventStore },
    });

    assert.deepStrictEqual(database.migrations, [
      schemaTableMigration,
      schemaFeatureMigration,
      databaseFeatureMigration,
    ]);
  });

  it('binds nested database schemas to their parent database identity', () => {
    const database = databaseSchemaComponent({
      databaseName: 'app',
      schemas: {
        crm: databaseSchemaSchemaComponent({
          schemaName: 'crm',
        }),
      },
    });

    assert.strictEqual(database.schemas.crm.databaseName, 'app');
    assert.strictEqual(
      database.schemas.crm.schemaComponentKey,
      'sc:dumbo:database_schema:regular:app:crm',
    );
    assert.strictEqual(
      database.components.has('sc:dumbo:database_schema:regular:app:crm'),
      true,
    );
  });

  it('binds schemas added lazily to their parent database identity', () => {
    const database = databaseSchemaComponent({
      databaseName: 'app',
    });

    const schema = database.addSchema('crm');

    assert.strictEqual(schema.databaseName, 'app');
    assert.strictEqual(
      schema.schemaComponentKey,
      'sc:dumbo:database_schema:regular:app:crm',
    );
    assert.strictEqual(
      database.components.has('sc:dumbo:database_schema:regular:app:crm'),
      true,
    );
  });

  it('keeps wrapper migrations live after dynamic child additions', () => {
    const tableMigration = sqlMigration('table:001', [SQL`SELECT 1`]);
    const indexMigration = sqlMigration('index:001', [SQL`SELECT 2`]);
    const featureMigration = sqlMigration('feature:001', [SQL`SELECT 3`]);

    const schema = databaseSchemaSchemaComponent({
      schemaName: 'crm',
    });
    const table = tableSchemaComponent({ tableName: 'users' });
    const feature = featureSchemaComponent({
      featureKind: 'audit',
      featureName: 'audit',
    });

    const events = schema.addTable(
      tableSchemaComponent({
        tableName: 'events',
        migrations: [tableMigration],
      }),
    );
    table.addIndex(
      indexSchemaComponent({
        indexName: 'users_email_idx',
        columnNames: ['email'],
        isUnique: false,
        migrations: [indexMigration],
      }),
    );
    feature.addComponent(
      schemaComponent('sc:test:feature-child', {
        migrations: [featureMigration],
      }),
    );

    assert.deepStrictEqual(schema.migrations, [tableMigration]);
    assert.strictEqual(events.databaseSchemaName, 'crm');
    assert.strictEqual(
      events.schemaComponentKey,
      'sc:dumbo:table:regular:crm:events',
    );
    assert.deepStrictEqual(table.migrations, [indexMigration]);
    assert.deepStrictEqual(feature.migrations, [featureMigration]);
  });

  it('scopes standalone indexes to the default unbound table identity', () => {
    const index = indexSchemaComponent({
      indexName: 'users_email_idx',
      columnNames: ['email'],
      isUnique: false,
    });

    assert.strictEqual(index.databaseSchemaName, '__default_database_schema__');
    assert.strictEqual(index.tableName, '__default_table__');
    assert.strictEqual(
      index.schemaComponentKey,
      'sc:dumbo:index:regular:__default_database_schema__:__default_table__:users_email_idx',
    );
  });

  it('binds table-declared indexes to the table scope', () => {
    const users = tableSchemaComponent({
      tableName: 'users',
      indexes: {
        users_email_idx: indexSchemaComponent({
          indexName: 'users_email_idx',
          columnNames: ['email'],
          isUnique: false,
        }),
      },
    });

    const index = users.indexes.get('users_email_idx');

    assert.strictEqual(
      index?.databaseSchemaName,
      '__default_database_schema__',
    );
    assert.strictEqual(index?.tableName, 'users');
    assert.strictEqual(
      index?.schemaComponentKey,
      'sc:dumbo:index:regular:__default_database_schema__:users:users_email_idx',
    );
    assert.strictEqual(users.components.get(index.schemaComponentKey), index);
  });

  it('binds schema-qualified table indexes to the schema and table scope', () => {
    const users = tableSchemaComponent({
      databaseSchemaName: 'crm',
      tableName: 'users',
      indexes: {
        users_email_idx: indexSchemaComponent({
          indexName: 'users_email_idx',
          columnNames: ['email'],
          isUnique: false,
        }),
      },
    });

    assert.strictEqual(
      users.indexes.get('users_email_idx')?.schemaComponentKey,
      'sc:dumbo:index:regular:crm:users:users_email_idx',
    );
  });

  it('rebinds indexes when a default table is added to a database schema', () => {
    const users = tableSchemaComponent({
      tableName: 'users',
      indexes: {
        users_email_idx: indexSchemaComponent({
          indexName: 'users_email_idx',
          columnNames: ['email'],
          isUnique: false,
        }),
      },
    });
    const schema = databaseSchemaSchemaComponent({
      schemaName: 'crm',
      tables: { users },
    });

    assert.strictEqual(
      schema.tables.users.indexes.get('users_email_idx')?.schemaComponentKey,
      'sc:dumbo:index:regular:crm:users:users_email_idx',
    );
  });

  it('binds dynamically added indexes and keeps migrations live', () => {
    const migration = sqlMigration('index:001', [SQL`SELECT 1`]);
    const users = tableSchemaComponent({ tableName: 'users' });

    const index = users.addIndex(
      indexSchemaComponent({
        indexName: 'users_email_idx',
        columnNames: ['email'],
        isUnique: false,
        migrations: [migration],
      }),
    );

    assert.strictEqual(
      index.schemaComponentKey,
      'sc:dumbo:index:regular:__default_database_schema__:users:users_email_idx',
    );
    assert.deepStrictEqual(users.migrations, [migration]);
  });

  it('rejects indexes already bound to a different table or schema', () => {
    const users = tableSchemaComponent({ tableName: 'users' });
    const index = indexSchemaComponent({
      databaseSchemaName: 'crm',
      tableName: 'accounts',
      indexName: 'accounts_email_idx',
      columnNames: ['email'],
      isUnique: false,
    });

    assert.throws(
      () => users.addIndex(index),
      /Index accounts_email_idx belongs to database schema crm and cannot be added to __default_database_schema__\.users/,
    );
  });
});

describe('Schema component discovery', () => {
  it('finds components and features through expanded traversal', () => {
    const table = tableSchemaComponent({ tableName: 'audit_log' });
    const feature = featureSchemaComponent({
      featureKind: 'audit',
      featureName: 'audit',
      components: [table],
    });
    const root = databaseSchemaComponent({
      databaseName: 'app',
      components: [feature],
    });

    assert.strictEqual(
      findComponent(root, table.schemaComponentKey)?.schemaComponentKey,
      table.schemaComponentKey,
    );
    assert.strictEqual(findFeatures(root).length, 1);
    assert.strictEqual(findFeature(root, 'audit', 'audit'), feature);
    assert.strictEqual(
      requireSingleComponent(root, TableURNType, 'table').schemaComponentKey,
      table.schemaComponentKey,
    );
  });

  it('reports duplicate discovery matches with component keys', () => {
    const root = databaseSchemaComponent({
      databaseName: 'app',
      components: [
        tableSchemaComponent({ tableName: 'users' }),
        tableSchemaComponent({ tableName: 'audit' }),
      ],
    });

    assert.throws(
      () => requireSingleComponent(root, TableURNType, 'table'),
      /Expected one table, found 2: sc:dumbo:table:regular:__default_database_schema__:users, sc:dumbo:table:regular:__default_database_schema__:audit/,
    );
  });
});

describe('logical schema mapping', () => {
  it('allows unique physical table names across logical schemas in strict mode', () => {
    const database = databaseSchemaComponent({
      databaseName: 'app',
      schemas: {
        public: databaseSchemaSchemaComponent({
          schemaName: 'public',
          tables: {
            users: tableSchemaComponent({ tableName: 'users' }),
          },
        }),
        audit: databaseSchemaSchemaComponent({
          schemaName: 'audit',
          tables: {
            audit_events: tableSchemaComponent({ tableName: 'audit_events' }),
          },
        }),
      },
    });

    assert.doesNotThrow(() => assertLogicalSchemaMapping(database));
  });

  it('rejects physical table collisions across logical schemas in strict mode', () => {
    const database = databaseSchemaComponent({
      databaseName: 'app',
      schemas: {
        public: databaseSchemaSchemaComponent({
          schemaName: 'public',
          tables: {
            users: tableSchemaComponent({ tableName: 'users' }),
          },
        }),
        audit: databaseSchemaSchemaComponent({
          schemaName: 'audit',
          tables: {
            users: tableSchemaComponent({ tableName: 'users' }),
          },
        }),
      },
    });

    assert.throws(
      () => assertLogicalSchemaMapping(database),
      /Logical schema collision detected: users/,
    );
  });

  it('does not treat tables in the same logical schema as cross-schema collisions', () => {
    const schema = databaseSchemaSchemaComponent({
      schemaName: 'public',
      components: [
        tableSchemaComponent({ tableName: 'users' }),
        schemaComponent('sc:test:unrelated', {}),
      ],
    });
    const database = databaseSchemaComponent({
      databaseName: 'app',
      components: [schema],
    });

    assert.strictEqual(
      database.components.has(
        `${DatabaseSchemaURNType}:regular:__default_database__:public`,
      ),
      true,
    );
    assert.doesNotThrow(() => assertLogicalSchemaMapping(database));
  });

  it('checks schemas exposed by feature expansion', () => {
    const feature = featureSchemaComponent({
      featureKind: 'tenant_storage',
      featureName: 'audit',
      components: [
        databaseSchemaSchemaComponent({
          schemaName: 'audit',
          tables: {
            users: tableSchemaComponent({ tableName: 'users' }),
          },
        }),
      ],
    });
    const database = databaseSchemaComponent({
      databaseName: 'app',
      schemas: {
        public: databaseSchemaSchemaComponent({
          schemaName: 'public',
          tables: {
            users: tableSchemaComponent({ tableName: 'users' }),
          },
        }),
      },
      components: [feature],
    });

    assert.strictEqual(database.features.get('audit'), feature);
    assert.throws(
      () => assertLogicalSchemaMapping(database),
      /Logical schema collision detected: users/,
    );
  });

  it('runs migrator schema validation before migrations', async () => {
    const component = schemaComponent('sc:test:root', {
      migrations: [sqlMigration('root:001', [SQL`SELECT 1`])],
    });
    const migrator = SchemaComponentMigrator(component, {
      driverType: 'Test:test',
    } as never);

    await assert.rejects(
      () =>
        migrator.run({
          schema: {
            validateComponent: () => {
              throw new Error('schema validation failed');
            },
          },
        }),
      /schema validation failed/,
    );
  });
});
