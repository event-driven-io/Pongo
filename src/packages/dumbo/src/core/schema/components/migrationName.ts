import { SQLDefaultSchemaNameToken } from '../../sql';

const encodeSegment = (segment: string): string => encodeURIComponent(segment);

export const schemaSegments = (
  databaseSchemaName: string | SQLDefaultSchemaNameToken | undefined,
): ReadonlyArray<string> =>
  databaseSchemaName === undefined ||
  SQLDefaultSchemaNameToken.check(databaseSchemaName)
    ? []
    : [databaseSchemaName];

export const migrationName = (
  type: string,
  kind: string | undefined,
  path: ReadonlyArray<string>,
  operation: string,
): string =>
  [
    type,
    ...(kind === undefined ? [] : [encodeSegment(kind)]),
    ...path.map((segment) => encodeSegment(segment)),
    operation,
  ].join(':');
