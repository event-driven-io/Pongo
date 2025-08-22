import {
  formatSQL,
  formatSQLRaw,
  mapSQLParam,
  registerFormatter,
  type SQLFormatter,
} from '../../../../../core/sql';
import format from './sqliteFormat';

const sqliteFormatter: SQLFormatter = {
  formatIdentifier: format.ident,
  formatLiteral: format.literal,
  params: {
    mapString: format.string,
    mapBoolean: (value: boolean): unknown => (value ? 1 : 0),
    mapDate: (value: Date): unknown => value.toISOString(),
    mapValue: (value: unknown): unknown => mapSQLParam(value, sqliteFormatter),
  },
  format: (sql) => formatSQL(sql, sqliteFormatter),
  formatRaw: (sql) => formatSQLRaw(sql, sqliteFormatter),
  placeholderGenerator: () => '?',
};

registerFormatter('SQLite', sqliteFormatter);

export { format, sqliteFormatter };
