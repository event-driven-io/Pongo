import { JSONSerializer } from '../../serializer';
import {
  ParametrizedSQLBuilder,
  type ParametrizedSQL,
} from '../parametrizedSQL';
import {
  defaultProcessorsRegistry,
  type SQLProcessorContext,
  type SQLProcessorsReadonlyRegistry,
} from '../processors';
import { SQL } from '../sql';
import { isTokenizedSQL, TokenizedSQL } from '../tokenizedSQL';
import { SQLValueMapper, type MapSQLParamValueOptions } from '../valueMappers';

export type FormatContext = Partial<SQLProcessorContext> &
  Pick<SQLProcessorContext, 'serializer'>;

export interface SQLFormatter {
  format: (sql: SQL | SQL[], context: FormatContext) => ParametrizedSQL;
  describe: (sql: SQL | SQL[], context: FormatContext) => string;
  valueMapper: SQLValueMapper;
}

export type FormatSQLOptions = {
  mapper?: MapSQLParamValueOptions;
  processorsRegistry?: SQLProcessorsReadonlyRegistry;
  serializer?: JSONSerializer;
};

export type SQLFormatterOptions = Partial<Omit<SQLFormatter, 'valueMapper'>> & {
  valueMapper?: MapSQLParamValueOptions;
  processorsRegistry?: SQLProcessorsReadonlyRegistry;
};

export const SQLFormatter = ({
  format,
  describe,
  valueMapper: valueMapperOptions,
  processorsRegistry,
}: SQLFormatterOptions): SQLFormatter => {
  const valueMapper = SQLValueMapper(valueMapperOptions);
  const options = {
    builder: ParametrizedSQLBuilder({
      mapParamPlaceholder: valueMapper.mapPlaceholder,
    }),
    mapper: valueMapper,
    processorsRegistry: processorsRegistry ?? defaultProcessorsRegistry,
  };

  const resultFormatter: SQLFormatter = {
    format:
      format ??
      ((sql: SQL | SQL[], methodOptions) =>
        formatSQL(
          sql,
          resultFormatter,
          methodOptions?.serializer ?? JSONSerializer,
          {
            ...options,
            ...(methodOptions ?? {}),
          },
        )),
    describe:
      describe ??
      ((sql: SQL | SQL[], methodOptions) =>
        describeSQL(
          sql,
          resultFormatter,
          methodOptions?.serializer ?? JSONSerializer,
          {
            ...options,
            ...(methodOptions ?? {}),
          },
        )),
    valueMapper,
  };

  return resultFormatter;
};

declare global {
  var dumboSQLFormatters: Record<string, SQLFormatter>;
}

const dumboSQLFormatters = (globalThis.dumboSQLFormatters =
  globalThis.dumboSQLFormatters ?? ({} as Record<string, SQLFormatter>));

export const registerFormatter = (
  dialect: string,
  formatter: SQLFormatter,
): void => {
  dumboSQLFormatters[dialect] = formatter;
};

export const getFormatter = (dialect: string): SQLFormatter => {
  const formatterKey = dialect;
  if (!dumboSQLFormatters[formatterKey]) {
    throw new Error(`No SQL formatter registered for dialect: ${dialect}`);
  }
  return dumboSQLFormatters[formatterKey];
};

export function formatSQL(
  sql: SQL | SQL[],
  formatter: SQLFormatter,
  serializer: JSONSerializer,
  context?: FormatSQLOptions,
): ParametrizedSQL {
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

  const builder = ParametrizedSQLBuilder({
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
      serializer,
      mapper,
    });
  }

  return builder.build();
}

export const describeSQL = (
  sql: SQL | SQL[],
  formatter: SQLFormatter,
  serializer: JSONSerializer,
  options?: FormatSQLOptions,
): string =>
  formatSQL(sql, formatter, serializer, {
    ...(options ?? {}),
    mapper: {
      mapPlaceholder: (_, value) => serializer.serialize(value),
    },
  }).query;
