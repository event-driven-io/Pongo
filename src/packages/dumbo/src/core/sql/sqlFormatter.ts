import { JSONSerializer } from '../serializer';
import { isParametrizedSQL, ParametrizedSQL } from './parametrizedSQL';
import { SQL, type SQLIn } from './sql';

export interface ParametrizedQuery {
  query: string;
  params: unknown[];
}

export interface SQLFormatter {
  formatIdentifier: (value: unknown) => string;
  formatLiteral: (value: unknown) => string;
  format: (sql: SQL | SQL[]) => ParametrizedQuery;
  formatRaw: (sql: SQL | SQL[]) => string;
  placeholderGenerator: (index: number) => string;
  params: SQLParameterMapper;
}

export interface SQLParameterMapper {
  mapString?: (value: unknown) => string;
  mapBoolean?: (value: boolean) => unknown;
  mapArray?: (
    array: unknown[],
    itemFormatter: (item: unknown) => unknown,
  ) => unknown[];
  mapDate?: (value: Date) => unknown;
  mapObject?: (value: object) => unknown;
  mapBigInt?: (value: bigint) => unknown;
  mapValue: (value: unknown) => unknown;
}

const formatters: Record<string, SQLFormatter> = {};

export const registerFormatter = (
  dialect: string,
  formatter: SQLFormatter,
): void => {
  formatters[dialect] = formatter;
};

export const getFormatter = (dialect: string): SQLFormatter => {
  const formatterKey = dialect;
  if (!formatters[formatterKey]) {
    throw new Error(`No SQL formatter registered for dialect: ${dialect}`);
  }
  return formatters[formatterKey];
};

export const formatSQLRaw = (
  _sql: SQL | SQL[],
  _formatter: SQLFormatter,
): string => 'TODO';

export function mapSQLParam(value: unknown, formatter: SQLFormatter): unknown {
  if (value === null || value === undefined) {
    return null;
  } else if (typeof value === 'number') {
    return value;
  } else if (typeof value === 'string') {
    return value;
  } else if (Array.isArray(value)) {
    return value.map((item) => mapSQLParam(item, formatter));
  } else if (typeof value === 'boolean') {
    return formatter.params.mapBoolean
      ? formatter.params.mapBoolean(value)
      : value
        ? 'TRUE'
        : 'FALSE';
  } else if (typeof value === 'bigint') {
    return formatter.params.mapBigInt
      ? formatter.params.mapBigInt(value)
      : value.toString();
  } else if (value instanceof Date && formatter.params.mapDate) {
    return formatter.params.mapDate(value);
  } else if (typeof value === 'object') {
    return formatter.params.mapObject
      ? formatter.params.mapObject(value)
      : `'${JSONSerializer.serialize(value).replace(/'/g, "''")}'`;
  } else if (SQL.check.isLiteral(value)) {
    return formatter.formatLiteral(value.value);
  } else if (SQL.check.isIdentifier(value)) {
    return formatter.formatIdentifier(value.value);
  } else {
    return formatter.formatLiteral(value);
  }
}

const processSQLValue = (
  value: unknown,
  {
    formatter,
    builder,
  }: { formatter: SQLFormatter; builder: ParametrizedQueryBuilder },
): void => {
  const expandSQLIn = (value: SQLIn) => {
    const { values: inValues, column } = value;

    if (inValues.length === 0) {
      builder.addParam(mapSQLParam(false, formatter));
      return;
    }

    builder.addParams([column]);
    builder.addSQL(` IN `);

    expandArray(inValues);
  };

  const expandArray = (value: unknown[]) => {
    if (value.length === 0) {
      throw new Error(
        'Empty arrays in IN clauses are not supported. Use SQL.in(column, array) helper instead.',
      );
    }
    builder.addParams(mapSQLParam(value, formatter) as unknown[]);
  };

  if (SQL.check.isLiteral(value)) {
    builder.addParam(formatter.formatLiteral(value.value));
  } else if (SQL.check.isIdentifier(value)) {
    builder.addSQL(formatter.formatIdentifier(value.value));
  } else if (SQL.check.isSQLIn(value)) {
    expandSQLIn(value);
  } else {
    builder.addParam(mapSQLParam(value, formatter));
  }
};

export function formatSQL(
  sql: SQL | SQL[],
  formatter: SQLFormatter,
): ParametrizedQuery {
  const merged = (Array.isArray(sql)
    ? SQL.merge(sql, '\n')
    : sql) as unknown as ParametrizedSQL;

  if (!isParametrizedSQL(merged)) {
    throw new Error('Expected ParametrizedSQL, got string-based SQL');
  }

  const builder = ParametrizedQueryBuilder({
    placeholderGenerator: formatter.placeholderGenerator,
  });

  let paramIndex = 0;

  for (let i = 0; i < merged.sqlChunks.length; i++) {
    const sqlChunk = merged.sqlChunks[i]!;
    builder.addSQL(sqlChunk);

    if (sqlChunk !== ParametrizedSQL.paramPlaceholder) {
      builder.addSQL(sqlChunk);
      continue;
    }

    processSQLValue(merged.values[paramIndex++], {
      formatter,
      builder,
    });
  }

  return builder.build();
}

export type ParametrizedQueryBuilder = {
  addSQL: (str: string) => ParametrizedQueryBuilder;
  addParam(value: unknown): ParametrizedQueryBuilder;
  addParams(values: unknown[]): ParametrizedQueryBuilder;
  build: () => ParametrizedQuery;
};

const ParametrizedQueryBuilder = ({
  placeholderGenerator,
}: {
  placeholderGenerator: (index: number) => string;
}): ParametrizedQueryBuilder => {
  const sql: string[] = [];
  const params: unknown[] = [];

  return {
    addSQL(str: string): ParametrizedQueryBuilder {
      sql.push(str);
      return this;
    },
    addParam(value: unknown): ParametrizedQueryBuilder {
      sql.push(placeholderGenerator(params.length));
      params.push(value);
      return this;
    },
    addParams(values: unknown[]): ParametrizedQueryBuilder {
      const placeholders = values.map((_, i) =>
        placeholderGenerator(params.length + i),
      );
      this.addSQL(`(${placeholders.join(', ')})`);
      params.push(...values);
      return this;
    },
    build(): ParametrizedQuery {
      return {
        query: sql.join(''),
        params,
      };
    },
  };
};
