import { SQL, type SQLIn } from './sql';

export interface ParametrizedSQL {
  __brand: 'parametrized-sql';
  sql: string;
  params: unknown[];
}

export const ParametrizedSQLBuilder = () => {
  const sql: string[] = [];
  const params: unknown[] = [];

  return {
    addSQL(str: string): void {
      sql.push(str);
    },
    addParam(value: unknown): void {
      params.push(value);
    },
    addParams(value: unknown[]): void {
      params.push(...value);
    },
    build(): ParametrizedSQL {
      return {
        __brand: 'parametrized-sql',
        sql: sql.join(''),
        params,
      };
    },
  };
};

export const ParametrizedSQL = (
  strings: TemplateStringsArray,
  values: unknown[],
): ParametrizedSQL => {
  const builder = ParametrizedSQLBuilder();

  const expandSQL = (value: ParametrizedSQL) => {
    builder.addSQL(value.sql);
    builder.addParams(value.params);
  };

  const expandSQLIn = (value: SQLIn) => {
    const { values: inValues, column } = value;

    if (inValues.length === 0) {
      builder.addSQL(param);
      builder.addParam(false);
      return;
    }

    builder.addSQL(`${param} IN `);
    builder.addParams([column]);

    expandArray(inValues);
  };

  const expandArray = (value: unknown[]) => {
    if (value.length === 0) {
      throw new Error(
        'Empty arrays in IN clauses are not supported. Use SQL.in(column, array) helper instead.',
      );
    }
    const placeholders = value.map(() => param);
    builder.addSQL(`(${placeholders.join(', ')})`);
    builder.addParams(value);
  };

  for (let i = 0; i < strings.length; i++) {
    builder.addSQL(strings[i]!);

    if (i >= values.length) break;

    const value = values[i];

    if (SQL.check.isPlain(value)) {
      builder.addSQL(value.value);
    } else if (isParametrizedSQL(value)) {
      expandSQL(value);
    } else if (SQL.check.isSQLIn(value)) {
      expandSQLIn(value);
    } else if (Array.isArray(value)) {
      expandArray(value);
    } else {
      builder.addSQL(param);
      builder.addParam(value);
    }
  }

  return builder.build();
};

export const isParametrizedSQL = (value: unknown): value is ParametrizedSQL => {
  return (
    value !== null &&
    typeof value === 'object' &&
    '__brand' in value &&
    value.__brand === 'parametrized-sql'
  );
};

const param = `__P__`;
