import { SQLLiteral, SQLPlain, SQLToken } from './tokens';

export type ParametrizedSQL = Readonly<{
  __brand: 'parametrized-sql';
  sqlChunks: ReadonlyArray<string>;
  sqlTokens: ReadonlyArray<SQLToken>;
}>;

const ParametrizedSQLBuilder = () => {
  const sqlChunks: string[] = [];
  const sqlTokens: SQLToken[] = [];

  return {
    addSQL(str: string): void {
      sqlChunks.push(str);
    },
    addSQLs(str: ReadonlyArray<string>): void {
      sqlChunks.push(...str);
    },
    addToken(value: SQLToken): void {
      sqlTokens.push(value);
    },
    addTokens(vals: ReadonlyArray<SQLToken>): void {
      sqlTokens.push(...vals);
    },
    build(): ParametrizedSQL {
      return sqlChunks.length > 0
        ? {
            __brand: 'parametrized-sql',
            sqlChunks,
            sqlTokens,
          }
        : ParametrizedSQL.empty;
    },
  };
};

export const ParametrizedSQL = (
  strings: ReadonlyArray<string>,
  values: unknown[],
): ParametrizedSQL => {
  const builder = ParametrizedSQLBuilder();

  for (let i = 0; i < strings.length; i++) {
    if (strings[i] !== '') builder.addSQL(strings[i]!);

    if (i >= values.length) break;

    const value = values[i];

    if (isParametrizedSQL(value)) {
      builder.addSQLs(value.sqlChunks);
      builder.addTokens(value.sqlTokens);
    } else if (SQLPlain.check(value)) {
      builder.addSQL(value.value);
    } else {
      builder.addSQL(ParametrizedSQL.paramPlaceholder);
      builder.addToken(SQLToken.check(value) ? value : SQLLiteral({ value }));
    }
  }

  return builder.build();
};

export const isParametrizedSQL = (value: unknown): value is ParametrizedSQL => {
  return (
    value !== null &&
    typeof value === 'object' &&
    '__brand' in value &&
    value.__brand === 'parametrized-sql'
  );
};

ParametrizedSQL.paramPlaceholder = `__P__`;

ParametrizedSQL.empty = {
  __brand: 'parametrized-sql',
  sqlChunks: [''],
  sqlTokens: [],
} satisfies ParametrizedSQL;
