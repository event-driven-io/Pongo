import { isDatabaseComponent } from './components/databaseComponent';
import { isDatabaseSchemaComponent } from './components/databaseSchemaComponent';
import { isIndexComponent } from './components/indexComponent';
import { isTableComponent } from './components/tableComponent';
import { isExtensionComponent } from './extensionComponent';
import {
  copySchemaComponentSpecialization,
  createComponentRecord,
  defineSchemaComponentRecord,
  initializeSchemaComponent,
  localMigrationsOf,
  mergeComponentRecords,
  replaceSchemaComponentRecord,
  schemaComponentType,
  type AnySchemaComponent,
  type SchemaComponentRecord,
} from './schemaComponent';
import type { SQLMigration } from './sqlMigration';
import type { AnyDatabaseComponent } from './components/databaseComponent';
import type { AnyDatabaseSchemaComponent } from './components/databaseSchemaComponent';
import type { AnyTableComponent } from './components/tableComponent';

export type ComponentContext = Readonly<{
  databaseName: string;
  databaseSchemaName?: string | undefined;
  tableName?: string | undefined;
}>;

export type SchemaMaterializationOptions = Readonly<{
  context: ComponentContext;
  migrationsFor?:
    | ((
        component: AnySchemaComponent,
        context: ComponentContext,
      ) => ReadonlyArray<SQLMigration>)
    | undefined;
}>;

const materializedCoreProperties = new Set<PropertyKey>([
  schemaComponentType,
  'components',
  'migrations',
]);

const define = (target: object, values: Readonly<Record<string, unknown>>) => {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(target, key, { value, enumerable: true });
  }
};

const childRecord = (
  source: SchemaComponentRecord,
  children: SchemaComponentRecord,
): SchemaComponentRecord => {
  const result = Object.create(null) as Record<string, AnySchemaComponent>;
  for (const alias of Object.keys(source)) result[alias] = children[alias]!;
  return createComponentRecord(result);
};

type DomainRecordName =
  'schemas' | 'extensions' | 'tables' | 'columns' | 'indexes';

const defineDomainRecord = (
  target: AnySchemaComponent,
  name: DomainRecordName,
  record: SchemaComponentRecord,
): void => defineSchemaComponentRecord(target, name, record);

const contextForComponent = (
  component: AnySchemaComponent,
  context: ComponentContext,
): ComponentContext => {
  if (isDatabaseComponent(component)) {
    if (
      component.databaseName !== undefined &&
      component.databaseName !== context.databaseName
    ) {
      throw new Error(
        `Database "${component.databaseName}" cannot be materialized as "${context.databaseName}"`,
      );
    }
    return { databaseName: context.databaseName };
  }

  if (isDatabaseSchemaComponent(component)) {
    const databaseSchemaName =
      component.schemaName ?? context.databaseSchemaName;
    if (databaseSchemaName === undefined) {
      throw new Error('A database schema name is required for materialization');
    }
    if (
      context.databaseSchemaName !== undefined &&
      component.schemaName !== undefined &&
      component.schemaName !== context.databaseSchemaName
    ) {
      throw new Error(
        `Database schema "${component.schemaName}" cannot be materialized as "${context.databaseSchemaName}"`,
      );
    }
    return { databaseName: context.databaseName, databaseSchemaName };
  }

  if (isTableComponent(component)) {
    const databaseSchemaName =
      component.databaseSchemaName ?? context.databaseSchemaName;
    if (
      component.databaseSchemaName !== undefined &&
      context.databaseSchemaName !== undefined &&
      component.databaseSchemaName !== context.databaseSchemaName
    ) {
      throw new Error(
        `Table "${component.tableName}" cannot be materialized in database schema "${context.databaseSchemaName}"`,
      );
    }
    return {
      databaseName: context.databaseName,
      databaseSchemaName,
      tableName: component.tableName,
    };
  }

  if (isIndexComponent(component)) {
    const databaseSchemaName =
      component.databaseSchemaName ?? context.databaseSchemaName;
    const tableName = component.tableName ?? context.tableName;
    if (tableName === undefined) {
      throw new Error(
        `A table name is required to materialize index "${component.indexName}"`,
      );
    }
    return {
      databaseName: context.databaseName,
      databaseSchemaName,
      tableName,
    };
  }

  return context;
};

const contextForChild = (
  parent: AnySchemaComponent,
  alias: string,
  context: ComponentContext,
): ComponentContext => {
  if (isDatabaseComponent(parent) && Object.hasOwn(parent.schemas, alias)) {
    return {
      databaseName: context.databaseName,
      databaseSchemaName: alias,
    };
  }
  return context;
};

const defineDomainProperties = (
  source: AnySchemaComponent,
  target: AnySchemaComponent,
  children: SchemaComponentRecord,
  context: ComponentContext,
): void => {
  if (isDatabaseComponent(source)) {
    define(target, { databaseName: context.databaseName });
    defineDomainRecord(
      target,
      'schemas',
      childRecord(source.schemas, children),
    );
    defineDomainRecord(
      target,
      'extensions',
      childRecord(source.extensions, children),
    );
    return;
  }

  if (isDatabaseSchemaComponent(source)) {
    define(target, {
      schemaName: context.databaseSchemaName,
      databaseName: context.databaseName,
    });
    defineDomainRecord(target, 'tables', childRecord(source.tables, children));
    defineDomainRecord(
      target,
      'extensions',
      childRecord(source.extensions, children),
    );
    return;
  }

  if (isTableComponent(source)) {
    define(target, {
      tableName: source.tableName,
      databaseSchemaName: context.databaseSchemaName,
      primaryKey: source.primaryKey,
      relationships: source.relationships,
    });
    defineDomainRecord(
      target,
      'columns',
      childRecord(source.columns, children),
    );
    defineDomainRecord(
      target,
      'indexes',
      childRecord(source.indexes, children),
    );
    return;
  }

  if (isIndexComponent(source)) {
    define(target, {
      indexName: source.indexName,
      indexTargetNames: source.indexTargetNames,
      columnNames: source.columnNames,
      isUnique: source.isUnique,
      databaseSchemaName: context.databaseSchemaName,
      tableName: context.tableName,
      sql: source.sql,
    });
    return;
  }

  if (isExtensionComponent(source)) {
    define(target, { extensionName: source.extensionName });
  }
};

export const materializeSchemaComponent = <Root extends AnySchemaComponent>(
  root: Root,
  options: SchemaMaterializationOptions,
): Root => {
  const materialized = new WeakMap<AnySchemaComponent, AnySchemaComponent>();

  const visit = (
    source: AnySchemaComponent,
    inheritedContext: ComponentContext,
  ): AnySchemaComponent => {
    const existing = materialized.get(source);
    if (existing !== undefined) return existing;

    const target = Object.create(null) as AnySchemaComponent;
    materialized.set(source, target);
    const context = contextForComponent(source, inheritedContext);
    const children: Record<string, AnySchemaComponent> = Object.create(
      null,
    ) as Record<string, AnySchemaComponent>;

    for (const [alias, child] of Object.entries(source.components)) {
      children[alias] = visit(child, contextForChild(source, alias, context));
    }

    initializeSchemaComponent(target, source[schemaComponentType], {
      components: children,
      migrations: [
        ...localMigrationsOf(source),
        ...(options.migrationsFor?.(source, context) ?? []),
      ],
    });
    defineDomainProperties(source, target, children, context);
    copySchemaComponentSpecialization(
      source,
      target,
      materializedCoreProperties,
    );
    return target;
  };

  return visit(root, options.context) as Root;
};

export const editMaterializedDatabase = (
  database: AnyDatabaseComponent,
  options: SchemaMaterializationOptions,
) => {
  const addSchema = (
    alias: string,
    declaration: AnyDatabaseSchemaComponent,
  ): AnyDatabaseSchemaComponent => {
    if (
      Object.hasOwn(database.components, alias) &&
      !Object.hasOwn(database.schemas, alias)
    ) {
      throw new Error(
        `Schema alias "${alias}" conflicts with a database extension`,
      );
    }
    const schema = materializeSchemaComponent(declaration, {
      ...options,
      context: {
        databaseName: options.context.databaseName,
        databaseSchemaName: alias,
      },
    });
    const schemas = createComponentRecord({
      ...database.schemas,
      [alias]: schema,
    });
    replaceSchemaComponentRecord(database, 'schemas', schemas);
    replaceSchemaComponentRecord(
      database,
      'components',
      mergeComponentRecords(schemas, database.extensions),
    );
    return schema;
  };

  const setTable = (
    schemaName: string,
    alias: string,
    declaration: AnyTableComponent,
  ): AnyTableComponent => {
    const schema = database.schemas[schemaName];
    if (schema === undefined) {
      throw new Error(`Database schema "${schemaName}" does not exist`);
    }
    if (
      Object.hasOwn(schema.components, alias) &&
      !Object.hasOwn(schema.tables, alias)
    ) {
      throw new Error(
        `Table alias "${alias}" conflicts with a schema extension`,
      );
    }
    const table = materializeSchemaComponent(declaration, {
      ...options,
      context: {
        databaseName: options.context.databaseName,
        databaseSchemaName: schemaName,
      },
    });
    const tables = createComponentRecord({
      ...schema.tables,
      [alias]: table,
    });
    replaceSchemaComponentRecord(schema, 'tables', tables);
    replaceSchemaComponentRecord(
      schema,
      'components',
      mergeComponentRecords(tables, schema.extensions),
    );
    return table;
  };

  const removeTable = (schemaName: string, alias: string): boolean => {
    const schema = database.schemas[schemaName];
    if (schema === undefined || !Object.hasOwn(schema.tables, alias)) {
      return false;
    }
    const tables = createComponentRecord(
      Object.fromEntries(
        Object.entries(schema.tables).filter(([key]) => key !== alias),
      ),
    );
    replaceSchemaComponentRecord(schema, 'tables', tables);
    replaceSchemaComponentRecord(
      schema,
      'components',
      mergeComponentRecords(tables, schema.extensions),
    );
    return true;
  };

  return { addSchema, setTable, removeTable };
};
