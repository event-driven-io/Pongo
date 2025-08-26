import {
  describeSQL,
  formatSQL,
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
    mapParam: (value: unknown): unknown => mapSQLParam(value, sqliteFormatter),
  },
  format: (sql) => formatSQL(sql, sqliteFormatter),
  describe: (sql) => describeSQL(sql, sqliteFormatter),
  placeholderGenerator: () => '?',
};

registerFormatter('SQLite', sqliteFormatter);

export { format, sqliteFormatter };
