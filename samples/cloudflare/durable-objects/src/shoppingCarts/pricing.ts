import { ValidationError } from '@event-driven-io/emmett';

const unitPrices: Readonly<Record<string, number>> = {
  'product-1': 1000,
  'product-2': 2500,
};

export const getUnitPrice = (productId: string): Promise<number> => {
  const unitPrice = unitPrices[productId];
  if (unitPrice === undefined) throw new ValidationError('Unknown product');
  return Promise.resolve(unitPrice);
};
