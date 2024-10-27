export const deepEquals = <T>(left: T, right: T): boolean => {
  if (isEquatable(left)) {
    return left.equals(right);
  }

  if (Array.isArray(left)) {
    return (
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((val, index) => deepEquals(val, right[index]))
    );
  }

  if (
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    left === null ||
    right === null
  ) {
    return left === right;
  }

  if (Array.isArray(right)) return false;

  const keys1 = Object.keys(left);
  const keys2 = Object.keys(right);

  if (
    keys1.length !== keys2.length ||
    !keys1.every((key) => keys2.includes(key))
  )
    return false;

  for (const key in left) {
    if (left[key] instanceof Function && right[key] instanceof Function)
      continue;

    const isEqual = deepEquals(left[key], right[key]);
    if (!isEqual) {
      return false;
    }
  }

  return true;
};

export type Equatable<T> = { equals: (right: T) => boolean } & T;

export const isEquatable = <T>(left: T): left is Equatable<T> => {
  return (
    left &&
    typeof left === 'object' &&
    'equals' in left &&
    typeof left['equals'] === 'function'
  );
};
