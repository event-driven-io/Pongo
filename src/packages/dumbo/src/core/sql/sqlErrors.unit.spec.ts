import { describe, it } from 'vitest';
import { assertThrowsDumboError } from '../errors/errorAssertions';
import { JSONSerializer } from '../serializer';
import { getFormatter, SQLFormatter } from './formatters';
import { ParametrizedSQLBuilder } from './parametrizedSQL';
import {
  defaultProcessorsRegistry,
  ExpandSQLInProcessor,
  FormatIdentifierProcessor,
  mapDefaultSQLColumnProcessors,
  MapLiteralProcessor,
  processSQLToken,
  SQLProcessorsRegistry,
} from './processors';
import { SQL } from './sql';
import { SerialToken, SQLTableReference } from './tokens';
import { SQLValueMapper } from './valueMappers';

const columnProcessors = mapDefaultSQLColumnProcessors((token, { builder }) => {
  builder.addSQL(token.sqlTokenType);
});

describe('SQL typed errors', () => {
  describe('formatters', () => {
    it('throws NotRegisteredError for an unknown dialect', () => {
      assertThrowsDumboError(() => getFormatter('not-registered-dialect'), {
        errorType: 'NotRegisteredError',
        errorCode: 500,
        message:
          'No SQL formatter registered for dialect: not-registered-dialect',
      });
    });

    it('throws InvalidOperationError for string-based SQL', () => {
      const formatter = SQLFormatter({});

      assertThrowsDumboError(
        () =>
          formatter.format('SELECT 1' as unknown as SQL, {
            serializer: JSONSerializer,
          }),
        {
          errorType: 'InvalidOperationError',
          errorCode: 400,
          message: 'Expected TokenizedSQL, got string-based SQL',
        },
      );
    });

    it('throws NotRegisteredError for an unregistered token type', () => {
      const formatter = SQLFormatter({
        processorsRegistry: SQLProcessorsRegistry(),
      });

      assertThrowsDumboError(
        () =>
          formatter.format(SQL`SELECT ${SQL.identifier('users')}`, {
            serializer: JSONSerializer,
          }),
        {
          errorType: 'NotRegisteredError',
          errorCode: 500,
          message: 'No SQL processor registered for token type: SQL_IDENTIFIER',
        },
      );
    });
  });

  describe('column processors', () => {
    it('throws InvalidOperationError for a token used as a column default', () => {
      const formatter = SQLFormatter({
        processorsRegistry: SQLProcessorsRegistry({
          from: defaultProcessorsRegistry,
        }).register(columnProcessors),
      });

      const column = SQL.column({
        name: 'created_at',
        type: 'TIMESTAMP',
        default: SQL.identifier('now'),
      });

      assertThrowsDumboError(
        () =>
          formatter.format(SQL`CREATE TABLE users (${column})`, {
            serializer: JSONSerializer,
          }),
        {
          errorType: 'InvalidOperationError',
          errorCode: 400,
          message: 'Unsupported SQL token "SQL_IDENTIFIER" as a column default',
        },
      );
    });

    it('throws NotRegisteredError for an unregistered column type', () => {
      const formatter = SQLFormatter({
        processorsRegistry: SQLProcessorsRegistry({
          from: defaultProcessorsRegistry,
        }).register(columnProcessors.Column),
      });

      const column = SQL.column({
        name: 'name',
        type: SQL.column.type.Text,
      });

      assertThrowsDumboError(
        () =>
          formatter.format(SQL`CREATE TABLE users (${column})`, {
            serializer: JSONSerializer,
          }),
        {
          errorType: 'NotRegisteredError',
          errorCode: 500,
          message:
            'No SQL processor registered for column type: SQL_COLUMN_TEXT',
        },
      );
    });
  });

  describe('default processors', () => {
    it('throws DataError for an empty array', () => {
      const formatter = SQLFormatter({});

      assertThrowsDumboError(
        () =>
          formatter.format(SQL`SELECT ${SQL.array([])}`, {
            serializer: JSONSerializer,
          }),
        {
          errorType: 'DataError',
          errorCode: 400,
          message:
            "Empty arrays are not supported. If you're using it with SELECT IN statement Use SQL.in(column, array) helper instead.",
        },
      );
    });

    it('throws NotRegisteredError when IN cannot expand the array', () => {
      const formatter = SQLFormatter({
        processorsRegistry: SQLProcessorsRegistry().register(
          FormatIdentifierProcessor,
          MapLiteralProcessor,
          ExpandSQLInProcessor,
        ),
      });

      assertThrowsDumboError(
        () =>
          formatter.format(
            SQL`SELECT * FROM users WHERE ${SQL.in('id', [1, 2])}`,
            { serializer: JSONSerializer },
          ),
        {
          errorType: 'NotRegisteredError',
          errorCode: 500,
          message:
            'No sql processor registered for an array. Cannot expand IN statement',
        },
      );
    });

    it('throws NotRegisteredError when processing an unregistered token', () => {
      const mapper = SQLValueMapper();

      assertThrowsDumboError(
        () =>
          processSQLToken(SQL.identifier('users'), {
            builder: ParametrizedSQLBuilder({
              mapParamPlaceholder: mapper.mapPlaceholder,
            }),
            mapper,
            processorsRegistry: SQLProcessorsRegistry(),
            serializer: JSONSerializer,
          }),
        {
          errorType: 'NotRegisteredError',
          errorCode: 500,
          message: 'No SQL processor registered for SQL_IDENTIFIER',
        },
      );
    });
  });

  describe('value mappers', () => {
    it('throws DataError for a null identifier', () => {
      const formatter = SQLFormatter({});

      assertThrowsDumboError(
        () =>
          formatter.format(
            SQL`SELECT ${SQL.identifier(null as unknown as string)}`,
            { serializer: JSONSerializer },
          ),
        {
          errorType: 'DataError',
          errorCode: 400,
          message: 'SQL identifier cannot be null or undefined',
        },
      );
    });
  });

  describe('tokens', () => {
    it('throws DataError for a non-object SQL token input', () => {
      assertThrowsDumboError(() => SQLTableReference.from('oops' as never), {
        errorType: 'DataError',
        errorCode: 400,
        message:
          'Cannot create SQLToken of type SQL_TABLE_REFERENCE with input: oops',
      });
    });

    it('throws DataError for a non-object column type token input', () => {
      assertThrowsDumboError(() => SerialToken.from('oops' as never), {
        errorType: 'DataError',
        errorCode: 400,
        message:
          'Cannot create SQLToken of type SQL_COLUMN_SERIAL with input: oops',
      });
    });
  });
});
