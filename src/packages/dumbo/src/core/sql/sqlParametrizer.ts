import {
  type SQL,
  type DeferredSQL,
  type RawSQL,
  isDeferredSQL,
  isRawSQL,
  isSQL,
  isIdentifier,
  isRaw,
  isLiteral,
} from './sql';

export interface ParametrizedSQL {
  __brand: 'parametrized-sql';
  sql: string;
  params: unknown[];
}

export function parametrizeSQL(sql: SQL): ParametrizedSQL {
  if (isRawSQL(sql)) {
    const raw = sql as RawSQL;
    return {
      __brand: 'parametrized-sql',
      sql: raw.sql,
      params: [],
    };
  }

  if (isDeferredSQL(sql)) {
    const deferred = sql as DeferredSQL;
    return processDeferred(deferred);
  }

  // Fallback for plain string SQL (shouldn't happen in practice)
  return {
    __brand: 'parametrized-sql',
    sql: sql as string,
    params: [],
  };
}

function processDeferred(deferred: DeferredSQL): ParametrizedSQL {
  let resultSql = '';
  const params: unknown[] = [];
  let paramIndex = 1;

  for (let i = 0; i < deferred.strings.length; i++) {
    resultSql += deferred.strings[i];

    if (i < deferred.values.length) {
      const value = deferred.values[i];

      // Handle special value types
      if (isIdentifier(value)) {
        // Identifiers are inlined with quotes
        resultSql += `"${value.value}"`;
      } else if (isRaw(value)) {
        // Raw SQL is inlined directly
        resultSql += value.value;
      } else if (isLiteral(value)) {
        // Literals become parameters
        resultSql += `__P${paramIndex}__`;
        params.push(value.value);
        paramIndex++;
      } else if (isSQL(value)) {
        // Nested SQL - recursively process and flatten
        const nested = parametrizeSQL(value);

        // Adjust parameter placeholders in nested SQL
        const adjustedSql = adjustParameterNumbers(nested.sql, paramIndex - 1);
        resultSql += adjustedSql.sql;

        // Add nested parameters to our parameter array
        params.push(...nested.params);
        paramIndex += nested.params.length;
      } else {
        // Regular values become parameters
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
}

function adjustParameterNumbers(sql: string, offset: number): { sql: string } {
  if (offset === 0) {
    return { sql };
  }

  // Replace __P1__, __P2__, etc. with adjusted numbers
  return {
    sql: sql.replace(/__P(\d+)__/g, (_match, num: string) => {
      const newNum = parseInt(num, 10) + offset;
      return `__P${newNum}__`;
    }),
  };
}
