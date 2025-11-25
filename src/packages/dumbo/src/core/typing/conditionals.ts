export type IF<Condition extends boolean, Then, Else> = Condition extends true
  ? Then
  : Else;

export type OR<A extends boolean, B extends boolean> = A extends true
  ? true
  : B extends true
    ? true
    : false;

export type AND<A extends boolean, B extends boolean> = A extends true
  ? B extends true
    ? true
    : false
  : false;

export type NOT<A extends boolean> = A extends true ? false : true;

export type ANY<A extends boolean[]> = A extends [infer First, ...infer Rest]
  ? First extends true
    ? true
    : Rest extends boolean[]
      ? ANY<Rest>
      : false
  : false;

export type ALL<A extends boolean[]> = A extends [infer First, ...infer Rest]
  ? First extends true
    ? Rest extends boolean[]
      ? ALL<Rest>
      : true
    : false
  : true;

export type NONE<A extends boolean[]> = A extends [infer First, ...infer Rest]
  ? First extends true
    ? false
    : Rest extends boolean[]
      ? NONE<Rest>
      : true
  : true;

export type EXTENDS<A, B> = A extends B ? true : false;
