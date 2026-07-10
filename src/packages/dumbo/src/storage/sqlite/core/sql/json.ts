import { SQL } from '../../../../core';

const path = (path: string) => SQL.literal(`$.${path}`);

export const SQLiteJSON = {
  path,
} as const;
