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
  const { sqlTokenType, value } = token;
  switch (sqlTokenType) {
    case 'SQL_COLUMN_AUTO_INCREMENT':
      columnSQL = `INTEGER ${value.primaryKey ? 'PRIMARY KEY' : ''} AUTOINCREMENT`;
      break;
    case 'SQL_COLUMN_BIGINT':
      columnSQL = 'INTEGER';
      break;
    case 'SQL_COLUMN_SERIAL':
      columnSQL = 'INTEGER';
      break;
    case 'SQL_COLUMN_INTEGER':
      columnSQL = 'INTEGER';
      break;
    case 'SQL_COLUMN_JSONB':
      columnSQL = 'BLOB';
      break;
    case 'SQL_COLUMN_BIGSERIAL':
      columnSQL = 'INTEGER';
      break;
    case 'SQL_COLUMN_TIMESTAMP':
      columnSQL = 'DATETIME';
      break;
    case 'SQL_COLUMN_TIMESTAMPTZ':
      columnSQL = 'DATETIME';
      break;
    case 'SQL_COLUMN_VARCHAR':
      columnSQL = `VARCHAR ${Number.isNaN(value) ? '' : `(${value})`}`;
      break;
    default: {
      const exhaustiveCheck: never = sqlTokenType;
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`Unknown column type: ${exhaustiveCheck}`);
    }
  }
  builder.addSQL(columnSQL);
};

export const sqliteColumnProcessors: DefaultSQLColumnProcessors =
  mapDefaultSQLColumnProcessors(mapColumnType);
