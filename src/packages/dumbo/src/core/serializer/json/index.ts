import type { ObjectCodec, Serializer } from '..';

interface JSONSerializer<
  SerializeOptions = JSONSerializeOptions,
  DeserializeOptions = JSONDeserializeOptions,
> extends Serializer<string, SerializeOptions, DeserializeOptions> {
  serialize<T>(object: T, options?: SerializeOptions): string;
  deserialize<T>(payload: string, options?: DeserializeOptions): T;
}

type JSONSerializerOptions = {
  disableBigIntSerialization?: boolean;
};

type JSONSerializeOptions = {
  replacer?: JSONReplacer;
} & JSONSerializerOptions;

type JSONDeserializeOptions = {
  reviver?: JSONReviver;
} & JSONSerializerOptions;

interface JSONObjectCodec<
  T,
  SerializeOptions = JSONSerializeOptions,
  DeserializeOptions = JSONDeserializeOptions,
> extends ObjectCodec<T, string> {
  encode(object: T, options?: SerializeOptions): string;
  decode(payload: string, options?: DeserializeOptions): T;
}

type JSONObjectCodecOptions<
  SerializeOptions = JSONSerializeOptions,
  DeserializeOptions = JSONDeserializeOptions,
> =
  | { serializer?: JSONSerializer<SerializeOptions, DeserializeOptions> }
  | { serializerOptions?: JSONSerializerOptions };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JSONReplacer = (this: any, key: string, value: any) => any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JSONReviver = (this: any, key: string, value: any) => any;

const bigIntReplacer: JSONReplacer = (_key, value) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return typeof value === 'bigint' ? value.toString() : value;
};

const bigIntReviver: JSONReviver = (_key, value) => {
  if (typeof value === 'string' && /^[+-]?\d+n?$/.test(value)) {
    return BigInt(value);
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return value;
};

const composeJSONReplacers =
  (...replacers: JSONReplacer[]): JSONReplacer =>
  (key, value) =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    replacers.reduce((accValue, replacer) => replacer(key, accValue), value);

const composeJSONRevivers =
  (...revivers: JSONReviver[]): JSONReviver =>
  (key, value) =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    revivers.reduce((accValue, reviver) => reviver(key, accValue), value);

const JSONReplacer = (opts?: JSONSerializeOptions) =>
  opts?.disableBigIntSerialization == true
    ? opts.replacer
      ? opts.replacer
      : undefined
    : opts?.replacer
      ? composeJSONReplacers(JSONReplacers.bigInt, opts.replacer)
      : JSONReplacers.bigInt;

const JSONReviver = (opts?: JSONDeserializeOptions) =>
  opts?.disableBigIntSerialization == true
    ? opts.reviver
      ? opts.reviver
      : undefined
    : opts?.reviver
      ? composeJSONRevivers(JSONRevivers.bigInt, opts.reviver)
      : JSONRevivers.bigInt;

const JSONReplacers = {
  bigInt: bigIntReplacer,
};

const JSONRevivers = {
  bigInt: bigIntReviver,
};

const jsonSerializer = (options?: JSONSerializerOptions): JSONSerializer => {
  const defaultReplacer = JSONReplacer(options);
  const defaultReviver = JSONReviver(options);

  return {
    serialize: <T>(object: T, options?: JSONSerializeOptions): string =>
      JSON.stringify(object, options ? JSONReplacer(options) : defaultReplacer),
    deserialize: <T>(payload: string, options?: JSONDeserializeOptions): T =>
      JSON.parse(payload, options ? JSONReviver(options) : defaultReviver) as T,
  };
};

const JSONSerializer = jsonSerializer({ disableBigIntSerialization: false });

const RawJSONSerializer = jsonSerializer({ disableBigIntSerialization: true });

const JSONObjectCodec = <
  T,
  SerializeOptions = JSONSerializeOptions,
  DeserializeOptions = JSONDeserializeOptions,
>(
  options: JSONObjectCodecOptions<SerializeOptions, DeserializeOptions>,
): JSONObjectCodec<T, SerializeOptions, DeserializeOptions> => {
  const serializer =
    'serializer' in options
      ? options.serializer
      : jsonSerializer(
          'serializerOptions' in options
            ? options.serializerOptions
            : undefined,
        );

  return {
    decode: <T>(payload: string, options?: DeserializeOptions) =>
      options
        ? serializer.deserialize<T>(payload, options)
        : serializer.deserialize(payload),
    encode: <T>(object: T, options?: SerializeOptions) =>
      options
        ? serializer.serialize<T>(object, options)
        : serializer.serialize(object),
  };
};

export {
  composeJSONReplacers,
  composeJSONRevivers,
  JSONReplacer,
  JSONReplacers,
  JSONReviver,
  JSONRevivers,
  JSONSerializer,
  jsonSerializer,
  RawJSONSerializer,
  type JSONObjectCodec,
  type JSONObjectCodecOptions,
};
