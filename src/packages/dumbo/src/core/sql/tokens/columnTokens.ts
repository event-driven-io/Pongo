import { SQLToken } from './sqlToken';

// TODO: Use URNs for sqltoken
export type ColumnTypeToken<
  ValueType,
  ColumnTypeName extends string = string,
  TProps extends Omit<Record<string, unknown>, 'sqlTokenType'> | undefined =
    | Omit<Record<string, unknown>, 'sqlTokenType'>
    | undefined,
> = SQLToken<`SQL_COLUMN_${ColumnTypeName}`, TProps> & { __brand: ValueType };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyColumnTypeToken = ColumnTypeToken<any, string, any>;

export type SerialToken = ColumnTypeToken<number, 'SERIAL'>;
export const SerialToken = SQLToken<SerialToken>('SQL_COLUMN_SERIAL');

export type BigSerialToken = ColumnTypeToken<bigint, 'BIGSERIAL'>;
export const BigSerialToken = SQLToken<BigSerialToken>('SQL_COLUMN_BIGSERIAL');

export type IntegerToken = ColumnTypeToken<number, 'INTEGER'>;
export const IntegerToken = SQLToken<IntegerToken>('SQL_COLUMN_INTEGER');

export type BigIntegerToken = ColumnTypeToken<bigint, 'BIGINT'>;
export const BigIntegerToken = SQLToken<BigIntegerToken>('SQL_COLUMN_BIGINT');

export type JSONBToken<
  ValueType extends Record<string, unknown> = Record<string, unknown>,
> = ColumnTypeToken<ValueType, 'JSONB'>;

export const JSONBToken = {
  type: 'SQL_COLUMN_JSONB',
  from: <
    ValueType extends Record<string, unknown> = Record<string, unknown>,
  >(): JSONBToken<ValueType> => {
    return {
      sqlTokenType: 'SQL_COLUMN_JSONB',
      ['SQL_COLUMN_JSONB']: true,
    } as unknown as JSONBToken;
  },
  check: (token: unknown): token is JSONBToken =>
    SQLToken.check(token) && token.sqlTokenType === 'SQL_COLUMN_JSONB',
};

export type TimestampToken = ColumnTypeToken<Date, 'TIMESTAMP'>;
export const TimestampToken = SQLToken<TimestampToken>('SQL_COLUMN_TIMESTAMP');

export type TimestamptzToken = ColumnTypeToken<Date, 'TIMESTAMPTZ'>;
export const TimestamptzToken = SQLToken<TimestamptzToken>(
  'SQL_COLUMN_TIMESTAMPTZ',
);

export type VarcharToken = ColumnTypeToken<
  string,
  'VARCHAR',
  { length: number | 'max' }
>;
export const VarcharToken = SQLToken<VarcharToken, number | 'max'>(
  'SQL_COLUMN_VARCHAR',
  (length?: number | 'max') => ({
    length: length ?? 'max',
  }),
);

export type SQLColumnToken<
  ColumnType extends AnyColumnTypeToken | string = AnyColumnTypeToken | string,
> = SQLToken<
  'SQL_COLUMN',
  {
    name: string;
    type: ColumnType;
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
  JSONB: JSONBToken.from,
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
