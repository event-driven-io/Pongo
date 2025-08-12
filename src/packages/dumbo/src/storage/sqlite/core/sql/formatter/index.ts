import {
  formatSQL,
  formatSQLRaw,
  mapSQLValue,
  registerFormatter,
  type SQLFormatter,
} from '../../../../../core/sql';
import format from './sqliteFormat';

const sqliteFormatter: SQLFormatter = {
  formatIdentifier: format.ident,
  formatLiteral: format.literal,
  formatString: format.string,
  formatArray: (array, itemFormatter) => {
    if (array.length === 0) return '()';
    return '(' + array.map(itemFormatter).join(', ') + ')';
  },
  mapBoolean: (value: boolean): unknown => (value ? 1 : 0),
  formatBoolean: (value: boolean): string => (value ? '1' : '0'),
  mapDate: (value: Date): unknown => value.toISOString(),
  formatDate: (value: Date): string =>
    format.literal(sqliteFormatter.mapDate!(value)),
  mapSQLValue: (value: unknown): unknown => mapSQLValue(value, sqliteFormatter),
  format: (sql) => formatSQL(sql, () => '?', sqliteFormatter),
  formatRaw: (sql) => formatSQLRaw(sql, sqliteFormatter),
};

registerFormatter('SQLite', sqliteFormatter);

export { format, sqliteFormatter };
