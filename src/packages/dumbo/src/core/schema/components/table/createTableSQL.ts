import { SQL, type SQLTableReference } from '../../../sql';
import type { AnyColumnSchemaComponent } from '../columns/columnSchemaComponent';

export const createTableSQL = (
  table: Readonly<{
    fullName: SQLTableReference;
    columns: Readonly<Record<string, AnyColumnSchemaComponent>>;
  }>,
): SQL => {
  const columns = SQL.merge(
    Object.values(table.columns).map((column) => SQL`${column}`),
    ', ',
  );

  return SQL`CREATE TABLE IF NOT EXISTS ${table.fullName} (${columns})`;
};
