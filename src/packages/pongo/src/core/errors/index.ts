import { DumboError, type DumboErrorOptions } from '@event-driven-io/dumbo';

export { ConcurrencyError } from '@event-driven-io/dumbo';

const isString = (val: unknown): val is string => typeof val === 'string';

export class PongoError extends DumboError {
  static readonly ErrorCode: number = 500;
  static readonly ErrorType: string = 'PongoError';

  constructor(options?: ConstructorParameters<typeof DumboError>[0]) {
    super(options);
    const given = options && typeof options === 'object' ? options : undefined;
    this.code =
      (given && 'status' in given ? given.code : undefined) ??
      'PNG_ERR_INTERNAL';
    this.errorType =
      (given && 'errorType' in given ? given.errorType : undefined) ??
      PongoError.ErrorType;
    if (!(given && 'message' in given) && !isString(options))
      this.message = `Error with status code '${this.status}' ocurred during Pongo processing`;

    // 👇️ because we are extending a built-in class
    Object.setPrototypeOf(this, PongoError.prototype);
  }
}

export class NotImplementedError extends PongoError {
  static readonly ErrorCode: number = 501;
  static readonly ErrorType: string = 'NotImplementedError';

  constructor(
    options?: string | Omit<DumboErrorOptions, 'status'>,
    innerError?: Error,
  ) {
    const { message, ...rest } = isString(options)
      ? { message: options }
      : (options ?? {});
    super({
      ...rest,
      cause: rest.cause ?? innerError,
      status: NotImplementedError.ErrorCode,
      code: rest.code ?? 'PNG_ERR_NOT_IMPLEMENTED',
      message: message ?? `Method not implemented.`,
    });
    this.errorType = NotImplementedError.ErrorType;

    // 👇️ because we are extending a built-in class
    Object.setPrototypeOf(this, NotImplementedError.prototype);
  }
}
