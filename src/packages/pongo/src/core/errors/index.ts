export const isNumber = (val: unknown): val is number =>
  typeof val === 'number' && val === val;

export const isString = (val: unknown): val is string =>
  typeof val === 'string';

export class PongoError extends Error {
  public errorCode: number;

  constructor(
    options?: { errorCode: number; message?: string } | string | number,
  ) {
    const errorCode =
      options && typeof options === 'object' && 'errorCode' in options
        ? options.errorCode
        : isNumber(options)
          ? options
          : 500;
    const message =
      options && typeof options === 'object' && 'message' in options
        ? options.message
        : isString(options)
          ? options
          : `Error with status code '${errorCode}' ocurred during Pongo processing`;

    super(message);
    this.errorCode = errorCode;

    // 👇️ because we are extending a built-in class
    Object.setPrototypeOf(this, PongoError.prototype);
  }
}

export class ConcurrencyError extends PongoError {
  constructor(message?: string) {
    super({
      errorCode: 412,
      message: message ?? `Expected document state does not match current one!`,
    });

    // 👇️ because we are extending a built-in class
    Object.setPrototypeOf(this, ConcurrencyError.prototype);
  }
}
