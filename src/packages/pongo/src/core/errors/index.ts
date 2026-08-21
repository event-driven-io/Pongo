import { DumboError } from '@event-driven-io/dumbo';

export { ConcurrencyError } from '@event-driven-io/dumbo';

const isNumber = (val: unknown): val is number =>
  typeof val === 'number' && val === val;

const isString = (val: unknown): val is string => typeof val === 'string';

export class PongoError extends DumboError {
  static readonly ErrorCode: number = 500;
  static readonly ErrorType: string = 'PongoError';

  constructor(
    options?:
      | {
          errorCode: number;
          errorType?: string;
          message?: string | undefined;
          innerError?: Error | undefined;
        }
      | string
      | number,
  ) {
    const errorCode =
      options && typeof options === 'object' && 'errorCode' in options
        ? options.errorCode
        : isNumber(options)
          ? options
          : PongoError.ErrorCode;
    const errorType =
      options && typeof options === 'object' && 'errorType' in options
        ? (options.errorType ?? PongoError.ErrorType)
        : PongoError.ErrorType;
    const message =
      options && typeof options === 'object' && 'message' in options
        ? options.message
        : isString(options)
          ? options
          : `Error with status code '${errorCode}' ocurred during Pongo processing`;
    const innerError =
      options && typeof options === 'object' && 'innerError' in options
        ? options.innerError
        : undefined;

    super({ errorCode, errorType, message, innerError });

    // 👇️ because we are extending a built-in class
    Object.setPrototypeOf(this, PongoError.prototype);
  }
}

export class NotImplementedError extends PongoError {
  static readonly ErrorCode: number = 501;
  static readonly ErrorType: string = 'NotImplementedError';

  constructor(message?: string, innerError?: Error) {
    super({
      errorCode: NotImplementedError.ErrorCode,
      errorType: NotImplementedError.ErrorType,
      message: message ?? `Method not implemented.`,
      innerError,
    });

    // 👇️ because we are extending a built-in class
    Object.setPrototypeOf(this, NotImplementedError.prototype);
  }
}
