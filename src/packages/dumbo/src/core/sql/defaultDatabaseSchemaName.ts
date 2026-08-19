export type DefaultDatabaseSchemaName = 'dmb_default_schema';
export const DefaultDatabaseSchemaName = 'dmb_default_schema';

export const isDefaultDatabaseSchema = (
  databaseSchemaName: string | undefined,
): databaseSchemaName is DefaultDatabaseSchemaName | undefined =>
  databaseSchemaName === undefined ||
  databaseSchemaName === DefaultDatabaseSchemaName;
