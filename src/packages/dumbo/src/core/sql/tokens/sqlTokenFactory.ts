import { DataError } from '../../errors';
import type { AnySQLToken } from './sqlToken';

/* @__NO_SIDE_EFFECTS__ */
export const sqlToken = <
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
      throw new DataError(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
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
    isSQLToken(token) && token.sqlTokenType === sqlTokenType;

  return { from: factory, check: check, type: sqlTokenType };
};

export const isSQLToken = <SQLTokenType extends AnySQLToken>(
  token: unknown,
): token is SQLTokenType =>
  token !== null && typeof token === 'object' && 'sqlTokenType' in token;
