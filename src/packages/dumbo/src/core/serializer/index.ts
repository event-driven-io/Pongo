export interface Serializer<
  Payload,
  SerializeOptions extends Record<string, unknown> = Record<string, unknown>,
  DeserializeOptions extends Record<string, unknown> = SerializeOptions,
> {
  serialize<T>(object: T, options?: SerializeOptions): Payload;
  deserialize<T>(payload: Payload, options?: DeserializeOptions): T;
}

export interface SerializationCodec<
  T,
  Payload,
  SerializeOptions extends Record<string, unknown> = Record<string, unknown>,
  DeserializeOptions extends Record<string, unknown> = SerializeOptions,
> {
  encode(object: T, options?: SerializeOptions): Payload;
  decode(payload: Payload, options?: DeserializeOptions): T;
}

export * from './json';
