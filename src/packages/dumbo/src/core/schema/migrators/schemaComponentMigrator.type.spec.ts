import { describe, expectTypeOf, it } from 'vitest';
import type { SchemaComponentMigrator } from './schemaComponentMigrator';

describe('typing schema component migrator calls', () => {
  it('migrate accepts only options of a single migration run', () => {
    type MigrateOptions = NonNullable<
      Parameters<SchemaComponentMigrator['migrate']>[0]
    >;

    expectTypeOf<keyof MigrateOptions>().toEqualTypeOf<
      | 'execute'
      | 'dryRun'
      | 'ignoreMigrationHashMismatch'
      | 'migrationTimeoutMS'
    >();
  });

  it('ensureMigrated accepts only options of a single check', () => {
    type EnsureMigratedOptions = NonNullable<
      Parameters<SchemaComponentMigrator['ensureMigrated']>[0]
    >;

    expectTypeOf<keyof EnsureMigratedOptions>().toEqualTypeOf<
      'dryRun' | 'ignoreMigrationHashMismatch' | 'migrationTimeoutMS'
    >();
  });
});
