import { EmmettError } from '@event-driven-io/emmett';
import { ProductItems } from './shoppingCart';
import type { PricedProductItem, ShoppingCart } from './shoppingCart';

export type AddProductItemToShoppingCart = Readonly<{
  type: 'AddProductItemToShoppingCart';
  data: Readonly<{
    clientId: string;
    shoppingCartId: string;
    productItem: PricedProductItem;
    now: Date;
  }>;
}>;

export type RemoveProductItemFromShoppingCart = Readonly<{
  type: 'RemoveProductItemFromShoppingCart';
  data: Readonly<{
    productId: string;
    quantity: number;
  }>;
}>;

export type ConfirmShoppingCart = Readonly<{
  type: 'ConfirmShoppingCart';
  data: Readonly<{ now: Date }>;
}>;

export type CancelShoppingCart = Readonly<{
  type: 'CancelShoppingCart';
  data: Readonly<{ now: Date }>;
}>;

export type ShoppingCartCommand =
  | AddProductItemToShoppingCart
  | RemoveProductItemFromShoppingCart
  | ConfirmShoppingCart
  | CancelShoppingCart;

export const addProductItem = (
  command: AddProductItemToShoppingCart['data'],
  state: ShoppingCart | null,
): ShoppingCart => {
  if (state !== null && state.status !== 'Opened')
    throw new EmmettError({
      errorCode: 409,
      message: 'Shopping Cart already closed',
    });

  const shoppingCart: ShoppingCart = state ?? {
    _id: command.shoppingCartId,
    clientId: command.clientId,
    productItems: [],
    productItemsCount: 0,
    totalAmount: 0,
    status: 'Opened',
    openedAt: command.now,
  };

  const currentProductItem = ProductItems.find(
    shoppingCart.productItems,
    command.productItem.productId,
  );
  const unitPrice =
    currentProductItem?.unitPrice ?? command.productItem.unitPrice;

  return {
    ...shoppingCart,
    productItems: ProductItems.withUpdatedQuantity(
      shoppingCart.productItems,
      command.productItem,
      command.productItem.quantity,
    ),
    productItemsCount:
      shoppingCart.productItemsCount + command.productItem.quantity,
    totalAmount:
      shoppingCart.totalAmount + unitPrice * command.productItem.quantity,
  };
};

export const removeProductItem = (
  command: RemoveProductItemFromShoppingCart['data'],
  state: ShoppingCart | null,
): ShoppingCart => {
  if (state?.status !== 'Opened')
    throw new EmmettError({
      errorCode: 409,
      message: 'Shopping Cart is not opened',
    });

  const currentProductItem = ProductItems.find(
    state.productItems,
    command.productId,
  );
  if (!currentProductItem || currentProductItem.quantity < command.quantity)
    throw new EmmettError({
      errorCode: 409,
      message: 'Not enough products in shopping cart',
    });

  return {
    ...state,
    productItems: ProductItems.withUpdatedQuantity(
      state.productItems,
      currentProductItem,
      -command.quantity,
    ),
    productItemsCount: state.productItemsCount - command.quantity,
    totalAmount:
      state.totalAmount - currentProductItem.unitPrice * command.quantity,
  };
};

export const confirm = (
  command: ConfirmShoppingCart['data'],
  state: ShoppingCart | null,
): ShoppingCart => {
  if (state?.status === 'Confirmed') return state;
  if (state?.status !== 'Opened')
    throw new EmmettError({
      errorCode: 409,
      message: 'Shopping Cart is not opened',
    });
  if (state.productItemsCount === 0)
    throw new EmmettError({
      errorCode: 409,
      message: 'Shopping Cart is empty',
    });

  return {
    ...state,
    status: 'Confirmed',
    confirmedAt: command.now,
  };
};

export const cancel = (
  command: CancelShoppingCart['data'],
  state: ShoppingCart | null,
): ShoppingCart => {
  if (state?.status === 'Cancelled') return state;
  if (state?.status !== 'Opened')
    throw new EmmettError({
      errorCode: 409,
      message: 'Shopping Cart is not opened',
    });

  return { ...state, status: 'Cancelled', cancelledAt: command.now };
};
