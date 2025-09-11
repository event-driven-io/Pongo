export interface ParametrizedQuery {
  query: string;
  params: unknown[];
}

export type ParametrizedQueryBuilder = {
  addSQL: (str: string) => ParametrizedQueryBuilder;
  addParam(value: unknown): ParametrizedQueryBuilder;
  addParams(values: unknown[]): ParametrizedQueryBuilder;
  build: () => ParametrizedQuery;
};

export const ParametrizedQueryBuilder = ({
  mapParamPlaceholder,
}: {
  mapParamPlaceholder: (index: number, value: unknown) => string;
}): ParametrizedQueryBuilder => {
  const sql: string[] = [];
  const params: unknown[] = [];

  return {
    addSQL(str: string): ParametrizedQueryBuilder {
      sql.push(str);
      return this;
    },
    addParam(value: unknown): ParametrizedQueryBuilder {
      sql.push(mapParamPlaceholder(params.length, value));
      params.push(value);
      return this;
    },
    addParams(values: unknown[]): ParametrizedQueryBuilder {
      const placeholders = values.map((value, i) =>
        mapParamPlaceholder(params.length + i, value),
      );
      this.addSQL(`(${placeholders.join(', ')})`);
      params.push(...values);
      return this;
    },
    build(): ParametrizedQuery {
      return {
        query: sql.join(''),
        params,
      };
    },
  };
};
