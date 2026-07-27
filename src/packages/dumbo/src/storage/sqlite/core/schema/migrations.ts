import {
  DatabaseURNType,
  assertLogicalSchemaComponentMapping,
  findExpandedSchemaComponentsOfType,
  registerDefaultMigratorOptions,
  type AnyDatabaseSchemaComponent,
  type MigratorOptions,
  type SchemaComponent,
} from '../../../../core';

const validateLogicalSchemaMapping = (component: SchemaComponent): void => {
  for (const database of findExpandedSchemaComponentsOfType<AnyDatabaseSchemaComponent>(
    component,
    DatabaseURNType,
  )) {
    assertLogicalSchemaComponentMapping(database);
  }
};

export const DefaultSQLiteMigratorOptions: MigratorOptions = {
  schema: {
    validateComponent: validateLogicalSchemaMapping,
  },
};

registerDefaultMigratorOptions('SQLite', DefaultSQLiteMigratorOptions);
