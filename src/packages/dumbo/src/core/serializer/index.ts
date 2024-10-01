export interface Serializer<
  Payload,
  SerializeOptions = never,
  DeserializeOptions = SerializeOptions,
> {
  serialize<T>(object: T, options?: SerializeOptions): Payload;
  deserialize<T>(payload: Payload, options?: DeserializeOptions): T;
}

export interface ObjectCodec<T, Payload> {
  encode(object: T): Payload;
  decode(payload: Payload): T;
}

export * from './json';
