import {
  mapDefaultSQLColumnProcessors,
  type DefaultSQLColumnProcessors,
  type DefaultSQLColumnToken,
  type SQLProcessorContext,
} from '../../../../../core';

const mapColumnType = (
  token: DefaultSQLColumnToken,
  { builder }: SQLProcessorContext,
): void => {
  let columnType: string;
  const { sqlTokenType, value } = token;
  switch (sqlTokenType) {
    case 'SQL_COLUMN_BIGINT':
      columnType = 'BIGINT';
      break;
    case 'SQL_COLUMN_SERIAL':
      columnType = 'SERIAL';
      break;
    case 'SQL_COLUMN_INTEGER':
      columnType = 'INTEGER';
      break;
    case 'SQL_COLUMN_JSONB':
      columnType = 'JSONB';
      break;
    case 'SQL_COLUMN_BIGSERIAL':
      columnType = 'BIGSERIAL';
      break;
    case 'SQL_COLUMN_TIMESTAMP':
      columnType = 'TIMESTAMP';
      break;
    case 'SQL_COLUMN_TIMESTAMPTZ':
      columnType = 'TIMESTAMPTZ';
      break;
    case 'SQL_COLUMN_VARCHAR':
      columnType = `VARCHAR ${Number.isNaN(value) ? '' : `(${value})`}`;
      break;
    default: {
      const exhaustiveCheck: never = sqlTokenType;
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`Unknown column type: ${exhaustiveCheck}`);
    }
  }
  builder.addSQL(columnType);
};

export const postgreSQLColumnProcessors: DefaultSQLColumnProcessors =
  mapDefaultSQLColumnProcessors(mapColumnType);
