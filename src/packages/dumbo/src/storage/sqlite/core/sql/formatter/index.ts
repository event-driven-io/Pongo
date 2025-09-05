import { registerFormatter, SQLFormatter } from '../../../../../core/sql';

const mapIdentifier = (value: string): string => {
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
  params: {
    mapDate: (value: Date): unknown => value.toISOString(),
    mapIdentifier,
  },
});

registerFormatter('SQLite', sqliteFormatter);

export { sqliteFormatter };
