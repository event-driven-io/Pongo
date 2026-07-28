import assert from 'node:assert';
import { describe, it } from 'vitest';
import { SQL } from '../sql';
import {
  databaseComponent,
  databaseSchemaComponent,
  editMaterializedDatabase,
  extensionComponent,
  genericComponentType,
  isTableComponent,
  materializeSchemaComponent,
  schemaComponent,
  schemaComponentType,
  sqlMigration,
  tableComponent,
  type AnyDatabaseComponent,
  type AnySchemaComponent,
} from './index';

describe('materializing reusable schema declarations', () => {
  it('materializes one table into independent schema contexts without changing it', () => {
    const users = tableComponent({ tableName: 'users' });

    const publicUsers = materializeSchemaComponent(users, {
      context: {
        databaseName: 'app',
        databaseSchemaName: 'public',
      },
    });
    const auditUsers = materializeSchemaComponent(users, {
      context: {
        databaseName: 'app',
        databaseSchemaName: 'audit',
      },
    });

    assert.strictEqual(users.databaseSchemaName, undefined);
    assert.strictEqual(publicUsers.databaseSchemaName, 'public');
    assert.strictEqual(auditUsers.databaseSchemaName, 'audit');
    assert.notStrictEqual(publicUsers, auditUsers);
  });

  it('adds context-aware migrations in parent-before-child order', () => {
    const users = tableComponent({ tableName: 'users' });
    const audit = extensionComponent('audit', { users });
    const seen: string[] = [];

    const materialized = materializeSchemaComponent(audit, {
      context: {
        databaseName: 'app',
        databaseSchemaName: 'audit',
      },
      migrationsFor: (component, context) => {
        if (!isTableComponent(component)) return [];
        seen.push(
          `${context.databaseName}.${context.databaseSchemaName}.${component.tableName}`,
        );
        return [sqlMigration('users:001', [SQL`SELECT 1`])];
      },
    });

    assert.deepStrictEqual(seen, ['app.audit.users']);
    assert.deepStrictEqual(
      materialized.migrations.map((migration) => migration.name),
      ['users:001'],
    );
  });

  it('keeps one materialized object for a declaration with multiple aliases', () => {
    const users = tableComponent({ tableName: 'users' });
    const extension = extensionComponent('shared', {
      users,
      usersAgain: users,
    });
    const materialized = materializeSchemaComponent(extension, {
      context: {
        databaseName: 'app',
        databaseSchemaName: 'public',
      },
    });

    assert.strictEqual(
      materialized.components.users,
      materialized.components.usersAgain,
    );
    assert.notStrictEqual(materialized.components.users, users);
  });

  it('finishes materializing a cyclic custom component tree', () => {
    const childRecord = Object.create(null) as Record<
      string,
      AnySchemaComponent
    >;
    const child: AnySchemaComponent = {
      [schemaComponentType]: genericComponentType,
      components: childRecord,
      migrations: [],
    };
    const root = schemaComponent({ components: { child } });
    childRecord.root = root;

    const materialized = materializeSchemaComponent(root, {
      context: { databaseName: 'app' },
    });
    const materializedChild = materialized.components.child;

    assert.strictEqual(materializedChild.components.root, materialized);
  });

  it('preserves symbol-backed specializations on materialized tables', () => {
    const specialization: unique symbol = Symbol('test.specialization');
    const users = tableComponent({ tableName: 'users' }) as ReturnType<
      typeof tableComponent
    > & { [specialization]: true };
    Object.defineProperty(users, specialization, { value: true });

    const materialized = materializeSchemaComponent(users, {
      context: {
        databaseName: 'app',
        databaseSchemaName: 'public',
      },
    });

    assert.strictEqual(materialized[specialization], true);
  });

  it('keeps runtime hierarchy live through immutable record replacements', () => {
    const declaration = databaseComponent({
      databaseName: 'app',
      schemas: {
        public: databaseSchemaComponent({ schemaName: 'public' }),
      },
    });
    const runtime: AnyDatabaseComponent = materializeSchemaComponent(
      declaration,
      {
        context: { databaseName: 'app' },
      },
    );
    const schemas = runtime.schemas;
    const components = runtime.components;
    const editor = editMaterializedDatabase(runtime, {
      context: { databaseName: 'app' },
    });

    const audit = editor.addSchema(
      'audit',
      databaseSchemaComponent({ schemaName: 'audit' }),
    );
    const events = editor.setTable(
      'audit',
      'events',
      tableComponent({ tableName: 'events' }),
    );

    assert.notStrictEqual(runtime.schemas, schemas);
    assert.notStrictEqual(runtime.components, components);
    assert.strictEqual(schemas.audit, undefined);
    assert.strictEqual(components.audit, undefined);
    assert.strictEqual(runtime.schemas.audit, audit);
    assert.strictEqual(runtime.components.audit, audit);
    assert.strictEqual(audit.tables.events, events);
    assert.strictEqual(audit.components.events, events);
    assert.strictEqual(Object.isFrozen(runtime.schemas), true);
    assert.strictEqual(Object.isFrozen(audit.tables), true);

    assert.strictEqual(editor.removeTable('audit', 'events'), true);
    assert.strictEqual(audit.tables.events, undefined);
    assert.strictEqual(audit.components.events, undefined);
  });
});
