import { JSONSerializer } from '../serializer';
import type { SQL } from '../sql';

export type MigrationStyle = 'None' | 'CreateOrUpdate';

export type SQLMigrationOptions = {
  baseline?: boolean | undefined;
  ignoreHashMismatch?: boolean | undefined;
};

export type SQLMigration = {
  name: string;
  sqls: SQL[];
} & SQLMigrationOptions;

export const sqlMigration = (
  name: string,
  sqls: SQL[],
  options?: SQLMigrationOptions,
): SQLMigration => ({
  name,
  sqls,
  ...options,
});

export const haveSameSQL = (a: SQLMigration, b: SQLMigration): boolean =>
  JSONSerializer.serialize(a.sqls) === JSONSerializer.serialize(b.sqls);
