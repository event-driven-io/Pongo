import { SQL } from '../../../../core';

const pathSegment = (segment: string): string =>
  /^[A-Za-z_][A-Za-z0-9_$]*$/.test(segment)
    ? segment
    : `"${segment.replace(/"/g, '""')}"`;

const path = (path: string | readonly string[]) =>
  SQL.literal(
    typeof path === 'string'
      ? `$.${path}`
      : `$.${path.map(pathSegment).join('.')}`,
  );

export const SQLiteJSON = {
  path,
} as const;
