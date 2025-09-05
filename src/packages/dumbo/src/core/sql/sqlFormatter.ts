import { JSONSerializer } from '../serializer';
import { isParametrizedSQL, ParametrizedSQL } from './parametrizedSQL';
import { SQL, type SQLIn } from './sql';

export interface ParametrizedQuery {
  query: string;
  params: unknown[];
}

export interface SQLFormatter {
  format: (sql: SQL | SQL[]) => ParametrizedQuery;
  describe: (sql: SQL | SQL[]) => string;
  params: SQLValueMapper;
}

export interface SQLValueMapper {
  mapBoolean?: (value: boolean) => unknown;
  mapArray?: (
    array: unknown[],
    itemFormatter: (item: unknown) => unknown,
  ) => unknown[];
  mapDate?: (value: Date) => unknown;
  mapObject?: (value: object) => unknown;
  mapBigInt?: (value: bigint) => unknown;
  mapValue: (value: unknown) => unknown;
  mapPlaceholder: (index: number) => string;
  mapIdentifier: (value: string) => string;
}

export const GetDefaultSQLParamPlaceholder = () => `?`;

export const SQLFormatter = (
  formatter: Omit<SQLFormatter, 'format' | 'describe' | 'params'> &
    Partial<Pick<SQLFormatter, 'format' | 'describe'>> & {
      params?: Partial<SQLValueMapper>;
    },
): SQLFormatter => {
  const paramsProcessor: SQLValueMapper = {
    mapValue: (value: unknown) => mapSQLParamValue(value, paramsProcessor),
    mapPlaceholder: GetDefaultSQLParamPlaceholder,
    mapIdentifier: (value: string) => value,
    ...(formatter.params ?? {}),
  };

  const resultFormatter: SQLFormatter = {
    format: (sql: SQL | SQL[]) => formatSQL(sql, resultFormatter),
    describe: (sql: SQL | SQL[]) => describeSQL(sql),
    ...formatter,
    params: paramsProcessor,
  };

  return resultFormatter;
};

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

export function mapSQLParamValue(
  value: unknown,
  formatter: SQLValueMapper,
): unknown {
  if (value === null || value === undefined) {
    return null;
  } else if (typeof value === 'number') {
    return value;
  } else if (typeof value === 'string') {
    return value;
  } else if (Array.isArray(value)) {
    return value.map((item) => mapSQLParamValue(item, formatter));
  } else if (typeof value === 'boolean') {
    return formatter.mapBoolean ? formatter.mapBoolean(value) : value;
  } else if (typeof value === 'bigint') {
    return formatter.mapBigInt ? formatter.mapBigInt(value) : value.toString();
  } else if (value instanceof Date) {
    return formatter.mapDate ? formatter.mapDate(value) : value.toISOString();
  } else if (SQL.check.isIdentifier(value)) {
    return formatter.mapIdentifier(value.value);
  } else if (typeof value === 'object') {
    return formatter.mapObject
      ? formatter.mapObject(value)
      : `${JSONSerializer.serialize(value).replace(/'/g, "''")}`;
  } else {
    return JSONSerializer.serialize(value);
  }
}

const processSQLParam = (
  value: unknown,
  {
    formatter,
    builder,
  }: { formatter: SQLFormatter; builder: ParametrizedQueryBuilder },
): void => {
  const expandSQLIn = (value: SQLIn) => {
    const { values: inValues, column } = value;

    if (inValues.length === 0) {
      builder.addParam(mapSQLParamValue(false, formatter.params));
      return;
    }

    builder.addSQL(formatter.params.mapIdentifier(column.value));
    builder.addSQL(` IN `);

    expandArray(inValues);
  };

  const expandArray = (value: unknown[]) => {
    if (value.length === 0) {
      throw new Error(
        "Empty arrays are not supported. If you're using it with SELECT IN statement Use SQL.in(column, array) helper instead.",
      );
    }
    builder.addParams(mapSQLParamValue(value, formatter.params) as unknown[]);
  };

  if (SQL.check.isIdentifier(value)) {
    builder.addSQL(formatter.params.mapIdentifier(value.value));
  } else if (SQL.check.isSQLIn(value)) {
    expandSQLIn(value);
  } else if (Array.isArray(value)) {
    expandArray(value);
  } else {
    builder.addParam(mapSQLParamValue(value, formatter.params));
  }
};

const describeSQLParam = (
  value: unknown,
  {
    formatter,
    builder,
  }: { formatter: SQLFormatter; builder: ParametrizedQueryBuilder },
): void => {
  const expandSQLIn = (value: SQLIn) => {
    const { values: inValues, column } = value;

    if (inValues.length === 0) {
      builder.addParam(mapSQLParamValue(false, formatter.params));
      return;
    }

    builder.addSQL(formatter.params.mapIdentifier(column.value));
    builder.addSQL(` IN `);

    expandArray(inValues);
  };

  const expandArray = (value: unknown[]) => {
    if (value.length === 0) {
      throw new Error(
        "Empty arrays are not supported. If you're using it in In statement Use SQL.in(column, array) helper instead.",
      );
    }
    builder.addSQL(
      `(${value.map((item) => JSONSerializer.serialize(mapSQLParamValue(item, formatter.params))).join(', ')})`,
    );
  };

  if (SQL.check.isIdentifier(value)) {
    builder.addSQL(formatter.params.mapIdentifier(value.value));
  } else if (SQL.check.isSQLIn(value)) {
    expandSQLIn(value);
  } else if (Array.isArray(value)) {
    expandArray(value);
  } else {
    builder.addSQL(
      JSONSerializer.serialize(mapSQLParamValue(value, formatter.params)),
    );
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
    mapParamPlaceholder: formatter.params.mapPlaceholder,
  });

  let paramIndex = 0;

  for (let i = 0; i < merged.sqlChunks.length; i++) {
    const sqlChunk = merged.sqlChunks[i]!;

    if (sqlChunk !== ParametrizedSQL.paramPlaceholder) {
      builder.addSQL(sqlChunk);
      continue;
    }

    processSQLParam(merged.values[paramIndex++], {
      formatter,
      builder,
    });
  }

  return builder.build();
}

const describeSQLFormatter = SQLFormatter({});

export const describeSQL = (
  sql: SQL | SQL[],
  formatter?: SQLFormatter,
): string => {
  formatter ??= describeSQLFormatter;
  const merged = (Array.isArray(sql)
    ? SQL.merge(sql, '\n')
    : sql) as unknown as ParametrizedSQL;

  if (!isParametrizedSQL(merged)) {
    throw new Error('Expected ParametrizedSQL, got string-based SQL');
  }

  const builder = ParametrizedQueryBuilder({
    mapParamPlaceholder: GetDefaultSQLParamPlaceholder,
  });

  let paramIndex = 0;

  for (let i = 0; i < merged.sqlChunks.length; i++) {
    const sqlChunk = merged.sqlChunks[i]!;

    if (sqlChunk !== ParametrizedSQL.paramPlaceholder) {
      builder.addSQL(sqlChunk);
      continue;
    }
    describeSQLParam(merged.values[paramIndex++], {
      builder,
      formatter,
    });
  }

  return builder.build().query;
};

export type ParametrizedQueryBuilder = {
  addSQL: (str: string) => ParametrizedQueryBuilder;
  addParam(value: unknown): ParametrizedQueryBuilder;
  addParams(values: unknown[]): ParametrizedQueryBuilder;
  build: () => ParametrizedQuery;
};

const ParametrizedQueryBuilder = ({
  mapParamPlaceholder,
}: {
  mapParamPlaceholder: (index: number) => string;
}): ParametrizedQueryBuilder => {
  const sql: string[] = [];
  const params: unknown[] = [];

  return {
    addSQL(str: string): ParametrizedQueryBuilder {
      sql.push(str);
      return this;
    },
    addParam(value: unknown): ParametrizedQueryBuilder {
      sql.push(mapParamPlaceholder(params.length));
      params.push(value);
      return this;
    },
    addParams(values: unknown[]): ParametrizedQueryBuilder {
      const placeholders = values.map((_, i) =>
        mapParamPlaceholder(params.length + i),
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
