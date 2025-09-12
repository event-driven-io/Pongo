import type {
  BigIntegerToken,
  DefaultSQLColumnToken,
  SQLToken,
} from '../tokens';
import { SQLColumnTokens } from '../tokens';
import { SQLProcessor, type SQLProcessorContext } from './sqlProcessor';

type ExtractTokenType<T> = T extends (...args: never[]) => infer R
  ? R extends SQLToken
    ? R
    : never
  : T extends SQLToken
    ? T
    : never;

export type DefaultSQLColumnProcessors = {
  [key in keyof SQLColumnTokens]: SQLProcessor<
    ExtractTokenType<(typeof SQLColumnTokens)[key]>
  >;
};

export const mapDefaultSQLColumnProcessors = (
  mapColumnType: (
    token: DefaultSQLColumnToken,
    context: SQLProcessorContext,
  ) => void,
): DefaultSQLColumnProcessors => ({
  AutoIncrement: SQLProcessor({
    canHandle: 'SQL_COLUMN_AUTO_INCREMENT',
    handle: (token, context) => {
      mapColumnType(token, context);
    },
  }),
  BigInteger: SQLProcessor({
    canHandle: 'SQL_COLUMN_BIGINT',
    handle: (token: BigIntegerToken, context: SQLProcessorContext) =>
      mapColumnType(token, context),
  }),
  BigSerial: SQLProcessor({
    canHandle: 'SQL_COLUMN_BIGSERIAL',
    handle: (token, context) => mapColumnType(token, context),
  }),
  Serial: SQLProcessor({
    canHandle: 'SQL_COLUMN_SERIAL',
    handle: (token, context) => mapColumnType(token, context),
  }),
  Integer: SQLProcessor({
    canHandle: 'SQL_COLUMN_INTEGER',
    handle: (token, context) => mapColumnType(token, context),
  }),
  JSONB: SQLProcessor({
    canHandle: 'SQL_COLUMN_JSONB',
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
