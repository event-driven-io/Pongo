import {
  ConcurrencyError,
  DumboError,
  UniqueConstraintError,
} from '@event-driven-io/dumbo';
import {
  assertNotEmptyString,
  assertUnsignedBigInt,
  asyncRetry,
  NotFoundError,
  ValidationError,
} from '@event-driven-io/emmett';
import {
  Created,
  getETagValueFromIfMatch,
  OK,
  toWeakETag,
  type WebApiSetup,
} from '@event-driven-io/emmett-honojs';
import type { PongoDb, WithIdAndVersion } from '@event-driven-io/pongo';
import { validator } from 'hono/validator';
import {
  addProductItem,
  cancel,
  confirm,
  removeProductItem,
} from './businessLogic';
import type { ShoppingCart } from './shoppingCart';

type ShoppingCartApiDependencies = {
  pongoDb: PongoDb;
  getUnitPrice: (productId: string) => Promise<number>;
  getCurrentTime: () => Date;
};

export const shoppingCartApi =
  ({
    pongoDb,
    getUnitPrice,
    getCurrentTime,
  }: ShoppingCartApiDependencies): WebApiSetup =>
  (router) => {
    const shoppingCarts = pongoDb.collection<ShoppingCart>('shoppingCarts');

    router.post(
      '/clients/:clientId/shopping-carts/current/product-items',
      productItemBody,
      async (context) => {
        const { clientId } = context.req.param();
        const { productId, quantity } = context.req.valid('json');
        const unitPrice = await getUnitPrice(productId);
        const now = getCurrentTime();

        const { cart, created } = await asyncRetry(
          async () => {
            const current = await shoppingCarts.findOne({
              clientId,
              status: 'Opened',
            });
            const shoppingCartId = current?._id ?? crypto.randomUUID();

            const result = await shoppingCarts.handle(
              {
                _id: shoppingCartId,
                expectedVersion: current?._version ?? 'DOCUMENT_DOES_NOT_EXIST',
              },
              (state) =>
                addProductItem(
                  {
                    clientId,
                    shoppingCartId,
                    productItem: { productId, quantity, unitPrice },
                    now,
                  },
                  state,
                ),
            );

            return {
              cart: result.document as WithIdAndVersion<ShoppingCart>,
              created: current === null,
            };
          },
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

      const cart = await shoppingCarts.findOne({ clientId, status: 'Opened' });
      if (cart === null)
        throw new NotFoundError({ id: clientId, type: 'Shopping cart' });

      const { _version, ...body } = cart;

      return OK({ context, body, eTag: toWeakETag(_version) });
    });

    router.get(
      '/clients/:clientId/shopping-carts/:shoppingCartId',
      async (context) => {
        const { clientId, shoppingCartId } = context.req.param();

        const cart = await shoppingCarts.findOne({
          _id: shoppingCartId,
          clientId,
        });
        if (cart === null)
          throw new NotFoundError({
            id: shoppingCartId,
            type: 'Shopping cart',
          });

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

        const existing = await shoppingCarts.findOne({
          _id: shoppingCartId,
          clientId,
        });
        if (existing === null)
          throw new NotFoundError({
            id: shoppingCartId,
            type: 'Shopping cart',
          });

        const result = await shoppingCarts.handle(
          { _id: shoppingCartId, expectedVersion },
          (state) =>
            addProductItem(
              {
                clientId,
                shoppingCartId,
                productItem: { productId, quantity, unitPrice },
                now: getCurrentTime(),
              },
              state,
            ),
        );
        const { _version, ...body } =
          result.document as WithIdAndVersion<ShoppingCart>;

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

        const existing = await shoppingCarts.findOne({
          _id: shoppingCartId,
          clientId,
        });
        if (existing === null)
          throw new NotFoundError({
            id: shoppingCartId,
            type: 'Shopping cart',
          });

        const result = await shoppingCarts.handle(
          { _id: shoppingCartId, expectedVersion },
          (state) => removeProductItem({ productId, quantity }, state),
        );
        const { _version, ...body } =
          result.document as WithIdAndVersion<ShoppingCart>;

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

        const existing = await shoppingCarts.findOne({
          _id: shoppingCartId,
          clientId,
        });
        if (existing === null)
          throw new NotFoundError({
            id: shoppingCartId,
            type: 'Shopping cart',
          });

        const result = await shoppingCarts.handle(
          { _id: shoppingCartId, expectedVersion },
          (state) => confirm({ now: getCurrentTime() }, state),
        );
        const { _version, ...body } =
          result.document as WithIdAndVersion<ShoppingCart>;

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

        const existing = await shoppingCarts.findOne({
          _id: shoppingCartId,
          clientId,
        });
        if (existing === null)
          throw new NotFoundError({
            id: shoppingCartId,
            type: 'Shopping cart',
          });

        const result = await shoppingCarts.handle(
          { _id: shoppingCartId, expectedVersion },
          (state) => cancel({ now: getCurrentTime() }, state),
        );
        const { _version, ...body } =
          result.document as WithIdAndVersion<ShoppingCart>;

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

const shoppingCartUrl = (cart: ShoppingCart) =>
  `/clients/${encodeURIComponent(cart.clientId)}/shopping-carts/${encodeURIComponent(cart._id)}`;
