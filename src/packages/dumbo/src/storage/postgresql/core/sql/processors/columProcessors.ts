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
  let columnSQL: string;
  const { sqlTokenType } = token;
  switch (sqlTokenType) {
    case 'SQL_COLUMN_AUTO_INCREMENT':
      columnSQL = `${token.bigint ? 'BIGSERIAL' : 'SERIAL'} ${token.primaryKey ? 'PRIMARY KEY' : ''}`;
      break;
    case 'SQL_COLUMN_BIGINT':
      columnSQL = 'BIGINT';
      break;
    case 'SQL_COLUMN_SERIAL':
      columnSQL = 'SERIAL';
      break;
    case 'SQL_COLUMN_INTEGER':
      columnSQL = 'INTEGER';
      break;
    case 'SQL_COLUMN_JSONB':
      columnSQL = 'JSONB';
      break;
    case 'SQL_COLUMN_BIGSERIAL':
      columnSQL = 'BIGSERIAL';
      break;
    case 'SQL_COLUMN_TIMESTAMP':
      columnSQL = 'TIMESTAMP';
      break;
    case 'SQL_COLUMN_TIMESTAMPTZ':
      columnSQL = 'TIMESTAMPTZ';
      break;
    case 'SQL_COLUMN_VARCHAR':
      columnSQL = `VARCHAR ${Number.isNaN(token.length) ? '' : `(${token.length})`}`;
      break;
    default: {
      const exhaustiveCheck: never = sqlTokenType;
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`Unknown column type: ${exhaustiveCheck}`);
    }
  }
  builder.addSQL(columnSQL);
};

export const postgreSQLColumnProcessors: DefaultSQLColumnProcessors =
  mapDefaultSQLColumnProcessors(mapColumnType);
