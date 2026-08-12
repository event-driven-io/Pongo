export type IndexTarget =
  | Readonly<{
      targetType: 'jsonPath';
      columnName: string;
      path: string | readonly string[];
    }>
  | Readonly<{ targetType: 'jsonDocument'; columnName: string }>;

export const jsonPathIndexTarget = (
  columnName: string,
  path: string | readonly string[],
): IndexTarget =>
  Object.freeze({ targetType: 'jsonPath' as const, columnName, path });

export const jsonDocumentIndexTarget = (columnName: string): IndexTarget =>
  Object.freeze({ targetType: 'jsonDocument' as const, columnName });
