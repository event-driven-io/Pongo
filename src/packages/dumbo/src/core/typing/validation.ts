export type TypeValidationResult<
  Valid extends boolean = boolean,
  Error = never,
> = Valid extends true ? { valid: true } : { valid: false; error: Error };

export type TypeValidationError<Error> = TypeValidationResult<false, Error>;

export type TypeValidationSuccess = TypeValidationResult<true>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTypeValidationError = TypeValidationError<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTypeValidationResult = TypeValidationResult<boolean, any>;

export type AnyTypeValidationFailed<Results = AnyTypeValidationResult[]> =
  Results extends readonly [infer First, ...infer Rest]
    ? First extends { valid: false }
      ? true
      : Rest extends AnyTypeValidationResult[]
        ? AnyTypeValidationFailed<Rest>
        : false
    : false;

export type ExtractTypeValidationErrors<T> = T extends {
  valid: false;
  error: infer E;
}
  ? E
  : never;

export type UnwrapTypeValidationError<T> =
  T extends TypeValidationResult<false, infer E> ? E : T;

export type UnwrapTypeValidationErrors<
  Results extends readonly AnyTypeValidationResult[],
> = Results extends readonly [infer First, ...infer Rest]
  ? First extends TypeValidationResult<false, infer E>
    ? Rest extends readonly AnyTypeValidationResult[]
      ? [E, ...UnwrapTypeValidationErrors<Rest>]
      : [E]
    : Rest extends readonly AnyTypeValidationResult[]
      ? UnwrapTypeValidationErrors<Rest>
      : []
  : [];

export type CompareTypes<LocalType extends string, RefType extends string> =
  Uppercase<LocalType> extends Uppercase<RefType> ? true : false;

export type FailOnFirstTypeValidationError<
  Validations extends readonly AnyTypeValidationResult[],
> = Validations extends readonly [infer First, ...infer Rest]
  ? First extends AnyTypeValidationError
    ? First
    : Rest extends readonly AnyTypeValidationResult[]
      ? FailOnFirstTypeValidationError<Rest>
      : First
  : null;

export type MergeTypeValidationResultIfError<
  Errors extends readonly AnyTypeValidationError[],
  Result extends AnyTypeValidationResult,
> = Result extends AnyTypeValidationError
  ? Errors extends []
    ? [Result]
    : [...Errors, Result]
  : Errors;
