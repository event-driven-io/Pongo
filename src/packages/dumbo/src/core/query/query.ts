export interface QueryResultRow {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [column: string]: any;
}

export type QueryResult<Result extends QueryResultRow = QueryResultRow> = {
  rowCount: number | null;
  rows: Result[];
};
