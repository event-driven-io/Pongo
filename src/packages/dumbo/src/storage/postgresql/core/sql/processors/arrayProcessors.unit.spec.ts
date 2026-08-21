import { describe, it } from 'vitest';
import {
  DataError,
  JSONSerializer,
  NotRegisteredError,
  SQL,
  SQLProcessorsRegistry,
} from '../../../../../core';
import { assertThrowsDumboError } from '../../../../../core/errors/errorAssertions';
import { pgFormatter } from '../formatter';
import { PostgreSQLExpandSQLInProcessor } from './arrayProcessors';

describe('PostgreSQL array processors', () => {
  it('fails with a DataError when an empty array is inlined', () => {
    const emptyIds: number[] = [];

    assertThrowsDumboError(
      () =>
        pgFormatter.format(
          SQL`SELECT * FROM users WHERE id = ANY(${emptyIds})`,
          { serializer: JSONSerializer },
        ),
      {
        errorType: DataError.ErrorType,
        errorCode: 400,
        message:
          "Empty arrays are not supported. If you're using it with SELECT IN statement Use SQL.in(column, array) helper instead.",
      },
    );
  });

  it('fails with a NotRegisteredError when expanding IN without an array processor', () => {
    const processorsRegistry = SQLProcessorsRegistry().register(
      PostgreSQLExpandSQLInProcessor,
    );

    assertThrowsDumboError(
      () =>
        pgFormatter.format(
          SQL`SELECT * FROM users WHERE ${SQL.in('_id', [1, 2, 3])}`,
          { serializer: JSONSerializer, processorsRegistry },
        ),
      {
        errorType: NotRegisteredError.ErrorType,
        errorCode: 500,
        message:
          'No sql processor registered for an array. Cannot expand IN statement',
      },
    );
  });
});
