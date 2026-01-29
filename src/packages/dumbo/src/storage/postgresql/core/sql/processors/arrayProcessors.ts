import {
  SQLArray,
  SQLIn,
  SQLProcessor,
  type SQLProcessorContext,
} from '../../../../../core';

export const PostgreSQLArrayProcessor: SQLProcessor<SQLArray> = SQLProcessor({
  canHandle: 'SQL_ARRAY',
  handle: (token: SQLArray, { builder, mapper }: SQLProcessorContext) => {
    if (token.value.length === 0) {
      throw new Error(
        "Empty arrays are not supported. If you're using it with SELECT IN statement Use SQL.in(column, array) helper instead.",
      );
    }
    builder.addParam(mapper.mapValue(token.value) as unknown[]);
  },
});

export const PostgreSQLExpandSQLInProcessor: SQLProcessor<SQLIn> = SQLProcessor(
  {
    canHandle: 'SQL_IN',
    handle: (token: SQLIn, context: SQLProcessorContext) => {
      const { builder, mapper, processorsRegistry } = context;
      const { values: inValues, column } = token;

      if (inValues.value.length === 0) {
        builder.addParam(mapper.mapValue(false));
        return;
      }

      // NOTE: this may not always be faster than IN: https://pganalyze.com/blog/5mins-postgres-performance-in-vs-any
      builder.addSQL(mapper.mapValue(column.value) as string);
      builder.addSQL(` = ANY (`);

      const arrayProcessor = processorsRegistry.get(SQLArray.type);

      if (!arrayProcessor) {
        throw new Error(
          'No sql processor registered for an array. Cannot expand IN statement',
        );
      }

      arrayProcessor.handle(inValues, { builder, mapper, processorsRegistry });
      builder.addSQL(`)`);
    },
  },
);
