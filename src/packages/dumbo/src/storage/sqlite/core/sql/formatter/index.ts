import {
  mapSQLParamValue,
  registerFormatter,
  SQLFormatter,
} from '../../../../../core/sql';
import format from './sqliteFormat';

const sqliteFormatter: SQLFormatter = SQLFormatter({
  formatIdentifier: format.ident,
  formatLiteral: format.literal,
  params: {
    mapString: format.string,
    mapBoolean: (value: boolean): unknown => (value ? 1 : 0),
    mapDate: (value: Date): unknown => value.toISOString(),
    mapValue: (value: unknown): unknown =>
      mapSQLParamValue(value, sqliteFormatter),
    mapPlaceholder: (): string => '?',
  },
});

registerFormatter('SQLite', sqliteFormatter);

export { format, sqliteFormatter };
