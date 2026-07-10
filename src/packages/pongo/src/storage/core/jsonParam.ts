import type { JSONSerializer } from '@event-driven-io/dumbo';

const serialize = (serializer: JSONSerializer, value: unknown): string =>
  serializer.serialize(value);

const serializeArray = (serializer: JSONSerializer, value: unknown): string =>
  serialize(serializer, [value]);

export const JsonParam = {
  serialize,
  serializeArray,
} as const;
