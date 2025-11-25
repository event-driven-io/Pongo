import type { AnyTypeValidationError, TypeValidationSuccess } from '../typing';

export type Expect<T extends true> = T;
export type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
export type IsError<T> = T extends AnyTypeValidationError ? true : false;
export type IsOK<T> = T extends TypeValidationSuccess ? true : false;
