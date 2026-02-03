import {
  SQLArray,
  SQLIn,
  SQLProcessor,
  type SQLProcessorContext,
} from '../../../../../core';

export const PostgreSQLArrayProcessor: SQLProcessor<SQLArray> = SQLProcessor({
  canHandle: 'SQL_ARRAY',
  handle: (
    token: SQLArray,
    { builder, mapper, serializer }: SQLProcessorContext,
  ) => {
    if (token.value.length === 0) {
      throw new Error(
        "Empty arrays are not supported. If you're using it with SELECT IN statement Use SQL.in(column, array) helper instead.",
      );
    }
    const mappedValue = mapper.mapValue(token.value, serializer) as unknown[];

    if (token.mode === 'params') {
      builder.addParams(mappedValue);
    } else {
      builder.addParam(mappedValue);
    }
  },
});

export const PostgreSQLExpandSQLInProcessor: SQLProcessor<SQLIn> = SQLProcessor(
  {
    canHandle: 'SQL_IN',
    handle: (token: SQLIn, context: SQLProcessorContext) => {
      const { builder, mapper, processorsRegistry } = context;
      const { values: inValues, column, mode } = token;

      if (inValues.value.length === 0) {
        builder.addParam(mapper.mapValue(false, context.serializer));
        return;
      }

      builder.addSQL(
        mapper.mapValue(column.value, context.serializer) as string,
      );
      const arrayProcessor = processorsRegistry.get(SQLArray.type);

      if (!arrayProcessor) {
        throw new Error(
          'No sql processor registered for an array. Cannot expand IN statement',
        );
      }

      if (mode === 'params') {
        builder.addSQL(` IN (`);
        const expandedArray = { ...inValues, mode: 'params' as const };
        arrayProcessor.handle(expandedArray, context);
        builder.addSQL(`)`);
      } else {
        builder.addSQL(` = ANY (`);
        arrayProcessor.handle(inValues, context);
        builder.addSQL(`)`);
      }
    },
  },
);
