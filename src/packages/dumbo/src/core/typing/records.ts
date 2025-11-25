export type KeysOfString<T extends Record<string, unknown>> = Extract<
  keyof T,
  string
>;
