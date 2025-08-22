import { SQL } from './sql';

export type ParametrizedSQL = Readonly<{
  __brand: 'parametrized-sql';
  sqlChunks: ReadonlyArray<string>;
  params: ReadonlyArray<unknown>;
}>;

const ParametrizedSQLBuilder = () => {
  const sqlChunks: string[] = [];
  const params: unknown[] = [];

  return {
    addSQL(str: string): void {
      sqlChunks.push(str);
    },
    addSQLs(str: ReadonlyArray<string>): void {
      sqlChunks.push(...str);
    },
    addParam(value: unknown): void {
      params.push(value);
    },
    addParams(values: ReadonlyArray<unknown>): void {
      params.push(...values);
    },
    build(): ParametrizedSQL {
      return {
        __brand: 'parametrized-sql',
        sqlChunks,
        params,
      };
    },
  };
};

export const ParametrizedSQL = (
  strings: ReadonlyArray<string>,
  values: unknown[],
): ParametrizedSQL => {
  const builder = ParametrizedSQLBuilder();

  for (let i = 0; i < strings.length; i++) {
    builder.addSQL(strings[i]!);
    if (i >= values.length) break;

    const value = values[i];

    if (isParametrizedSQL(value)) {
      builder.addSQLs(value.sqlChunks);
      builder.addParams(value.params);
    } else if (SQL.check.isPlain(value)) {
      builder.addSQL(value.value);
    } else {
      builder.addSQL(param);
      builder.addParam(value);
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

const param = `__P__`;
