import { describe, expectTypeOf, it } from 'vitest';
import type {
  AnySchemaComponent,
  DatabaseMigrator,
  DatabaseMigratorOptions,
  MigratorRunOptions,
  RunSQLMigrationsResult,
} from '../../..';

describe('public database migrator API', () => {
  it('binds a declarative component and returns migration results', () => {
    expectTypeOf<
      DatabaseMigrator['component']
    >().toEqualTypeOf<AnySchemaComponent>();
    expectTypeOf<ReturnType<DatabaseMigrator['migrate']>>().toEqualTypeOf<
      Promise<RunSQLMigrationsResult>
    >();
    expectTypeOf<
      ReturnType<DatabaseMigrator['ensureMigrated']>
    >().toEqualTypeOf<Promise<void>>();
    expectTypeOf<DatabaseMigratorOptions['autoMigration']>().toEqualTypeOf<
      'None' | 'CreateOrUpdate' | undefined
    >();
    expectTypeOf<
      Extract<keyof MigratorRunOptions, 'migrationTable'>
    >().toEqualTypeOf<never>();
  });
});
