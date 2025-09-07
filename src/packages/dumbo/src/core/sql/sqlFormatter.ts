import { JSONSerializer } from '../serializer';
import { isParametrizedSQL, ParametrizedSQL } from './parametrizedSQL';
import { SQL } from './sql';
import { SQLArray, type SQLIn, type SQLToken } from './tokens';

export interface ParametrizedQuery {
  query: string;
  params: unknown[];
}

export interface SQLFormatter {
  format: (sql: SQL | SQL[]) => ParametrizedQuery;
  describe: (sql: SQL | SQL[]) => string;
  valueMapper: SQLValueMapper;
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

export const SQLValueMapper = (
  mapper?: Partial<SQLValueMapper>,
): SQLValueMapper => {
  const resultMapper: SQLValueMapper = {
    mapValue: (value: unknown) => mapSQLParamValue(value, resultMapper),
    mapPlaceholder: GetDefaultSQLParamPlaceholder,
    mapIdentifier: (value: string) => value,
    ...(mapper ?? {}),
  };
  return resultMapper;
};

export const GetDefaultSQLParamPlaceholder = () => `?`;

export type SQLFormatterOptions = Partial<Omit<SQLFormatter, 'valueMapper'>> & {
  valueMapper?: Partial<SQLValueMapper>;
};

export const SQLFormatter = ({
  format,
  describe,
  valueMapper,
}: SQLFormatterOptions): SQLFormatter => {
  const resultFormatter: SQLFormatter = {
    format: format ?? ((sql: SQL | SQL[]) => formatSQL(sql, resultFormatter)),
    describe:
      describe ?? ((sql: SQL | SQL[]) => describeSQL(sql, resultFormatter)),
    valueMapper: SQLValueMapper(valueMapper),
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
  valueMapper: SQLValueMapper,
): unknown {
  if (value === null || value === undefined) {
    return null;
  } else if (typeof value === 'number') {
    return value;
  } else if (typeof value === 'string') {
    return value;
  } else if (Array.isArray(value)) {
    return valueMapper.mapArray
      ? valueMapper.mapArray(value, valueMapper.mapValue.bind(valueMapper))
      : value.map((item) => valueMapper.mapValue.bind(valueMapper)(item));
  } else if (typeof value === 'boolean') {
    return valueMapper.mapBoolean ? valueMapper.mapBoolean(value) : value;
  } else if (typeof value === 'bigint') {
    return valueMapper.mapBigInt
      ? valueMapper.mapBigInt(value)
      : value.toString();
  } else if (value instanceof Date) {
    return valueMapper.mapDate
      ? valueMapper.mapDate(value)
      : value.toISOString();
  } else if (SQL.check.isIdentifier(value)) {
    return valueMapper.mapIdentifier(value.value);
  } else if (typeof value === 'object') {
    return valueMapper.mapObject
      ? valueMapper.mapObject(value)
      : `${JSONSerializer.serialize(value).replace(/'/g, "''")}`;
  } else {
    return JSONSerializer.serialize(value);
  }
}

type SQLProcessorContext = {
  mapper: SQLValueMapper;
  builder: ParametrizedQueryBuilder;
  processorsRegistry: SQLProcessorsReadonlyRegistry;
};

export type SQLProcessor<Token extends SQLToken = SQLToken> = {
  canHandle: Token['sqlTokenType'];
  handle: (value: Token, context: SQLProcessorContext) => void;
};

export type SQLProcessorOptions<Token extends SQLToken = SQLToken> = {
  canHandle: Token['sqlTokenType'];
  handle: (value: Token, context: SQLProcessorContext) => void;
};

export const SQLProcessor = <Token extends SQLToken = SQLToken>(
  options: SQLProcessorOptions<Token>,
): SQLProcessor<Token> => options;

export interface SQLProcessorsReadonlyRegistry {
  get<Token extends SQLToken = SQLToken>(
    tokenType: Token['sqlTokenType'],
  ): SQLProcessor<Token> | null;
}

export interface SQLProcessorsRegistry extends SQLProcessorsReadonlyRegistry {
  register(processor: SQLProcessor): void;
}

export const SQLProcessorsRegistry = (): SQLProcessorsRegistry => {
  const processors = new Map<string, SQLProcessor>();
  return {
    register: (processor: SQLProcessor): void => {
      processors.set(processor.canHandle, processor);
    },
    get: <Token extends SQLToken = SQLToken>(
      tokenType: string,
    ): SQLProcessor<Token> | null => {
      return (processors.get(tokenType) ?? null) as SQLProcessor<Token> | null;
    },
  };
};

const expandArray = (
  token: SQLArray,
  { builder, mapper }: SQLProcessorContext,
) => {
  if (token.value.length === 0) {
    throw new Error(
      "Empty arrays are not supported. If you're using it with SELECT IN statement Use SQL.in(column, array) helper instead.",
    );
  }
  builder.addParams(mapper.mapValue(token.value) as unknown[]);
};

export const ExpandArrayProcessor: SQLProcessor<SQLArray> = SQLProcessor({
  canHandle: 'SQL_ARRAY',
  handle: (token: SQLArray, { builder, mapper }: SQLProcessorContext) => {
    if (token.value.length === 0) {
      throw new Error(
        "Empty arrays are not supported. If you're using it with SELECT IN statement Use SQL.in(column, array) helper instead.",
      );
    }
    builder.addParams(mapper.mapValue(token.value) as unknown[]);
  },
});

const expandSQLIn = (token: SQLIn, context: SQLProcessorContext) => {
  const { builder, mapper, processorsRegistry } = context;
  const { values: inValues, column } = token.value;

  if (inValues.value.length === 0) {
    builder.addParam(mapper.mapValue(false));
    return;
  }

  builder.addSQL(mapper.mapIdentifier(column.value));
  builder.addSQL(` IN `);

  const arrayProcessor = processorsRegistry.get(SQLArray.type);

  if (!arrayProcessor) {
    throw new Error(
      'No sql processor registered for an array. Cannot expand IN statement',
    );
  }

  arrayProcessor.handle(inValues, { builder, mapper, processorsRegistry });
};

export const ExpandSQLInProcessor: SQLProcessor<SQLIn> = SQLProcessor({
  canHandle: 'SQL_IN',
  handle: (token: SQLIn, context: SQLProcessorContext) => {
    const { builder, mapper, processorsRegistry } = context;
    const { values: inValues, column } = token.value;

    if (inValues.value.length === 0) {
      builder.addParam(mapper.mapValue(false));
      return;
    }

    builder.addSQL(mapper.mapIdentifier(column.value));
    builder.addSQL(` IN `);

    const arrayProcessor = processorsRegistry.get(SQLArray.type);

    if (!arrayProcessor) {
      throw new Error(
        'No sql processor registered for an array. Cannot expand IN statement',
      );
    }

    arrayProcessor.handle(inValues, { builder, mapper, processorsRegistry });
  },
});

const processSQLParam = (
  value: unknown,
  { mapper, builder }: SQLProcessorContext,
): void => {
  if (SQL.check.isIdentifier(value)) {
    builder.addSQL(mapper.mapIdentifier(value.value));
  } else if (SQL.check.isSQLIn(value)) {
    expandSQLIn(value, { builder, mapper });
  } else if (Array.isArray(value)) {
    expandArray(value, { builder, mapper });
  } else {
    builder.addParam(mapper.mapValue(value));
  }
};

const describeSQLParam = (
  value: unknown,
  {
    mapper: mapper,
    builder,
  }: { mapper: SQLValueMapper; builder: ParametrizedQueryBuilder },
): void => {
  const expandSQLIn = (value: SQLIn) => {
    const { values: inValues, column } = value.value;

    if (inValues.value.length === 0) {
      builder.addParam(mapper.mapValue(false));
      return;
    }

    builder.addSQL(mapper.mapIdentifier(column.value));
    builder.addSQL(` IN `);

    expandArray(inValues.value);
  };

  const expandArray = (value: unknown[]) => {
    if (value.length === 0) {
      throw new Error(
        "Empty arrays are not supported. If you're using it in In statement Use SQL.in(column, array) helper instead.",
      );
    }
    builder.addSQL(
      `(${value.map((item) => JSONSerializer.serialize(mapper.mapValue(item))).join(', ')})`,
    );
  };

  if (SQL.check.isIdentifier(value)) {
    builder.addSQL(mapper.mapIdentifier(value.value));
  } else if (SQL.check.isSQLIn(value)) {
    expandSQLIn(value);
  } else if (Array.isArray(value)) {
    expandArray(value);
  } else {
    builder.addSQL(JSONSerializer.serialize(mapper.mapValue(value)));
  }
};

export function formatSQL(
  sql: SQL | SQL[],
  formatter: SQLFormatter,
): ParametrizedQuery {
  const { valueMapper: mapper } = formatter;
  const merged = (Array.isArray(sql)
    ? SQL.merge(sql, '\n')
    : sql) as unknown as ParametrizedSQL;

  if (!isParametrizedSQL(merged)) {
    throw new Error('Expected ParametrizedSQL, got string-based SQL');
  }

  const builder = ParametrizedQueryBuilder({
    mapParamPlaceholder: mapper.mapPlaceholder,
  });

  let paramIndex = 0;

  for (let i = 0; i < merged.sqlChunks.length; i++) {
    const sqlChunk = merged.sqlChunks[i]!;

    if (sqlChunk !== ParametrizedSQL.paramPlaceholder) {
      builder.addSQL(sqlChunk);
      continue;
    }

    processSQLParam(merged.sqlTokens[paramIndex++], {
      mapper: mapper,
      builder,
    });
  }

  return builder.build();
}

const defaultSQLMapper = SQLValueMapper();

export const describeSQL = (
  sql: SQL | SQL[],
  formatter?: SQLFormatter,
): string => {
  const mapper = formatter?.valueMapper ?? defaultSQLMapper;
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
    describeSQLParam(merged.sqlTokens[paramIndex++], {
      builder,
      mapper,
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
