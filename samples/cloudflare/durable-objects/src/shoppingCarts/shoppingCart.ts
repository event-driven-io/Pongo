export type ProductItem = Readonly<{
  productId: string;
  quantity: number;
}>;

export type PricedProductItem = Readonly<
  ProductItem & {
    unitPrice: number;
  }
>;

export type ProductItems = ReadonlyArray<PricedProductItem>;

const findProductItem = (
  productItems: ProductItems,
  productId: string,
): PricedProductItem | undefined =>
  productItems.find((productItem) => productItem.productId === productId);

export const ProductItems = {
  find: findProductItem,

  withUpdatedQuantity(
    productItems: ProductItems,
    productItem: PricedProductItem,
    quantityChange: number,
  ): ProductItems {
    const currentProductItem = findProductItem(
      productItems,
      productItem.productId,
    );

    if (!currentProductItem)
      return [...productItems, { ...productItem, quantity: quantityChange }];

    const quantity = currentProductItem.quantity + quantityChange;
    if (quantity === 0)
      return productItems.filter(
        ({ productId }) => productId !== productItem.productId,
      );

    return productItems.map((current) => {
      if (current.productId !== productItem.productId) return current;

      return { ...current, quantity };
    });
  },
};

export type ShoppingCart = Readonly<{
  _id: string;
  clientId: string;
  productItems: ProductItems;
  productItemsCount: number;
  totalAmount: number;
  status: 'Opened' | 'Confirmed' | 'Cancelled';
  openedAt: Date;
  confirmedAt?: Date;
  cancelledAt?: Date;
}>;
