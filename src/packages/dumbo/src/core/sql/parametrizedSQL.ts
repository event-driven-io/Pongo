import { SQL } from './sql';

export type ParametrizedSQL = Readonly<{
  __brand: 'parametrized-sql';
  sqlChunks: ReadonlyArray<string>;
  values: ReadonlyArray<unknown>;
}>;

const ParametrizedSQLBuilder = () => {
  const sqlChunks: string[] = [];
  const values: unknown[] = [];

  return {
    addSQL(str: string): void {
      sqlChunks.push(str);
    },
    addSQLs(str: ReadonlyArray<string>): void {
      sqlChunks.push(...str);
    },
    addValue(value: unknown): void {
      values.push(value);
    },
    addValues(vals: ReadonlyArray<unknown>): void {
      values.push(...vals);
    },
    build(): ParametrizedSQL {
      return sqlChunks.length > 0
        ? {
            __brand: 'parametrized-sql',
            sqlChunks,
            values,
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
      builder.addValues(value.values);
    } else if (SQL.check.isPlain(value)) {
      builder.addSQL(value.value);
    } else {
      builder.addSQL(ParametrizedSQL.paramPlaceholder);
      builder.addValue(value);
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
  values: [],
} satisfies ParametrizedSQL;
