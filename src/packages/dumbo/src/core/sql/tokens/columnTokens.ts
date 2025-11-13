import { SQLToken } from './sqlToken';

export type SerialToken = SQLToken<'SQL_COLUMN_SERIAL', never>;
export const SerialToken = SQLToken<SerialToken>(
  'SQL_COLUMN_SERIAL',
  () => undefined!,
);

export type BigSerialToken = SQLToken<'SQL_COLUMN_BIGSERIAL', never>;
export const BigSerialToken = SQLToken<BigSerialToken>(
  'SQL_COLUMN_BIGSERIAL',
  () => undefined!,
);

export type IntegerToken = SQLToken<'SQL_COLUMN_INTEGER', never>;
export const IntegerToken = SQLToken<IntegerToken>(
  'SQL_COLUMN_INTEGER',
  () => undefined!,
);

export type BigIntegerToken = SQLToken<'SQL_COLUMN_BIGINT', never>;
export const BigIntegerToken = SQLToken<BigIntegerToken>(
  'SQL_COLUMN_BIGINT',
  () => undefined!,
);

export type JSONBToken = SQLToken<'SQL_COLUMN_JSONB', never>;
export const JSONBToken = SQLToken<JSONBToken>(
  'SQL_COLUMN_JSONB',
  () => undefined!,
);

export type TimestampToken = SQLToken<'SQL_COLUMN_TIMESTAMP', never>;
export const TimestampToken = SQLToken<TimestampToken>(
  'SQL_COLUMN_TIMESTAMP',
  () => undefined!,
);

export type TimestamptzToken = SQLToken<'SQL_COLUMN_TIMESTAMPTZ', never>;
export const TimestamptzToken = SQLToken<TimestamptzToken>(
  'SQL_COLUMN_TIMESTAMPTZ',
  () => undefined!,
);

export type VarcharToken = SQLToken<'SQL_COLUMN_VARCHAR', number | 'max'>;
export const VarcharToken = SQLToken<VarcharToken>('SQL_COLUMN_VARCHAR');

export type SQLColumnToken<ColumnType = string> = SQLToken<
  'SQL_COLUMN',
  {
    name: string;
    type: ColumnType | SQLToken;
    notNull?: boolean;
    unique?: boolean;
    primaryKey?: boolean;
    default?: ColumnType | SQLToken;
  }
>;

export type AutoIncrementSQLColumnToken = SQLToken<
  'SQL_COLUMN_AUTO_INCREMENT',
  {
    primaryKey: boolean;
    bigint?: boolean;
  }
>;
export const AutoIncrementSQLColumnToken =
  SQLToken<AutoIncrementSQLColumnToken>('SQL_COLUMN_AUTO_INCREMENT');

export const SQLColumnTypeTokens = {
  AutoIncrement: AutoIncrementSQLColumnToken.from,
  BigInteger: BigIntegerToken.from(undefined!),
  BigSerial: BigSerialToken.from(undefined!),
  Integer: IntegerToken.from(undefined!),
  JSONB: JSONBToken.from(undefined!),
  Serial: SerialToken.from(undefined!),
  Timestamp: TimestampToken.from(undefined!),
  Timestamptz: TimestamptzToken.from(undefined!),
  Varchar: VarcharToken.from,
};
export type SQLColumnTypeTokens = typeof SQLColumnTypeTokens;

export type DefaultSQLColumnToken =
  | AutoIncrementSQLColumnToken
  | BigIntegerToken
  | BigSerialToken
  | IntegerToken
  | JSONBToken
  | SerialToken
  | TimestampToken
  | TimestamptzToken
  | VarcharToken;

export const SQLColumnToken = SQLToken<SQLColumnToken>('SQL_COLUMN');
