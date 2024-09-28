// Ported from: https://github.com/datalanche/node-pg-format/blob/master/lib/index.js
import { JSONSerializer } from '../../serializer/index.js';
import reservedMap from './reserved.js';

type FormatterConfig = {
  pattern?: {
    ident?: string;
    literal?: string;
    string?: string;
  };
};

type FormatterFunction = (value: unknown) => string;

const fmtPattern = {
  ident: 'I',
  literal: 'L',
  string: 's',
};

// convert to Postgres default ISO 8601 format
const formatDate = (date: string): string => {
  date = date.replace('T', ' ');
  date = date.replace('Z', '+00');
  return date;
};

const isReserved = (value: string): boolean => {
  return !!reservedMap[value.toUpperCase()];
};

const arrayToList = (
  useSpace: boolean,
  array: unknown[],
  formatter: FormatterFunction,
): string => {
  let sql = '';
  sql += useSpace ? ' (' : '(';
  for (let i = 0; i < array.length; i++) {
    sql += (i === 0 ? '' : ', ') + formatter(array[i]);
  }
  sql += ')';
  return sql;
};

// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
const quoteIdent = (value: unknown): string => {
  if (value === undefined || value === null) {
    throw new Error('SQL identifier cannot be null or undefined');
  } else if (value === false) {
    return '"f"';
  } else if (value === true) {
    return '"t"';
  } else if (value instanceof Date) {
    return '"' + formatDate(value.toISOString()) + '"';
  } else if (value instanceof Buffer) {
    throw new Error('SQL identifier cannot be a buffer');
  } else if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (Array.isArray(v)) {
          throw new Error(
            'Nested array to grouped list conversion is not supported for SQL identifier',
          );
        }
        return quoteIdent(v);
      })
      .toString();
  } else if (value === Object(value)) {
    throw new Error('SQL identifier cannot be an object');
  }

  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  const ident = value.toString().slice(0); // create copy

  // do not quote a valid, unquoted identifier
  if (/^[a-z_][a-z0-9_$]*$/.test(ident) && !isReserved(ident)) {
    return ident;
  }

  let quoted = '"';
  for (let i = 0; i < ident.length; i++) {
    const c = ident[i];
    quoted += c === '"' ? c + c : c;
  }
  quoted += '"';
  return quoted;
};

// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
const quoteLiteral = (value: unknown): string => {
  let literal: string | null = null;
  let explicitCast: string | null = null;

  if (value === undefined || value === null) {
    return 'NULL';
  } else if (value === false) {
    return "'f'";
  } else if (value === true) {
    return "'t'";
  } else if (value instanceof Date) {
    return "'" + formatDate(value.toISOString()) + "'";
  } else if (value instanceof Buffer) {
    return "E'\\\\x" + value.toString('hex') + "'";
  } else if (Array.isArray(value)) {
    return value
      .map((v, i) => {
        if (Array.isArray(v)) {
          return arrayToList(i !== 0, v, quoteLiteral);
        }
        return quoteLiteral(v);
      })
      .toString();
  } else if (value === Object(value)) {
    explicitCast = 'jsonb';
    literal = JSONSerializer.serialize(value);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    literal = value.toString().slice(0); // create copy
  }

  let hasBackslash = false;
  let quoted = "'";

  for (let i = 0; i < literal.length; i++) {
    const c = literal[i];
    if (c === "'") {
      quoted += c + c;
    } else if (c === '\\') {
      quoted += c + c;
      hasBackslash = true;
    } else {
      quoted += c;
    }
  }

  quoted += "'";

  if (hasBackslash) {
    quoted = 'E' + quoted;
  }

  if (explicitCast) {
    quoted += '::' + explicitCast;
  }

  return quoted;
};

const quoteString = (value: unknown): string => {
  if (value === undefined || value === null) {
    return '';
  } else if (value === false) {
    return 'f';
  } else if (value === true) {
    return 't';
  } else if (value instanceof Date) {
    return formatDate(value.toISOString());
  } else if (value instanceof Buffer) {
    return '\\x' + value.toString('hex');
  } else if (Array.isArray(value)) {
    return value
      .map((v, i) => {
        if (v !== null && v !== undefined) {
          if (Array.isArray(v)) {
            return arrayToList(i !== 0, v, quoteString);
          }
          return quoteString(v);
        }
        return ''; // Handle undefined or null values properly within arrays
      })
      .filter((v) => v !== '') // Filter out empty strings to avoid extra commas
      .toString();
  } else if (value === Object(value)) {
    return JSONSerializer.serialize(value);
  }
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return value.toString().slice(0); // return copy
};

const config = (cfg: FormatterConfig): void => {
  // default
  fmtPattern.ident = 'I';
  fmtPattern.literal = 'L';
  fmtPattern.string = 's';

  if (cfg && cfg.pattern) {
    if (cfg.pattern.ident) {
      fmtPattern.ident = cfg.pattern.ident;
    }
    if (cfg.pattern.literal) {
      fmtPattern.literal = cfg.pattern.literal;
    }
    if (cfg.pattern.string) {
      fmtPattern.string = cfg.pattern.string;
    }
  }
};

const formatWithArray = (fmt: string, parameters: unknown[]): string => {
  let index = 0;
  const params = parameters;

  let re: string | RegExp = '%(%|(\\d+\\$)?[';
  re += fmtPattern.ident;
  re += fmtPattern.literal;
  re += fmtPattern.string;
  re += '])';
  re = new RegExp(re, 'g');

  return fmt.replace(re, (_, type) => {
    if (type === '%') {
      return '%';
    }

    let position = index;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const tokens = type.split('$');

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (tokens.length > 1) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      position = parseInt(tokens[0], 10) - 1;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      type = tokens[1];
    }

    if (position < 0) {
      throw new Error('specified argument 0 but arguments start at 1');
    } else if (position > params.length - 1) {
      throw new Error('too few arguments');
    }

    index = position + 1;

    if (type === fmtPattern.ident) {
      return quoteIdent(params[position]);
    } else if (type === fmtPattern.literal) {
      return quoteLiteral(params[position]);
    } else if (type === fmtPattern.string) {
      return quoteString(params[position]);
    }

    return undefined!;
  });
};

const format = (fmt: string, ...args: unknown[]): string => {
  return formatWithArray(fmt, args);
};

format.config = config;
format.format = format;
format.ident = quoteIdent;
format.literal = quoteLiteral;
format.string = quoteString;
format.withArray = formatWithArray;

export default format;
