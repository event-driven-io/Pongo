export const QueryOperators = {
  $eq: '$eq',
  $gt: '$gt',
  $gte: '$gte',
  $lt: '$lt',
  $lte: '$lte',
  $ne: '$ne',
  $in: '$in',
  $nin: '$nin',
  $elemMatch: '$elemMatch',
  $all: '$all',
  $size: '$size',
};

export const OperatorMap = {
  $gt: '>',
  $gte: '>=',
  $lt: '<',
  $lte: '<=',
  $ne: '!=',
};

export const isOperator = (key: string) => key.startsWith('$');

export const hasOperators = (value: Record<string, unknown>) =>
  Object.keys(value).some(isOperator);
