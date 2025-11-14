import { SQLToken, type AnySQLToken } from './sqlToken';

export type SerialToken = SQLToken<'SQL_COLUMN_SERIAL'>;
export const SerialToken = SQLToken<SerialToken>('SQL_COLUMN_SERIAL');

export type BigSerialToken = SQLToken<'SQL_COLUMN_BIGSERIAL'>;
export const BigSerialToken = SQLToken<BigSerialToken>('SQL_COLUMN_BIGSERIAL');

export type IntegerToken = SQLToken<'SQL_COLUMN_INTEGER'>;
export const IntegerToken = SQLToken<IntegerToken>('SQL_COLUMN_INTEGER');

export type BigIntegerToken = SQLToken<'SQL_COLUMN_BIGINT'>;
export const BigIntegerToken = SQLToken<BigIntegerToken>('SQL_COLUMN_BIGINT');

export type JSONBToken = SQLToken<'SQL_COLUMN_JSONB'>;
export const JSONBToken = SQLToken<JSONBToken>('SQL_COLUMN_JSONB');

export type TimestampToken = SQLToken<'SQL_COLUMN_TIMESTAMP'>;
export const TimestampToken = SQLToken<TimestampToken>('SQL_COLUMN_TIMESTAMP');

export type TimestamptzToken = SQLToken<'SQL_COLUMN_TIMESTAMPTZ'>;
export const TimestamptzToken = SQLToken<TimestamptzToken>(
  'SQL_COLUMN_TIMESTAMPTZ',
);

export type VarcharToken = SQLToken<
  'SQL_COLUMN_VARCHAR',
  { length: number | 'max' }
>;
export const VarcharToken = SQLToken<VarcharToken, number | 'max'>(
  'SQL_COLUMN_VARCHAR',
  (length) => ({
    length,
  }),
);

export type SQLColumnToken<ColumnType = string> = SQLToken<
  'SQL_COLUMN',
  {
    name: string;
    type: ColumnType | AnySQLToken;
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
  AutoIncrement: AutoIncrementSQLColumnToken,
  BigInteger: BigIntegerToken,
  BigSerial: BigSerialToken,
  Integer: IntegerToken,
  JSONB: JSONBToken,
  Serial: SerialToken,
  Timestamp: TimestampToken,
  Timestamptz: TimestamptzToken,
  Varchar: VarcharToken,
};

export type SQLColumnTypeTokens = {
  AutoIncrement: AutoIncrementSQLColumnToken;
  BigInteger: BigIntegerToken;
  BigSerial: BigSerialToken;
  Integer: IntegerToken;
  JSONB: JSONBToken;
  Serial: SerialToken;
  Timestamp: TimestampToken;
  Timestamptz: TimestamptzToken;
  Varchar: VarcharToken;
};

export const SQLColumnTypeTokensFactory = {
  AutoIncrement: AutoIncrementSQLColumnToken.from,
  BigInteger: BigIntegerToken.from(),
  BigSerial: BigSerialToken.from(),
  Integer: IntegerToken.from(),
  JSONB: JSONBToken.from(),
  Serial: SerialToken.from(),
  Timestamp: TimestampToken.from(),
  Timestamptz: TimestamptzToken.from(),
  Varchar: VarcharToken.from,
};

export type DefaultSQLColumnToken =
  | AutoIncrementSQLColumnToken
  | SerialToken
  | BigSerialToken
  | IntegerToken
  | JSONBToken
  | BigIntegerToken
  | TimestampToken
  | TimestamptzToken
  | VarcharToken;

export const SQLColumnToken = SQLToken<SQLColumnToken>('SQL_COLUMN');
