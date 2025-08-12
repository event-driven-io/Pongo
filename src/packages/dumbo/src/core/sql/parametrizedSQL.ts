import { SQL, type SQLIn } from './sql';

export interface ParametrizedSQL {
  __brand: 'parametrized-sql';
  sql: string;
  params: unknown[];
}

export const ParametrizedSQL = (
  strings: TemplateStringsArray,
  values: unknown[],
): ParametrizedSQL => {
  let resultSql = '';
  const params: unknown[] = [];
  let paramIndex = 1;

  const expandSQL = (value: ParametrizedSQL) => {
    const adjustedSql = adjustParameterNumbers(value.sql, paramIndex - 1);
    resultSql += adjustedSql.sql;
    params.push(...value.params);
    paramIndex += value.params.length;
  };

  const expandSQLIn = (value: SQLIn) => {
    const { values: inValues, column } = value;

    if (inValues.length === 0) {
      resultSql += param(paramIndex);
      params.push(false);
      paramIndex++;
      return;
    }

    resultSql += `${param(paramIndex)} IN `;
    params.push(column);
    paramIndex++;

    expandArray(inValues);
  };

  const expandArray = (value: unknown[]) => {
    if (value.length === 0) {
      throw new Error(
        'Empty arrays in IN clauses are not supported. Use SQL.in(column, array) helper instead.',
      );
    }
    const placeholders = value.map((_, idx) => param(paramIndex + idx));
    resultSql += `(${placeholders.join(', ')})`;
    params.push(...(value as unknown as []));
    paramIndex += value.length;
  };

  for (let i = 0; i < strings.length; i++) {
    resultSql += strings[i];

    if (i >= values.length) break;

    const value = values[i];

    if (SQL.check.isPlain(value)) {
      resultSql += value.value;
    } else if (isParametrizedSQL(value)) {
      expandSQL(value);
    } else if (SQL.check.isSQLIn(value)) {
      expandSQLIn(value);
    } else if (Array.isArray(value)) {
      expandArray(value);
    } else {
      resultSql += param(paramIndex);
      params.push(value);
      paramIndex++;
    }
  }

  return {
    __brand: 'parametrized-sql',
    sql: resultSql,
    params,
  };
};

export const isParametrizedSQL = (value: unknown): value is ParametrizedSQL => {
  return (
    value !== null &&
    typeof value === 'object' &&
    '__brand' in value &&
    value.__brand === 'parametrized-sql'
  );
};

const param = (index: number): string => `__P${index}__`;

const adjustParameterNumbers = (
  sql: string,
  offset: number,
): { sql: string } => {
  if (offset === 0) {
    return { sql };
  }

  return {
    sql: sql.replace(/__P(\d+)__/g, (_match, num: string) => {
      const newNum = parseInt(num, 10) + offset;
      return param(newNum);
    }),
  };
};
