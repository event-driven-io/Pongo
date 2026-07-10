import type { JSONSerializer } from '../../serializer';

const document = (document: unknown, serializer: JSONSerializer): string =>
  serializer.serialize(document);

const value = (jsonValue: unknown, serializer: JSONSerializer): string =>
  serializer.serialize(jsonValue);

const arrayContaining = (
  jsonValue: unknown,
  serializer: JSONSerializer,
): string => value([jsonValue], serializer);

export const JSONParam = {
  arrayContaining,
  document,
  value,
} as const;
