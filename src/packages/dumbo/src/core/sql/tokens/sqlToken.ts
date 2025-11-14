export type SQLToken<
  TSymbol extends string = string,
  TProps extends Omit<Record<string, unknown>, 'sqlTokenType'> | undefined =
    | Omit<Record<string, unknown>, 'sqlTokenType'>
    | undefined,
> = {
  sqlTokenType: TSymbol;
} & (TProps extends undefined ? void : Omit<TProps, 'sqlTokenType'>);

export type ExtractSQLTokenType<T> = T extends (...args: never[]) => infer R
  ? R extends SQLToken
    ? R
    : never
  : T extends SQLToken
    ? T
    : never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySQLToken = SQLToken<string, any>;

export const SQLToken = <
  SQLTokenType extends AnySQLToken,
  TInput = keyof Omit<SQLTokenType, 'sqlTokenType'> extends never
    ? void
    : Omit<SQLTokenType, 'sqlTokenType'>,
>(
  sqlTokenType: SQLTokenType['sqlTokenType'],
  map?: (input: TInput) => Omit<SQLTokenType, 'sqlTokenType'>,
) => {
  const factory = (input: TInput): SQLTokenType => {
    let props: Omit<SQLTokenType, 'sqlTokenType'>;

    if (map !== undefined) {
      props = map(input);
    } else if (input === undefined || input === null) {
      props = {} as Omit<SQLTokenType, 'sqlTokenType'>;
    } else if (typeof input === 'object' && !Array.isArray(input)) {
      // If input is already an object (but not array), spread it
      props = input as Omit<SQLTokenType, 'sqlTokenType'>;
    } else {
      throw new Error(
        `Cannot create SQLToken of type ${sqlTokenType} with input: ${input}`,
      );
    }

    return {
      sqlTokenType: sqlTokenType,
      [sqlTokenType]: true,
      ...props,
    } as unknown as SQLTokenType;
  };

  const check = (token: unknown): token is SQLTokenType =>
    SQLToken.check(token) && token.sqlTokenType === sqlTokenType;

  return { from: factory, check: check, type: sqlTokenType };
};

SQLToken.check = <SQLTokenType extends AnySQLToken>(
  token: unknown,
): token is SQLTokenType =>
  token !== null && typeof token === 'object' && 'sqlTokenType' in token;

export type SQLIdentifier = SQLToken<'SQL_IDENTIFIER', { value: string }>;
export const SQLIdentifier = SQLToken<SQLIdentifier, string>(
  'SQL_IDENTIFIER',
  (value) => ({
    value,
  }),
);

export type SQLPlain = SQLToken<'SQL_RAW', { value: string }>;
export const SQLPlain = SQLToken<SQLPlain, string>('SQL_RAW', (value) => ({
  value,
}));

export type SQLLiteral = SQLToken<'SQL_LITERAL', { value: unknown }>;
export const SQLLiteral = SQLToken<SQLLiteral, unknown>(
  'SQL_LITERAL',
  (value) => ({
    value,
  }),
);

export type SQLArray = SQLToken<'SQL_ARRAY', { value: unknown[] }>;
export const SQLArray = SQLToken<SQLArray, unknown[]>('SQL_ARRAY', (value) => ({
  value,
}));

export type SQLIn = SQLToken<
  'SQL_IN',
  { column: SQLIdentifier; values: SQLArray }
>;

export const SQLIn = SQLToken<SQLIn, { column: string; values: unknown[] }>(
  'SQL_IN',
  ({ column, values }) => ({
    column: SQLIdentifier.from(column),
    values: SQLArray.from(values),
  }),
);

export type SQLDefaultTokens = SQLIdentifier | SQLPlain | SQLLiteral | SQLArray;
export type SQLDefaultTokensTypes = SQLDefaultTokens['sqlTokenType'];
