import {
  columnSchemaComponent,
  type ColumnSchemaComponent,
  indexSchemaComponent,
  type IndexSchemaComponent,
  tableSchemaComponent,
  type TableSchemaComponent,
  databaseSchemaSchemaComponent,
  type DatabaseSchemaSchemaComponent,
  databaseSchemaComponent,
  type DatabaseSchemaComponent,
} from '../components';
import type { SchemaComponentOptions } from '../schemaComponent';
import { DEFAULT_SCHEMA, DATABASE_DEFAULTS } from './constants';

const dumboColumn = (
  name: string,
  options?: SchemaComponentOptions,
): ColumnSchemaComponent =>
  columnSchemaComponent({
    columnName: name,
    ...options,
  });

const dumboIndex = (
  name: string,
  columnNames: string[],
  options?: { unique?: boolean } & SchemaComponentOptions,
): IndexSchemaComponent =>
  indexSchemaComponent({
    indexName: name,
    columnNames,
    isUnique: options?.unique ?? false,
    ...options,
  });

const dumboTable = (
  name: string,
  definition: {
    columns?: Record<string, ColumnSchemaComponent>;
    indexes?: Record<string, IndexSchemaComponent>;
  } & SchemaComponentOptions,
): TableSchemaComponent => {
  const { columns, indexes, ...options } = definition;

  const components = [
    ...(columns ? Object.values(columns) : []),
    ...(indexes ? Object.values(indexes) : []),
  ];

  return tableSchemaComponent({
    tableName: name,
    components,
    ...options,
  });
};

const dumboDatabaseSchema = (
  nameOrTables: string | Record<string, TableSchemaComponent>,
  tables?: Record<string, TableSchemaComponent>,
  options?: SchemaComponentOptions,
): DatabaseSchemaSchemaComponent => {
  if (typeof nameOrTables === 'string') {
    const tableComponents = Object.values(tables || {});
    return databaseSchemaSchemaComponent({
      schemaName: nameOrTables,
      components: tableComponents,
      ...options,
    });
  } else {
    const tableComponents = Object.values(nameOrTables || {});
    return databaseSchemaSchemaComponent({
      schemaName: '',
      components: tableComponents,
    });
  }
};

dumboDatabaseSchema.from = (
  schemaName: string | undefined,
  tableNames: string[],
): DatabaseSchemaSchemaComponent => {
  const tables = tableNames.reduce(
    (acc, tableName) => {
      acc[tableName] = dumboTable(tableName, {});
      return acc;
    },
    {} as Record<string, TableSchemaComponent>,
  );

  return schemaName
    ? dumboDatabaseSchema(schemaName, tables)
    : dumboDatabaseSchema(tables);
};

const dumboDatabase = (
  nameOrSchemas:
    | string
    | Record<string | symbol, DatabaseSchemaSchemaComponent>,
  schemas?: Record<string | symbol, DatabaseSchemaSchemaComponent>,
  options?: { defaultSchemaName?: string } & SchemaComponentOptions,
): DatabaseSchemaComponent => {
  let databaseName: string;
  let schemaMap: Record<string | symbol, DatabaseSchemaSchemaComponent>;
  let dbOptions: typeof options;

  if (typeof nameOrSchemas === 'string') {
    databaseName = nameOrSchemas;
    schemaMap = schemas || {};
    dbOptions = options;
  } else {
    databaseName = 'database';
    schemaMap = nameOrSchemas;
    dbOptions = schemas as typeof options;
  }

  const schemaComponents: DatabaseSchemaSchemaComponent[] = [];

  for (const [key, schemaComponent] of Object.entries(schemaMap)) {
    schemaComponents.push(schemaComponent);
  }

  const symbolKeys = Object.getOwnPropertySymbols(schemaMap);
  for (const key of symbolKeys) {
    const schemaComponent = schemaMap[key];
    if (schemaComponent && key === DEFAULT_SCHEMA) {
      const defaultSchemaName = dbOptions?.defaultSchemaName || 'public';
      schemaComponents.push(
        databaseSchemaSchemaComponent({
          schemaName: defaultSchemaName,
          components: Array.from(schemaComponent.components.values()),
          migrations: schemaComponent.migrations,
        }),
      );
    } else if (schemaComponent) {
      schemaComponents.push(schemaComponent);
    }
  }

  return databaseSchemaComponent({
    databaseName,
    components: schemaComponents,
    ...dbOptions,
  });
};

dumboDatabase.from = (
  databaseName: string | undefined,
  schemaNames: string[],
): DatabaseSchemaComponent => {
  const schemas = schemaNames.reduce(
    (acc, schemaName) => {
      acc[schemaName] = dumboDatabaseSchema(schemaName, {});
      return acc;
    },
    {} as Record<string, DatabaseSchemaSchemaComponent>,
  );

  return databaseName
    ? dumboDatabase(databaseName, schemas)
    : dumboDatabase(schemas);
};

export const dumboSchema = {
  database: dumboDatabase,
  schema: dumboDatabaseSchema,
  table: dumboTable,
  column: dumboColumn,
  index: dumboIndex,
  DEFAULT_SCHEMA,
  DATABASE_DEFAULTS,
};
