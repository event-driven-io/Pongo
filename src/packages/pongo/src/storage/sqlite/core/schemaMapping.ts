import { SQL } from '@event-driven-io/dumbo';
import type { ComponentContext } from '@event-driven-io/dumbo';

export const PONGO_SQLITE_MAPPED_NAME_PREFIX = 'pongo_';

const escapeName = (name: string): string => name.replaceAll('_', '__');

const mappedTableName = (
  databaseSchemaName: string,
  tableName: string,
): string =>
  `${PONGO_SQLITE_MAPPED_NAME_PREFIX}${escapeName(databaseSchemaName)}_table_${escapeName(tableName)}`;

const mappedIndexName = (
  databaseSchemaName: string,
  tableName: string,
  indexName: string,
): string =>
  `${mappedTableName(databaseSchemaName, tableName)}_index_${escapeName(indexName)}`;

const assertNativeName = (kind: 'collection' | 'index', name: string): void => {
  if (name.startsWith(PONGO_SQLITE_MAPPED_NAME_PREFIX)) {
    throw new Error(
      `SQLite ${kind} names starting with ${PONGO_SQLITE_MAPPED_NAME_PREFIX} are reserved for logical schema mapping`,
    );
  }
};

const tableNames = (
  context: ComponentContext,
): Readonly<{ databaseSchemaName: string; tableName: string }> => {
  if (
    context.databaseSchemaName === undefined ||
    context.tableName === undefined
  ) {
    throw new Error(
      'SQLite collection resolution requires a materialized table context',
    );
  }

  return {
    databaseSchemaName: context.databaseSchemaName,
    tableName: context.tableName,
  };
};

export const resolveSQLiteCollectionReference = (context: ComponentContext) => {
  const { databaseSchemaName, tableName } = tableNames(context);
  const native = databaseSchemaName === 'main';

  if (native) assertNativeName('collection', tableName);

  const physicalName = native
    ? tableName
    : mappedTableName(databaseSchemaName, tableName);

  return {
    migrationName: native ? tableName : `${databaseSchemaName}:${tableName}`,
    physicalName,
    tableReference: SQL`${SQL.identifier(physicalName)}`,
    mapped: !native,
  };
};

export const resolveSQLiteIndexReference = (
  context: ComponentContext,
  indexName: string,
): { physicalName: string; indexReference: SQL } => {
  const { databaseSchemaName, tableName } = tableNames(context);
  const native = databaseSchemaName === 'main';
  if (native) assertNativeName('index', indexName);

  const physicalName = native
    ? indexName
    : mappedIndexName(databaseSchemaName, tableName, indexName);

  return {
    physicalName,
    indexReference: SQL`${SQL.identifier(physicalName)}`,
  };
};
