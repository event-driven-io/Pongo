import {
  ConcurrencyError,
  DumboError,
  UniqueConstraintError,
} from '@event-driven-io/dumbo';
import {
  assertNotEmptyString,
  assertUnsignedBigInt,
  asyncRetry,
  ValidationError,
} from '@event-driven-io/emmett';
import {
  Created,
  getETagValueFromIfMatch,
  OK,
  toWeakETag,
  type WebApiSetup,
} from '@event-driven-io/emmett-honojs';
import { validator } from 'hono/validator';
import type { ShoppingCart } from './shoppingCart';
import type { ShoppingCartDurableObject } from './shoppingCartDurableObject';

type ShoppingCartApiDependencies = {
  shoppingCarts: DurableObjectNamespace<ShoppingCartDurableObject>;
  getUnitPrice: (productId: string) => Promise<number>;
  getCurrentTime: () => Date;
};

export const shoppingCartApi =
  ({
    shoppingCarts,
    getUnitPrice,
    getCurrentTime,
  }: ShoppingCartApiDependencies): WebApiSetup =>
  (router) => {
    router.post(
      '/clients/:clientId/shopping-carts/current/product-items',
      productItemBody,
      async (context) => {
        const { clientId } = context.req.param();
        const { productId, quantity } = context.req.valid('json');
        const unitPrice = await getUnitPrice(productId);

        const shoppingCart = shoppingCarts.getByName(clientId);
        const { cart, created } = await asyncRetry(
          () =>
            shoppingCart.addProductItemToCurrent({
              clientId,
              productItem: { productId, quantity, unitPrice },
              now: getCurrentTime(),
            }),
          {
            retries: 3,
            minTimeout: 100,
            factor: 1.5,
            shouldRetryError: isConflict,
          },
        );

        const { _version, ...body } = cart;
        const eTag = toWeakETag(_version);

        if (created)
          return Created({ context, url: shoppingCartUrl(cart), body, eTag });

        return OK({ context, body, eTag });
      },
    );

    router.get('/clients/:clientId/shopping-carts/current', async (context) => {
      const { clientId } = context.req.param();

      const shoppingCart = shoppingCarts.getByName(clientId);
      const cart = await shoppingCart.getCurrent({ clientId });
      const { _version, ...body } = cart;

      return OK({ context, body, eTag: toWeakETag(_version) });
    });

    router.get(
      '/clients/:clientId/shopping-carts/:shoppingCartId',
      async (context) => {
        const { clientId, shoppingCartId } = context.req.param();

        const shoppingCart = shoppingCarts.getByName(clientId);
        const cart = await shoppingCart.getById({ shoppingCartId });
        const { _version, ...body } = cart;

        return OK({ context, body, eTag: toWeakETag(_version) });
      },
    );

    router.post(
      '/clients/:clientId/shopping-carts/:shoppingCartId/product-items',
      productItemBody,
      async (context) => {
        const { clientId, shoppingCartId } = context.req.param();
        const { productId, quantity } = context.req.valid('json');
        const unitPrice = await getUnitPrice(productId);
        const expectedVersion = assertUnsignedBigInt(
          getETagValueFromIfMatch(context),
        );

        const shoppingCart = shoppingCarts.getByName(clientId);
        const cart = await shoppingCart.addProductItem({
          clientId,
          shoppingCartId,
          expectedVersion,
          productItem: { productId, quantity, unitPrice },
          now: getCurrentTime(),
        });

        const { _version, ...body } = cart;

        return OK({ context, body, eTag: toWeakETag(_version) });
      },
    );

    router.delete(
      '/clients/:clientId/shopping-carts/:shoppingCartId/product-items/:productId',
      async (context) => {
        const { clientId, shoppingCartId, productId } = context.req.param();
        const quantity = positiveInteger(
          context.req.query('quantity'),
          'quantity',
        );
        const expectedVersion = assertUnsignedBigInt(
          getETagValueFromIfMatch(context),
        );

        const shoppingCart = shoppingCarts.getByName(clientId);
        const cart = await shoppingCart.removeProductItem({
          shoppingCartId,
          expectedVersion,
          productId,
          quantity,
        });

        const { _version, ...body } = cart;

        return OK({ context, body, eTag: toWeakETag(_version) });
      },
    );

    router.post(
      '/clients/:clientId/shopping-carts/:shoppingCartId/confirm',
      async (context) => {
        const { clientId, shoppingCartId } = context.req.param();
        const expectedVersion = assertUnsignedBigInt(
          getETagValueFromIfMatch(context),
        );

        const shoppingCart = shoppingCarts.getByName(clientId);
        const cart = await shoppingCart.confirm({
          shoppingCartId,
          expectedVersion,
          now: getCurrentTime(),
        });

        const { _version, ...body } = cart;

        return OK({ context, body, eTag: toWeakETag(_version) });
      },
    );

    router.post(
      '/clients/:clientId/shopping-carts/:shoppingCartId/cancel',
      async (context) => {
        const { clientId, shoppingCartId } = context.req.param();
        const expectedVersion = assertUnsignedBigInt(
          getETagValueFromIfMatch(context),
        );

        const shoppingCart = shoppingCarts.getByName(clientId);
        const cart = await shoppingCart.cancel({
          shoppingCartId,
          expectedVersion,
          now: getCurrentTime(),
        });

        const { _version, ...body } = cart;

        return OK({ context, body, eTag: toWeakETag(_version) });
      },
    );
  };

const isConflict = (error: unknown) =>
  DumboError.isInstanceOf(error, { errorType: ConcurrencyError.ErrorType }) ||
  DumboError.isInstanceOf(error, {
    errorType: UniqueConstraintError.ErrorType,
  });

type ProductItemRequest = { productId?: unknown; quantity?: unknown };

const productItemBody = validator('json', (body: ProductItemRequest) => ({
  productId: assertNotEmptyString(body.productId),
  quantity: positiveInteger(body.quantity, 'quantity'),
}));

const positiveInteger = (value: unknown, name: string): number => {
  const number = typeof value === 'string' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isInteger(number) || number <= 0)
    throw new ValidationError(`${name} must be a positive integer`);
  return number;
};

const shoppingCartUrl = (cart: Pick<ShoppingCart, '_id' | 'clientId'>) =>
  `/clients/${encodeURIComponent(cart.clientId)}/shopping-carts/${encodeURIComponent(cart._id)}`;
