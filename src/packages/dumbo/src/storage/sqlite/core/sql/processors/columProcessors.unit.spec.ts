import { describe, it } from 'vitest';
import {
  InvalidOperationError,
  JSONSerializer,
  ParametrizedSQLBuilder,
  SQLProcessorsRegistry,
  SQLValueMapper,
  type AnySQLProcessor,
  type DefaultSQLColumnToken,
  type SQLProcessorContext,
} from '../../../../../core';
import { assertThrowsDumboError } from '../../../../../core/errors/errorAssertions';
import { sqliteColumnProcessors } from './columProcessors';

const processorContext = (): SQLProcessorContext => {
  const mapper = SQLValueMapper();

  return {
    mapper,
    builder: ParametrizedSQLBuilder({
      mapParamPlaceholder: mapper.mapPlaceholder,
    }),
    processorsRegistry: SQLProcessorsRegistry(),
    serializer: JSONSerializer,
  };
};

describe('SQLite column processors', () => {
  it('fails with an InvalidOperationError for a column type it does not know', () => {
    // the exhaustiveness guard is only reachable with a token type outside the union
    const unknownColumnToken = {
      sqlTokenType: 'SQL_COLUMN_UNKNOWN',
    } as unknown as DefaultSQLColumnToken;
    const processor: AnySQLProcessor = sqliteColumnProcessors.Text;

    assertThrowsDumboError(
      () => processor.handle(unknownColumnToken, processorContext()),
      {
        errorType: InvalidOperationError.ErrorType,
        errorCode: 400,
        message: 'Unknown column type: SQL_COLUMN_UNKNOWN',
      },
    );
  });
});
