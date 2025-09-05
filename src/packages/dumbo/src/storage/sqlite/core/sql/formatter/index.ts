import {
  mapSQLParamValue,
  registerFormatter,
  SQLFormatter,
} from '../../../../../core/sql';

const formatIdentifier = (value: string): string => {
  if (value === undefined || value === null) {
    throw new Error('SQL identifier cannot be null or undefined');
  }

  const ident = value.toString();

  // Only leave unquoted if it's lowercase snake_case
  if (/^[a-z_][a-z0-9_]*$/.test(ident)) {
    return ident;
  }

  return `"${ident.replace(/"/g, '""')}"`;
};

const sqliteFormatter: SQLFormatter = SQLFormatter({
  formatIdentifier,
  params: {
    mapBoolean: (value: boolean): unknown => (value ? 1 : 0),
    mapDate: (value: Date): unknown => value.toISOString(),
    mapValue: (value: unknown): unknown =>
      mapSQLParamValue(value, sqliteFormatter),
    mapPlaceholder: (): string => '?',
  },
});

registerFormatter('SQLite', sqliteFormatter);

export { sqliteFormatter };
