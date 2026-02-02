import type { SerializationCodec, Serializer } from '..';

interface JSONSerializer<
  SerializeOptions extends JSONSerializeOptions = JSONSerializeOptions,
  DeserializeOptions extends JSONDeserializeOptions = JSONDeserializeOptions,
> extends Serializer<string, SerializeOptions, DeserializeOptions> {
  serialize<T>(object: T, options?: SerializeOptions): string;
  deserialize<T>(payload: string, options?: DeserializeOptions): T;
}

type JSONSerializerOptions = {
  parseDates?: boolean;
  parseBigInts?: boolean;
};

type JSONSerializeOptions = {
  replacer?: JSONReplacer;
} & JSONSerializerOptions;

type JSONDeserializeOptions = {
  reviver?: JSONReviver;
} & JSONSerializerOptions;

interface JSONCodec<
  T,
  SerializeOptions extends JSONSerializeOptions = JSONSerializeOptions,
  DeserializeOptions extends JSONDeserializeOptions = JSONDeserializeOptions,
> extends SerializationCodec<T, string, SerializeOptions, DeserializeOptions> {
  encode(object: T, options?: SerializeOptions): string;
  decode(payload: string, options?: DeserializeOptions): T;
}

type JSONSerializationOptions<
  SerializeOptions extends JSONSerializeOptions = JSONSerializeOptions,
  DeserializeOptions extends JSONDeserializeOptions = JSONDeserializeOptions,
> =
  | {
      serializer?: JSONSerializer<SerializeOptions, DeserializeOptions>;
      serializerOptions?: never;
    }
  | {
      serializer?: never;
      serializerOptions?: JSONSerializerOptions;
    };

type JSONCodecOptions<
  T,
  Payload = T,
  SerializeOptions extends JSONSerializeOptions = JSONSerializeOptions,
  DeserializeOptions extends JSONDeserializeOptions = JSONDeserializeOptions,
> = JSONSerializationOptions<SerializeOptions, DeserializeOptions> & {
  upcast?: (document: Payload) => T;
  downcast?: (document: T) => Payload;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JSONReplacer = (this: any, key: string, value: any) => any;

type JSONReviver = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this: any,
  key: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any,
  context: JSONReviverContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => any;

// See more in: https://tc39.es/proposal-json-parse-with-source/
export type JSONReviverContext = {
  source: string;
};

const bigIntReplacer: JSONReplacer = (_key, value) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return typeof value === 'bigint' ? value.toString() : value;
};

const dateReplacer: JSONReplacer = (_key, value) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return value instanceof Date ? value.toISOString() : value;
};

const isFirstLetterNumeric = (str: string): boolean => {
  const c = str.charCodeAt(0);
  return c >= 48 && c <= 57;
};

const isFirstLetterNumericOrMinus = (str: string): boolean => {
  const c = str.charCodeAt(0);
  return (c >= 48 && c <= 57) || c === 45;
};

const bigIntReviver: JSONReviver = (_key, value, context) => {
  if (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    !Number.isSafeInteger(value)
  ) {
    try {
      return BigInt(context?.source ?? value.toString());
    } catch {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return value;
    }
  }
  if (typeof value === 'string' && value.length > 15) {
    if (isFirstLetterNumericOrMinus(value)) {
      const num = Number(value);
      if (Number.isFinite(num) && !Number.isSafeInteger(num)) {
        try {
          return BigInt(value);
        } catch {
          // not a valid bigint string
        }
      }
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return value;
};

const dateReviver: JSONReviver = (_key, value) => {
  if (
    typeof value === 'string' &&
    value.length === 24 &&
    isFirstLetterNumeric(value) &&
    value[10] === 'T' &&
    value[23] === 'Z'
  ) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return value;
};

const composeJSONReplacers = (
  ...replacers: (JSONReplacer | undefined)[]
): JSONReplacer | undefined => {
  const filteredReplacers = replacers.filter((r) => r !== undefined);

  if (filteredReplacers.length === 0) return undefined;

  return (key, value) =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    filteredReplacers.reduce(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      (accValue, replacer) => replacer(key, accValue),
      value,
    );
};

const composeJSONRevivers = (
  ...revivers: (JSONReviver | undefined)[]
): JSONReviver | undefined => {
  const filteredRevivers = revivers.filter((r) => r !== undefined);

  if (filteredRevivers.length === 0) return undefined;

  return (key, value, context) =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    filteredRevivers.reduce(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      (accValue, reviver) => reviver(key, accValue, context),
      value,
    );
};

const JSONReplacer = (opts?: JSONSerializeOptions) =>
  composeJSONReplacers(
    opts?.parseBigInts === true ? JSONReplacers.bigInt : undefined,
    opts?.parseDates === true ? JSONReplacers.date : undefined,
    opts?.replacer,
  );

const JSONReviver = (opts?: JSONDeserializeOptions) =>
  composeJSONRevivers(
    opts?.parseBigInts === true ? JSONRevivers.bigInt : undefined,
    opts?.parseDates === true ? JSONRevivers.date : undefined,
    opts?.reviver,
  );

const JSONReplacers = {
  bigInt: bigIntReplacer,
  date: dateReplacer,
};

const JSONRevivers = {
  bigInt: bigIntReviver,
  date: dateReviver,
};

type ClassicJsonReviver =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (this: any, key: string, value: any) => any;

const jsonSerializer = (options?: JSONSerializerOptions): JSONSerializer => {
  const defaultReplacer = JSONReplacer(options);
  const defaultReviver = JSONReviver(options);

  return {
    serialize: <T>(
      object: T,
      serializerOptions?: JSONSerializeOptions,
    ): string =>
      JSON.stringify(
        object,
        serializerOptions ? JSONReplacer(serializerOptions) : defaultReplacer,
      ),
    deserialize: <T>(
      payload: string,
      deserializerOptions?: JSONDeserializeOptions,
    ): T =>
      JSON.parse(
        payload,
        (deserializerOptions
          ? JSONReviver(deserializerOptions)
          : defaultReviver) as ClassicJsonReviver,
      ) as T,
  };
};

const JSONSerializer = jsonSerializer({ parseBigInts: true });

const RawJSONSerializer = jsonSerializer();

const JSONCodec = <
  T,
  Payload = T,
  SerializeOptions extends JSONSerializeOptions = JSONSerializeOptions,
  DeserializeOptions extends JSONDeserializeOptions = JSONDeserializeOptions,
>(
  options: JSONCodecOptions<T, Payload, SerializeOptions, DeserializeOptions>,
): JSONCodec<T, SerializeOptions, DeserializeOptions> => {
  const serializer =
    'serializer' in options
      ? options.serializer
      : jsonSerializer(
          'serializerOptions' in options
            ? options.serializerOptions
            : undefined,
        );

  const upcast = options.upcast ?? ((doc: Payload) => doc as unknown as T);
  const downcast = options.downcast ?? ((doc: T) => doc as unknown as Payload);

  return {
    decode: (payload: string, decodeOptions?: DeserializeOptions) => {
      const deserialized = decodeOptions
        ? serializer.deserialize<Payload>(payload, decodeOptions)
        : serializer.deserialize<Payload>(payload);
      return upcast(deserialized);
    },
    encode: (object: T, encodeOptions?: SerializeOptions) => {
      const downcasted = downcast(object);
      return encodeOptions
        ? serializer.serialize(downcasted, encodeOptions)
        : serializer.serialize(downcasted);
    },
  };
};

export {
  composeJSONReplacers,
  composeJSONRevivers,
  JSONCodec,
  JSONReplacer,
  JSONReplacers,
  JSONReviver,
  JSONRevivers,
  JSONSerializer,
  jsonSerializer,
  RawJSONSerializer,
  type JSONCodecOptions,
  type JSONDeserializeOptions,
  type JSONSerializationOptions,
  type JSONSerializeOptions,
};
