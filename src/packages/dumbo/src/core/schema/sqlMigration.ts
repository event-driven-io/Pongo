import type { SQL } from '../sql';

export type MigrationStyle = 'None' | 'CreateOrUpdate';

export type SQLMigration = {
  name: string;
  sqls: SQL[];
};

export const sqlMigration = (name: string, sqls: SQL[]): SQLMigration => ({
  name,
  sqls,
});

export type MigrationRecord = {
  id: number;
  name: string;
  application: string;
  sqlHash: string;
  timestamp: Date;
};
