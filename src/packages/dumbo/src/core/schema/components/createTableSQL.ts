import { SQL, type SQL as SQLStatement, type SQLIdentifier } from '../../sql';
import type { AnyColumnSchemaComponent } from './columnSchemaComponent';

export const createTableSQL = (
  table: Readonly<{
    columns: Readonly<Record<string, AnyColumnSchemaComponent>>;
  }>,
  tableReference: SQLStatement | SQLIdentifier,
): SQLStatement => {
  const columns = SQL.merge(
    Object.values(table.columns).map((column) => SQL`${column}`),
    ', ',
  );

  return SQL`CREATE TABLE IF NOT EXISTS ${tableReference} (${columns})`;
};
