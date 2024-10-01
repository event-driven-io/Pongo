import format from './pg-format';
// TODO: add core formatter, when adding other database type

type SQL = string & { __brand: 'sql' };

const sql = (sqlQuery: string, ...params: unknown[]): SQL => {
  return format(sqlQuery, ...params) as SQL;
};

const rawSql = (sqlQuery: string): SQL => {
  return sqlQuery as SQL;
};

const isSQL = (literal: unknown): literal is SQL =>
  literal !== undefined && literal !== null && typeof literal === 'string';

type SQLValue =
  | { type: 'literal'; value: unknown } // Literal types (e.g., strings, numbers)
  | { type: 'identifier'; value: string } // Identifier types (e.g., table/column names)
  | { type: 'plainString'; value: string }; // Plain string types (unsafe, unescaped)

// Wrapping functions for explicit formatting
const literal = (value: unknown) => ({ type: 'literal', value });
const identifier = (value: string) => ({ type: 'identifier', value });
const plainString = (value: string) => ({ type: 'plainString', value });

const defaultFormat = (value: unknown) => {
  if (typeof value === 'string') {
    return format('%L', value);
  } else if (typeof value === 'number') {
    return value.toString();
  } else if (typeof value === 'bigint') {
    return format('%L', value);
  } else if (value instanceof Date) {
    return format('%L', value);
  } else if (Array.isArray(value)) {
    return format('(%L)', value);
  } else {
    return format('%L', value);
  }
};

function SQL(strings: TemplateStringsArray, ...values: unknown[]): SQL {
  return strings
    .map((string, index) => {
      let formattedValue = '';

      if (index < values.length) {
        const value = values[index];

        if (
          value &&
          typeof value === 'object' &&
          'type' in value &&
          'value' in value
        ) {
          const sqlValue = value as SQLValue;
          switch (sqlValue.type) {
            case 'literal':
              formattedValue = format('%L', sqlValue.value);
              break;
            case 'identifier':
              formattedValue = format('%I', sqlValue.value);
              break;
            case 'plainString':
              formattedValue = sqlValue.value;
              break;
          }
        } else {
          formattedValue = defaultFormat(value);
        }
      }

      return string + formattedValue;
    })
    .join('') as SQL;
}

export { SQL, identifier, isSQL, literal, plainString, rawSql, sql };
