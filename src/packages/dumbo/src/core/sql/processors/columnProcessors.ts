import { InvalidOperationError, NotRegisteredError } from '../../errors';
import type {
  AutoIncrementSQLColumnToken,
  DefaultSQLColumnToken,
  SQLColumnToken,
  SQLColumnTypeTokens,
} from '../tokens';
import { SQLIdentifier, SQLPlain, SQLToken } from '../tokens';
import { SQLProcessor, type SQLProcessorContext } from './sqlProcessor';

export type DefaultSQLColumnProcessors = {
  [key in keyof SQLColumnTypeTokens]: SQLProcessor<SQLColumnTypeTokens[key]>;
} & { Column: SQLProcessor<SQLColumnToken> };

const inlineDefault = (
  value: unknown,
  { builder, serializer }: SQLProcessorContext,
): void => {
  if (SQLPlain.check(value)) {
    builder.addSQL(value.value);
    return;
  }
  if (SQLToken.check(value)) {
    throw new InvalidOperationError(
      `Unsupported SQL token "${value.sqlTokenType}" as a column default`,
    );
  }
  if (value === null) {
    builder.addSQL('NULL');
    return;
  }
  if (typeof value === 'boolean') {
    builder.addSQL(value ? 'TRUE' : 'FALSE');
    return;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    builder.addSQL(String(value));
    return;
  }

  const serialized =
    typeof value === 'string'
      ? value
      : value instanceof Date
        ? value.toISOString()
        : serializer.serialize(value);
  builder.addSQL(`'${serialized.replaceAll("'", "''")}'`);
};

export const mapDefaultSQLColumnProcessors = (
  mapColumnType: (
    token: DefaultSQLColumnToken,
    context: SQLProcessorContext,
  ) => void,
): DefaultSQLColumnProcessors => ({
  Column: SQLProcessor<SQLColumnToken>({
    canHandle: 'SQL_COLUMN',
    handle: (token, context) => {
      const { builder, mapper, processorsRegistry, serializer } = context;
      builder.addSQL(
        mapper.mapValue(SQLIdentifier.from(token.name), serializer) as string,
      );
      builder.addSQL(' ');

      if (typeof token.type === 'string') {
        builder.addSQL(token.type);
      } else {
        const processor = processorsRegistry.get(token.type.sqlTokenType);
        if (processor === null) {
          throw new NotRegisteredError(
            `No SQL processor registered for column type: ${token.type.sqlTokenType}`,
          );
        }
        processor.handle(token.type, context);
      }

      if (token.primaryKey === true) builder.addSQL(' PRIMARY KEY');
      if (token.notNull === true) builder.addSQL(' NOT NULL');
      if (token.unique === true) builder.addSQL(' UNIQUE');
      if (token.default !== undefined) {
        builder.addSQL(' DEFAULT ');
        inlineDefault(token.default, context);
      }
    },
  }),
  AutoIncrement: SQLProcessor<AutoIncrementSQLColumnToken>({
    canHandle: 'SQL_COLUMN_AUTO_INCREMENT',
    handle: (token, context) => mapColumnType(token, context),
  }),
  BigInteger: SQLProcessor({
    canHandle: 'SQL_COLUMN_BIGINT',
    handle: (token, context) => mapColumnType(token, context),
  }),
  BigSerial: SQLProcessor({
    canHandle: 'SQL_COLUMN_BIGSERIAL',
    handle: (token, context) => mapColumnType(token, context),
  }),
  Boolean: SQLProcessor({
    canHandle: 'SQL_COLUMN_BOOLEAN',
    handle: (token, context) => mapColumnType(token, context),
  }),
  Integer: SQLProcessor({
    canHandle: 'SQL_COLUMN_INTEGER',
    handle: (token, context) => mapColumnType(token, context),
  }),
  JSON: SQLProcessor({
    canHandle: 'SQL_COLUMN_JSON',
    handle: (token, context) => mapColumnType(token, context),
  }),
  JSONB: SQLProcessor({
    canHandle: 'SQL_COLUMN_JSONB',
    handle: (token, context) => mapColumnType(token, context),
  }),
  Serial: SQLProcessor({
    canHandle: 'SQL_COLUMN_SERIAL',
    handle: (token, context) => mapColumnType(token, context),
  }),
  Text: SQLProcessor({
    canHandle: 'SQL_COLUMN_TEXT',
    handle: (token, context) => mapColumnType(token, context),
  }),
  Timestamp: SQLProcessor({
    canHandle: 'SQL_COLUMN_TIMESTAMP',
    handle: (token, context) => mapColumnType(token, context),
  }),
  Timestamptz: SQLProcessor({
    canHandle: 'SQL_COLUMN_TIMESTAMPTZ',
    handle: (token, context) => mapColumnType(token, context),
  }),
  Varchar: SQLProcessor({
    canHandle: 'SQL_COLUMN_VARCHAR',
    handle: (token, context) => mapColumnType(token, context),
  }),
});
