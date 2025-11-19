import { SQLToken } from './sqlToken';

export type JSONValueType =
  | Record<string, unknown>
  | Array<unknown>
  | string
  | number
  | boolean
  | null;

export type JSONValueTypeName =
  | 'value_type:json:object'
  | 'value_type:json:array'
  | 'value_type:json:string'
  | 'value_type:json:number'
  | 'value_type:json:boolean'
  | 'value_type:json:null';

export type JavaScriptValueType =
  | Record<string, unknown>
  | Array<unknown>
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | bigint;

export type JavaScriptValueTypeName =
  | 'value_type:js:object'
  | 'value_type:js:array'
  | 'value_type:js:string'
  | 'value_type:js:number'
  | 'value_type:js:boolean'
  | 'value_type:js:null'
  | 'value_type:js:undefined'
  | 'value_type:js:date'
  | 'value_type:js:bigint';

export type JavaScriptValueTypeToNameMap = {
  [K in JavaScriptValueType as K extends Record<string, unknown>
    ? 'value_type:js:object'
    : K extends Array<unknown>
      ? 'value_type:js:array'
      : K extends string
        ? 'value_type:js:string'
        : K extends number
          ? 'value_type:js:number'
          : K extends boolean
            ? 'value_type:js:boolean'
            : K extends null
              ? 'value_type:js:null'
              : K extends undefined
                ? 'value_type:js:undefined'
                : K extends Date
                  ? 'value_type:js:date'
                  : K extends bigint
                    ? 'value_type:js:bigint'
                    : never]: K;
};

// TODO: Use URNs for sqltoken
export type ColumnTypeToken<
  JSValueTypeName extends JavaScriptValueTypeName = JavaScriptValueTypeName,
  ColumnTypeName extends string = string,
  TProps extends Omit<Record<string, unknown>, 'sqlTokenType'> | undefined =
    | Omit<Record<string, unknown>, 'sqlTokenType'>
    | undefined,
  ValueType = undefined,
> = SQLToken<`SQL_COLUMN_${ColumnTypeName}`, TProps> & {
  __brand: ValueType extends undefined
    ? JavaScriptValueTypeToNameMap[JSValueTypeName]
    : ValueType;
  jsTypeName: JSValueTypeName;
};

export const ColumnTypeToken = <
  SQLTokenType extends AnyColumnTypeToken,
  TInput = keyof Omit<
    SQLTokenType,
    'sqlTokenType' | '__brand' | 'jsTypeName'
  > extends never
    ? void
    : Omit<SQLTokenType, 'sqlTokenType' | '__brand' | 'jsTypeName'>,
>(
  sqlTokenType: SQLTokenType['sqlTokenType'],
  jsTypeName: SQLTokenType['jsTypeName'],
  map?: (
    input: TInput,
  ) => Omit<SQLTokenType, 'sqlTokenType' | '__brand' | 'jsTypeName'>,
) => {
  const factory = (input: TInput): SQLTokenType => {
    let props: Omit<SQLTokenType, 'sqlTokenType' | '__brand' | 'jsTypeName'>;

    if (map !== undefined) {
      props = map(input) as SQLTokenType;
    } else if (input === undefined || input === null) {
      props = {} as Omit<
        SQLTokenType,
        'sqlTokenType' | '__brand' | 'jsTypeName'
      >;
    } else if (typeof input === 'object' && !Array.isArray(input)) {
      // If input is already an object (but not array), spread it
      props = input as Omit<
        SQLTokenType,
        'sqlTokenType' | '__brand' | 'jsTypeName'
      >;
    } else {
      throw new Error(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Cannot create SQLToken of type ${sqlTokenType} with input: ${input}`,
      );
    }

    return {
      sqlTokenType: sqlTokenType,
      [sqlTokenType]: true,
      jsTypeName,
      ...props,
    } as unknown as SQLTokenType;
  };

  const check = (token: unknown): token is SQLTokenType =>
    SQLToken.check(token) && token.sqlTokenType === sqlTokenType;

  return { from: factory, check: check, type: sqlTokenType };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyColumnTypeToken = ColumnTypeToken<any, string, any>;

export type SerialToken = ColumnTypeToken<'value_type:js:number', 'SERIAL'>;
export const SerialToken = ColumnTypeToken<SerialToken>(
  'SQL_COLUMN_SERIAL',
  'value_type:js:number',
);

export type BigSerialToken = ColumnTypeToken<
  'value_type:js:bigint',
  'BIGSERIAL'
>;
export const BigSerialToken = ColumnTypeToken<BigSerialToken>(
  'SQL_COLUMN_BIGSERIAL',
  'value_type:js:bigint',
);

export type IntegerToken = ColumnTypeToken<'value_type:js:number', 'INTEGER'>;
export const IntegerToken = ColumnTypeToken<IntegerToken>(
  'SQL_COLUMN_INTEGER',
  'value_type:js:number',
);

export type BigIntegerToken = ColumnTypeToken<'value_type:js:bigint', 'BIGINT'>;
export const BigIntegerToken = ColumnTypeToken<BigIntegerToken>(
  'SQL_COLUMN_BIGINT',
  'value_type:js:bigint',
);

export type JSONBToken<
  ValueType extends Record<string, unknown> = Record<string, unknown>,
> = ColumnTypeToken<'value_type:js:object', 'JSONB', undefined, ValueType>;

export const JSONBToken = {
  type: 'SQL_COLUMN_JSONB',
  from: <
    ValueType extends Record<string, unknown> = Record<string, unknown>,
  >(): JSONBToken<ValueType> => {
    return {
      sqlTokenType: 'SQL_COLUMN_JSONB',
      ['SQL_COLUMN_JSONB']: true,
    } as unknown as JSONBToken<ValueType>;
  },
  check: <ValueType extends Record<string, unknown> = Record<string, unknown>>(
    token: unknown,
  ): token is JSONBToken<ValueType> =>
    SQLToken.check(token) && token.sqlTokenType === 'SQL_COLUMN_JSONB',
};

export type TimestampToken = ColumnTypeToken<'value_type:js:date', 'TIMESTAMP'>;
export const TimestampToken = ColumnTypeToken<TimestampToken>(
  'SQL_COLUMN_TIMESTAMP',
  'value_type:js:date',
);

export type TimestamptzToken = ColumnTypeToken<
  'value_type:js:date',
  'TIMESTAMPTZ'
>;
export const TimestamptzToken = ColumnTypeToken<TimestamptzToken>(
  'SQL_COLUMN_TIMESTAMPTZ',
  'value_type:js:date',
);

export type VarcharToken = ColumnTypeToken<
  'value_type:js:string',
  'VARCHAR',
  { length: number | 'max' }
>;
export const VarcharToken = ColumnTypeToken<VarcharToken, number | 'max'>(
  'SQL_COLUMN_VARCHAR',
  'value_type:js:string',
  (length?: number | 'max') =>
    ({
      length: length ?? 'max',
      jsTypeName: 'value_type:js:string',
    }) as Omit<VarcharToken, 'sqlTokenType'>,
);

export type NotNullableSQLColumnTokenProps<
  ColumnType extends AnyColumnTypeToken | string = AnyColumnTypeToken | string,
> =
  | {
      name: string;
      type: ColumnType;
      notNull: true;
      unique?: boolean;
      primaryKey?: boolean;
      default?: ColumnType | SQLToken;
    }
  | {
      name: string;
      type: ColumnType;
      notNull?: false;
      unique?: boolean;
      primaryKey: never;
      default?: ColumnType | SQLToken;
    };

export type NullableSQLColumnTokenProps<
  ColumnType extends AnyColumnTypeToken | string = AnyColumnTypeToken | string,
> = {
  name: string;
  type: ColumnType;
  notNull?: false;
  unique?: boolean;
  primaryKey?: false;
  default?: ColumnType | SQLToken;
};

export type SQLColumnToken<
  ColumnType extends AnyColumnTypeToken | string = AnyColumnTypeToken | string,
> = SQLToken<
  'SQL_COLUMN',
  | NotNullableSQLColumnTokenProps<ColumnType>
  | NullableSQLColumnTokenProps<ColumnType>
>;

export type AutoIncrementSQLColumnToken = ColumnTypeToken<
  'value_type:js:bigint',
  'AUTO_INCREMENT',
  {
    primaryKey: boolean;
    bigint?: boolean;
  },
  bigint
>;
export const AutoIncrementSQLColumnToken =
  ColumnTypeToken<AutoIncrementSQLColumnToken>(
    'SQL_COLUMN_AUTO_INCREMENT',
    'value_type:js:bigint',
  );

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
