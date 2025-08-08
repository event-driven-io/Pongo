import { type SQL, isSQL } from './sql';

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

  for (let i = 0; i < strings.length; i++) {
    resultSql += strings[i];

    if (i < values.length) {
      const value = values[i];

      if (isParametrizedSQL(value)) {
        const adjustedSql = adjustParameterNumbers(value.sql, paramIndex - 1);
        resultSql += adjustedSql.sql;
        params.push(...value.params);
        paramIndex += value.params.length;
      } else if (isSQL(value)) {
        const nested = parametrizeSQL(value);
        const adjustedSql = adjustParameterNumbers(nested.sql, paramIndex - 1);
        resultSql += adjustedSql.sql;
        params.push(...nested.params);
        paramIndex += nested.params.length;
      } else {
        resultSql += `__P${paramIndex}__`;
        params.push(value);
        paramIndex++;
      }
    }
  }

  return {
    __brand: 'parametrized-sql',
    sql: resultSql,
    params,
  };
};

// Conversion function from SQL to ParametrizedSQL (for compatibility)
export const parametrizeSQL = (sql: SQL): ParametrizedSQL => {
  if (isParametrizedSQL(sql)) {
    return sql as unknown as ParametrizedSQL;
  }

  // Handle string-based SQL (fallback)
  return ParametrizedSQL(
    [sql as string] as unknown as TemplateStringsArray,
    [],
  );
};

export const isParametrizedSQL = (value: unknown): value is ParametrizedSQL => {
  return (
    value !== null &&
    typeof value === 'object' &&
    '__brand' in value &&
    value.__brand === 'parametrized-sql'
  );
};

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
      return `__P${newNum}__`;
    }),
  };
};
