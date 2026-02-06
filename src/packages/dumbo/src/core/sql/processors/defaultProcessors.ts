import type { SQLIdentifier, SQLIn, SQLLiteral } from '../tokens';
import { SQLArray } from '../tokens';
import { SQLProcessor, type SQLProcessorContext } from './sqlProcessor';

export const ExpandArrayProcessor: SQLProcessor<SQLArray> = SQLProcessor({
  canHandle: 'SQL_ARRAY',
  handle: (
    token: SQLArray,
    { builder, serializer, mapper }: SQLProcessorContext,
  ) => {
    if (token.value.length === 0) {
      throw new Error(
        "Empty arrays are not supported. If you're using it with SELECT IN statement Use SQL.in(column, array) helper instead.",
      );
    }
    builder.addParams(mapper.mapValue(token.value, serializer) as unknown[]);
  },
});

export const ExpandSQLInProcessor: SQLProcessor<SQLIn> = SQLProcessor({
  canHandle: 'SQL_IN',
  handle: (token: SQLIn, context: SQLProcessorContext) => {
    const { builder, mapper, processorsRegistry, serializer } = context;
    const { values: inValues, column } = token;

    if (inValues.value.length === 0) {
      builder.addParam(mapper.mapValue(false, serializer));
      return;
    }

    builder.addSQL(mapper.mapValue(column.value, serializer) as string);
    builder.addSQL(` IN (`);

    const arrayProcessor = processorsRegistry.get(SQLArray.type);

    if (!arrayProcessor) {
      throw new Error(
        'No sql processor registered for an array. Cannot expand IN statement',
      );
    }

    arrayProcessor.handle(inValues, {
      builder,
      mapper,
      processorsRegistry,
      serializer: serializer,
    });
    builder.addSQL(`)`);
  },
});

export const FormatIdentifierProcessor: SQLProcessor<SQLIdentifier> =
  SQLProcessor({
    canHandle: 'SQL_IDENTIFIER',
    handle: (
      token: SQLIdentifier,
      { builder, mapper, serializer }: SQLProcessorContext,
    ) => {
      // TODO: use MapIdentifier from mapper
      builder.addSQL(mapper.mapValue(token, serializer) as string);
    },
  });

export const MapLiteralProcessor: SQLProcessor<SQLLiteral> = SQLProcessor({
  canHandle: 'SQL_LITERAL',
  handle: (
    token: SQLLiteral,
    { builder, mapper, serializer }: SQLProcessorContext,
  ) => builder.addParam(mapper.mapValue(token.value, serializer)),
});
