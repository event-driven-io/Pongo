const string = (value: string): string => `'${value.replace(/'/g, "''")}'`;

export const SQLLiteral = {
  string,
} as const;
