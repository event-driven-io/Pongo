import {
  assertLogicalSchemaComponentMapping,
  findComponents,
  isDatabaseComponent,
  registerDefaultMigratorOptions,
  type AnyDatabaseComponent,
  type MigratorOptions,
  type SchemaComponent,
} from '../../../../core';

const validateLogicalSchemaMapping = (component: SchemaComponent): void => {
  for (const database of findComponents(
    component,
    (candidate): candidate is AnyDatabaseComponent =>
      isDatabaseComponent(candidate),
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
