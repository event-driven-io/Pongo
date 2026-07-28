import { SQL, type SQL as SQLStatement, type SQLIdentifier } from '../../sql';
import type { AnyTableComponent } from './tableComponent';

export const createTableSQL = (
  table: AnyTableComponent,
  tableReference: SQLStatement | SQLIdentifier,
): SQLStatement => {
  const columns = SQL.merge(
    Object.values(table.columns).map((column) => SQL`${column}`),
    ', ',
  );

  return SQL`CREATE TABLE IF NOT EXISTS ${tableReference} (${columns})`;
};
