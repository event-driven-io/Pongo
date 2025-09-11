export interface ParametrizedSQL {
  query: string;
  params: unknown[];
}

export interface ParametrizedSQLBuilder {
  addSQL: (str: string) => ParametrizedSQLBuilder;
  addParam(value: unknown): ParametrizedSQLBuilder;
  addParams(values: unknown[]): ParametrizedSQLBuilder;
  build: () => ParametrizedSQL;
}

export const ParametrizedSQLBuilder = ({
  mapParamPlaceholder,
}: {
  mapParamPlaceholder: (index: number, value: unknown) => string;
}): ParametrizedSQLBuilder => {
  const sql: string[] = [];
  const params: unknown[] = [];

  return {
    addSQL(str: string): ParametrizedSQLBuilder {
      sql.push(str);
      return this;
    },
    addParam(value: unknown): ParametrizedSQLBuilder {
      sql.push(mapParamPlaceholder(params.length, value));
      params.push(value);
      return this;
    },
    addParams(values: unknown[]): ParametrizedSQLBuilder {
      const placeholders = values.map((value, i) =>
        mapParamPlaceholder(params.length + i, value),
      );
      this.addSQL(`(${placeholders.join(', ')})`);
      params.push(...values);
      return this;
    },
    build(): ParametrizedSQL {
      return {
        query: sql.join(''),
        params,
      };
    },
  };
};
