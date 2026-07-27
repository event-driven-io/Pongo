import assert from 'node:assert';
import { describe, it } from 'vitest';
import { SQL } from '../sql';
import {
  DatabaseSchemaURNType,
  FeatureSchemaComponentURNType,
  TableURNType,
  assertLogicalSchemaMapping,
  columnSchemaComponent,
  databaseSchemaComponent,
  databaseSchemaSchemaComponent,
  featureSchemaComponent,
  findExpandedSchemaComponentsOfType,
  isFeatureSchemaComponent,
  schemaComponent,
  sqlMigration,
  tableSchemaComponent,
  type TableSchemaComponent,
} from './index';

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
      database.components.has(`${DatabaseSchemaURNType}:public`),
      true,
    );
    assert.doesNotThrow(() => assertLogicalSchemaMapping(database));
  });
});
