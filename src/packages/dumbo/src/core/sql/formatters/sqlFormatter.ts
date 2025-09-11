import { JSONSerializer } from '../../serializer';
import {
  ParametrizedQueryBuilder,
  type ParametrizedQuery,
} from '../parametrizedQuery';
import {
  defaultProcessorsRegistry,
  SQLProcessorsRegistry,
  type SQLProcessorContext,
  type SQLProcessorsReadonlyRegistry,
} from '../processors';
import { SQL } from '../sql';
import { isTokenizedSQL, TokenizedSQL } from '../tokenizedSQL';
import { SQLValueMapper, type MapSQLParamValueOptions } from '../valueMappers';

export interface SQLFormatter {
  format: (
    sql: SQL | SQL[],
    context?: SQLProcessorContext,
  ) => ParametrizedQuery;
  describe: (sql: SQL | SQL[], context?: SQLProcessorContext) => string;
  valueMapper: SQLValueMapper;
}

export type FormatSQLOptions = {
  mapper?: MapSQLParamValueOptions;
  processorsRegistry?: SQLProcessorsReadonlyRegistry;
};

export type SQLFormatterOptions = Partial<Omit<SQLFormatter, 'valueMapper'>> & {
  valueMapper?: MapSQLParamValueOptions;
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
        formatSQL(sql, resultFormatter, {
          ...options,
          ...(methodOptions ?? {}),
        })),
    describe:
      describe ??
      ((sql: SQL | SQL[], methodOptions) =>
        describeSQL(sql, resultFormatter, {
          ...options,
          ...(methodOptions ?? {}),
        })),
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

export function formatSQL(
  sql: SQL | SQL[],
  formatter: SQLFormatter,
  context?: FormatSQLOptions,
): ParametrizedQuery {
  const mapper: SQLValueMapper =
    context?.mapper == undefined
      ? formatter.valueMapper
      : {
          ...formatter.valueMapper,
          ...context.mapper,
        };
  const processorsRegistry =
    context?.processorsRegistry ?? defaultProcessorsRegistry;

  const merged = (Array.isArray(sql)
    ? SQL.merge(sql, '\n')
    : sql) as unknown as TokenizedSQL;

  if (!isTokenizedSQL(merged)) {
    throw new Error('Expected TokenizedSQL, got string-based SQL');
  }

  const builder = ParametrizedQueryBuilder({
    mapParamPlaceholder: mapper.mapPlaceholder,
  });

  let paramIndex = 0;

  for (let i = 0; i < merged.sqlChunks.length; i++) {
    const sqlChunk = merged.sqlChunks[i]!;

    if (sqlChunk !== TokenizedSQL.paramPlaceholder) {
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

export const describeSQL = (
  sql: SQL | SQL[],
  formatter: SQLFormatter,
  options?: FormatSQLOptions,
): string =>
  formatSQL(sql, formatter, {
    ...(options ?? {}),
    mapper: {
      mapPlaceholder: (_, value) => JSONSerializer.serialize(value),
    },
  }).query;
