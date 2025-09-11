import { JSONSerializer } from '../serializer';
import { isParametrizedSQL, ParametrizedSQL } from './parametrizedSQL';
import {
  defaultProcessorsRegistry,
  type SQLProcessorContext,
  SQLProcessorsRegistry,
} from './processors';
import { SQL } from './sql';

export interface ParametrizedQuery {
  query: string;
  params: unknown[];
}

export interface SQLFormatter {
  format: (
    sql: SQL | SQL[],
    context?: SQLProcessorContext,
  ) => ParametrizedQuery;
  describe: (sql: SQL | SQL[], context?: SQLProcessorContext) => string;
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
  mapPlaceholder: (index: number, value: unknown) => string;
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
  processorsRegistry?: SQLProcessorsRegistry;
};

export const SQLFormatter = ({
  format,
  describe,
  valueMapper: valueMapperOptions,
  processorsRegistry,
}: SQLFormatterOptions): SQLFormatter => {
  const valueMapper = SQLValueMapper(valueMapperOptions);
  const options = {
    builder: ParametrizedQueryBuilder({
      mapParamPlaceholder: valueMapper.mapPlaceholder,
    }),
    mapper: valueMapper,
    processorsRegistry: processorsRegistry ?? defaultProcessorsRegistry,
  };

  const resultFormatter: SQLFormatter = {
    format:
      format ??
      ((sql: SQL | SQL[], methodOptions) =>
        formatSQL(sql, resultFormatter, methodOptions ?? options)),
    describe:
      describe ??
      ((sql: SQL | SQL[], methodOptions) =>
        describeSQL(sql, resultFormatter, methodOptions ?? options)),
    valueMapper,
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

export type FormatSQLOptions = Partial<SQLProcessorContext>;

export function formatSQL(
  sql: SQL | SQL[],
  formatter: SQLFormatter,
  context?: FormatSQLOptions,
): ParametrizedQuery {
  const mapper = context?.mapper ?? formatter.valueMapper;
  const processorsRegistry =
    context?.processorsRegistry ?? defaultProcessorsRegistry;

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

    const token = merged.sqlTokens[paramIndex++]!;

    const processor = processorsRegistry.get(token.sqlTokenType);

    if (!processor) {
      throw new Error(
        `No SQL processor registered for token type: ${token.sqlTokenType}`,
      );
    }

    processor.handle(token, {
      builder,
      processorsRegistry,
      mapper,
    });
  }

  return builder.build();
}

const describeSQLMapper = SQLValueMapper({
  mapPlaceholder: (_, value) => JSONSerializer.serialize(value),
});

export const describeSQL = (
  sql: SQL | SQL[],
  formatter: SQLFormatter,
  options: FormatSQLOptions,
): string => formatSQL(sql, formatter, options).query;

export type ParametrizedQueryBuilder = {
  addSQL: (str: string) => ParametrizedQueryBuilder;
  addParam(value: unknown): ParametrizedQueryBuilder;
  addParams(values: unknown[]): ParametrizedQueryBuilder;
  build: () => ParametrizedQuery;
};

const ParametrizedQueryBuilder = ({
  mapParamPlaceholder,
}: {
  mapParamPlaceholder: (index: number, value: unknown) => string;
}): ParametrizedQueryBuilder => {
  const sql: string[] = [];
  const params: unknown[] = [];

  return {
    addSQL(str: string): ParametrizedQueryBuilder {
      sql.push(str);
      return this;
    },
    addParam(value: unknown): ParametrizedQueryBuilder {
      sql.push(mapParamPlaceholder(params.length, value));
      params.push(value);
      return this;
    },
    addParams(values: unknown[]): ParametrizedQueryBuilder {
      const placeholders = values.map((value, i) =>
        mapParamPlaceholder(params.length + i, value),
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
