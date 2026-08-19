export type DefaultDatabaseSchemaName = 'dmb:database:schema:default:name';
export const DefaultDatabaseSchemaName = 'dmb:database:schema:default:name';

export const isDefaultDatabaseSchema = (
  databaseSchemaName: string | undefined,
): databaseSchemaName is DefaultDatabaseSchemaName | undefined =>
  databaseSchemaName === undefined ||
  databaseSchemaName === DefaultDatabaseSchemaName;
