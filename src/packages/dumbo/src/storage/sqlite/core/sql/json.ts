import { SQL } from '../../../../core';

const path = (path: string) => SQL.stringLiteral(`$.${path}`);

export const SQLiteJSON = {
  path,
} as const;
