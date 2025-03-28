import { JSONSerializer } from '../../serializer';

const arrayToList = (
  useSpace: boolean,
  array: unknown[],
  formatter: (val: unknown) => string,
): string => {
  let sql = '';
  sql += useSpace ? ' (' : '(';
  for (let i = 0; i < array.length; i++) {
    sql += (i === 0 ? '' : ', ') + formatter(array[i]);
  }
  sql += ')';
  return sql;
};

const quoteIdent = (value: unknown): string => {
  if (value === undefined || value === null) {
    throw new Error('SQL identifier cannot be null or undefined');
  }

  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  const ident = value.toString();

  // Only leave unquoted if it's lowercase snake_case
  if (/^[a-z_][a-z0-9_]*$/.test(ident)) {
    return ident;
  }

  return `"${ident.replace(/"/g, '""')}"`;
};

const quoteLiteral = (value: unknown): string => {
  if (value === undefined || value === null) return 'NULL';

  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') return value.toString();
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === 'bigint') {
    const minSQLiteInt = -9223372036854775808n;
    const maxSQLiteInt = 9223372036854775807n;

    // If it's in SQLite's INTEGER range, treat it as a number
    if (value >= minSQLiteInt && value <= maxSQLiteInt) {
      return value.toString();
    }

    // Out of range — fallback to quoted TEXT
    return `'${value.toString()}'`;
  }

  if (Array.isArray(value)) {
    return value
      .map((v, i) => {
        if (Array.isArray(v)) {
          return arrayToList(i !== 0, v, quoteLiteral);
        }
        return quoteLiteral(v);
      })
      .toString();
  }

  if (typeof value === 'object') {
    const json = JSONSerializer.serialize(value);
    return `'${json.replace(/'/g, "''")}'`;
  }

  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  const str = value.toString();
  return `'${str.replace(/'/g, "''")}'`;
};

const quoteString = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') {
    const minSQLiteInt = -9223372036854775808n;
    const maxSQLiteInt = 9223372036854775807n;

    // If it's in SQLite's INTEGER range, treat it as a number
    if (value >= minSQLiteInt && value <= maxSQLiteInt) {
      return value.toString();
    }

    // Out of range — fallback to quoted TEXT
    return `'${value.toString()}'`;
  }

  if (Array.isArray(value)) {
    return value
      .map((v, i) => {
        if (v !== null && v !== undefined) {
          if (Array.isArray(v)) return arrayToList(i !== 0, v, quoteString);
          return quoteString(v);
        }
        return '';
      })
      .filter((v) => v !== '')
      .toString();
  }

  if (typeof value === 'object') {
    return JSONSerializer.serialize(value);
  }

  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return value.toString();
};

const formatWithArray = (fmt: string, parameters: unknown[]): string => {
  let index = 0;
  const re = /%(%|(\\d+\\$)?[ILs])/g;

  return fmt.replace(re, (_, type) => {
    if (type === '%') return '%';

    let position = index;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const tokens = type.split('$') as string[];
    if (tokens.length > 1) {
      position = parseInt(tokens[0]!, 10) - 1;
      type = tokens[1];
    }

    if (position < 0 || position >= parameters.length) {
      throw new Error('Invalid parameter index');
    }

    index = position + 1;

    if (type === 'I') return quoteIdent(parameters[position]);
    if (type === 'L') return quoteLiteral(parameters[position]);
    if (type === 's') return quoteString(parameters[position]);

    return '';
  });
};

const format = (fmt: string, ...args: unknown[]): string => {
  return formatWithArray(fmt, args);
};

format.ident = quoteIdent;
format.literal = quoteLiteral;
format.string = quoteString;
format.withArray = formatWithArray;
format.config = (_cfg: unknown) => {}; // No-op for SQLite

export default format;
