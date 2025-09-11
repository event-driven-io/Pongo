export type SQLToken<
  TSymbol extends string = string,
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-constraint, @typescript-eslint/no-explicit-any
  TProps extends any = any,
> = {
  sqlTokenType: TSymbol;
  value: TProps;
};

export const SQLToken = <
  SQLTokenType extends SQLToken,
  TValue = SQLTokenType['value'],
>(
  sqlTokenType: SQLTokenType['sqlTokenType'],
  map?: (value: TValue) => SQLTokenType['value'],
) => {
  const factory = (props: TValue): SQLTokenType => {
    props =
      map === undefined
        ? (props as unknown as SQLTokenType['value'])
        : map(props);
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

SQLToken.check = (token: unknown): token is SQLToken =>
  token !== null && typeof token === 'object' && 'sqlTokenType' in token;

export type SQLIdentifier = SQLToken<'SQL_IDENTIFIER', string>;
export const SQLIdentifier = SQLToken<SQLIdentifier>('SQL_IDENTIFIER');

export type SQLPlain = SQLToken<'SQL_RAW', string>;
export const SQLPlain = SQLToken<SQLPlain>('SQL_RAW');

export type SQLLiteral = SQLToken<'SQL_LITERAL', unknown>;
export const SQLLiteral = SQLToken<SQLLiteral>('SQL_LITERAL');

export type SQLArray = SQLToken<'SQL_ARRAY', unknown[]>;
export const SQLArray = SQLToken<SQLArray>('SQL_ARRAY');

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
