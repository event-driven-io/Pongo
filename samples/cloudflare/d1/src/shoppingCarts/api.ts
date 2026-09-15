import {
  ConcurrencyError,
  UniqueConstraintError,
} from '@event-driven-io/dumbo';
import type { PongoDb } from '@event-driven-io/pongo';
import type { Context, Hono } from 'hono';
import {
  addProductItem,
  cancel,
  confirm,
  removeProductItem,
  type AddProductItemToShoppingCart,
  type ConfirmShoppingCart,
  type RemoveProductItemFromShoppingCart,
} from './businessLogic';
import type { ShoppingCart } from './shoppingCart';

type GetUnitPrice = (productId: string) => Promise<number>;
type GetCurrentTime = () => Date;
type ProblemStatus = 400 | 404 | 409 | 412 | 500;

type ApiErrorCode = 'InvalidRequest' | 'NotFound' | 'PreconditionFailed';
type ApiError = Error & Readonly<{ apiErrorCode: ApiErrorCode }>;

const apiError = (apiErrorCode: ApiErrorCode, message: string): ApiError =>
  Object.assign(new Error(message), { apiErrorCode });

export const shoppingCartApi =
  <Bindings extends object>(
    getPongoDb: (bindings: Bindings) => PongoDb,
    getUnitPrice: GetUnitPrice,
    getCurrentTime: GetCurrentTime,
  ) =>
  (router: Hono<{ Bindings: Bindings }>) => {
    router.onError((error, context) => mapError(context, error));

    router.post(
      '/clients/:clientId/shopping-carts/current/product-items',
      async (context) => {
        const clientId = requiredIdentifier(
          context.req.param('clientId'),
          'clientId',
        );
        const { productId, quantity } = await productItemRequest(context);
        const unitPrice = await resolveUnitPrice(getUnitPrice, productId);
        const shoppingCarts = getPongoDb(context.env).collection<ShoppingCart>(
          'shoppingCarts',
        );

        while (true) {
          const current = await shoppingCarts.findOne({
            clientId,
            status: 'Opened',
          });
          const shoppingCartId = current?._id ?? crypto.randomUUID();
          const created = current === null;

          try {
            const result = await shoppingCarts.handle(
              {
                _id: shoppingCartId,
                expectedVersion: current?._version ?? 'DOCUMENT_DOES_NOT_EXIST',
              },
              (state) => {
                const command: AddProductItemToShoppingCart = {
                  type: 'AddProductItemToShoppingCart',
                  data: {
                    clientId,
                    shoppingCartId,
                    productItem: { productId, quantity, unitPrice },
                    now: getCurrentTime(),
                  },
                };
                return addProductItem(command.data, state);
              },
            );

            if (!result.successful || !result.document) continue;

            return noContentAt(
              context,
              clientId,
              shoppingCartId,
              result.document,
              created ? 201 : 204,
            );
          } catch (error) {
            if (error instanceof UniqueConstraintError) continue;
            throw error;
          }
        }
      },
    );

    router.get('/clients/:clientId/shopping-carts/current', async (context) => {
      const clientId = requiredIdentifier(
        context.req.param('clientId'),
        'clientId',
      );
      const cart = await getPongoDb(context.env)
        .collection<ShoppingCart>('shoppingCarts')
        .findOne({ clientId, status: 'Opened' });

      if (!cart) throw apiError('NotFound', 'Shopping cart not found');
      return cartResponse(context, cart);
    });

    router.get(
      '/clients/:clientId/shopping-carts/:shoppingCartId',
      async (context) => {
        const { clientId, shoppingCartId } = routeIds(context);
        const cart = await getPongoDb(context.env)
          .collection<ShoppingCart>('shoppingCarts')
          .findOne({ _id: shoppingCartId, clientId });

        if (!cart) throw apiError('NotFound', 'Shopping cart not found');
        return cartResponse(context, cart);
      },
    );

    router.post(
      '/clients/:clientId/shopping-carts/:shoppingCartId/product-items',
      async (context) => {
        const { clientId, shoppingCartId } = routeIds(context);
        const db = getPongoDb(context.env);
        await getOwnedCart(db, clientId, shoppingCartId);
        const { productId, quantity } = await productItemRequest(context);
        const unitPrice = await resolveUnitPrice(getUnitPrice, productId);
        const expectedVersion = expectedVersionFromIfMatch(context);
        const command: AddProductItemToShoppingCart = {
          type: 'AddProductItemToShoppingCart',
          data: {
            clientId,
            shoppingCartId,
            productItem: { productId, quantity, unitPrice },
            now: getCurrentTime(),
          },
        };

        const result = await db
          .collection<ShoppingCart>('shoppingCarts')
          .handle({ _id: shoppingCartId, expectedVersion }, (state) => {
            assertOwnedCart(state, clientId);
            return addProductItem(command.data, state);
          });
        result.assertSuccessful();

        return noContentAt(
          context,
          clientId,
          shoppingCartId,
          requiredDocument(result.document),
        );
      },
    );

    router.delete(
      '/clients/:clientId/shopping-carts/:shoppingCartId/product-items/:productId',
      async (context) => {
        const { clientId, shoppingCartId } = routeIds(context);
        const db = getPongoDb(context.env);
        await getOwnedCart(db, clientId, shoppingCartId);
        const productId = requiredIdentifier(
          context.req.param('productId'),
          'productId',
        );
        const command: RemoveProductItemFromShoppingCart = {
          type: 'RemoveProductItemFromShoppingCart',
          data: {
            productId,
            quantity: positiveInteger(
              context.req.query('quantity'),
              'quantity',
            ),
          },
        };
        const expectedVersion = expectedVersionFromIfMatch(context);

        const result = await db
          .collection<ShoppingCart>('shoppingCarts')
          .handle({ _id: shoppingCartId, expectedVersion }, (state) => {
            assertOwnedCart(state, clientId);
            return removeProductItem(command.data, state);
          });
        result.assertSuccessful();

        return noContentAt(
          context,
          clientId,
          shoppingCartId,
          requiredDocument(result.document),
        );
      },
    );

    router.post(
      '/clients/:clientId/shopping-carts/:shoppingCartId/confirm',
      async (context) => {
        const { clientId, shoppingCartId } = routeIds(context);
        const db = getPongoDb(context.env);
        await getOwnedCart(db, clientId, shoppingCartId);
        const command: ConfirmShoppingCart = {
          type: 'ConfirmShoppingCart',
          data: { now: getCurrentTime() },
        };
        const expectedVersion = expectedVersionFromIfMatch(context);

        const result = await db
          .collection<ShoppingCart>('shoppingCarts')
          .handle({ _id: shoppingCartId, expectedVersion }, (state) => {
            assertOwnedCart(state, clientId);
            return confirm(command.data, state);
          });
        result.assertSuccessful();

        return noContentAt(
          context,
          clientId,
          shoppingCartId,
          requiredDocument(result.document),
        );
      },
    );

    router.delete(
      '/clients/:clientId/shopping-carts/:shoppingCartId',
      async (context) => {
        const { clientId, shoppingCartId } = routeIds(context);
        const db = getPongoDb(context.env);
        const existing = await db
          .collection<ShoppingCart>('shoppingCarts')
          .findOne({ _id: shoppingCartId });

        if (!existing) return context.body(null, 204);
        assertOwnedCart(existing, clientId);
        const expectedVersion = expectedVersionFromIfMatch(context);

        const result = await db
          .collection<ShoppingCart>('shoppingCarts')
          .handle({ _id: shoppingCartId, expectedVersion }, (state) => {
            assertOwnedCart(state, clientId);
            return cancel(state);
          });

        if (!result.successful) {
          const stillExists = await db
            .collection<ShoppingCart>('shoppingCarts')
            .findOne({ _id: shoppingCartId });
          if (stillExists) result.assertSuccessful();
        }

        return context.body(null, 204);
      },
    );
  };

const routeIds = (context: Context) => ({
  clientId: requiredIdentifier(context.req.param('clientId'), 'clientId'),
  shoppingCartId: requiredIdentifier(
    context.req.param('shoppingCartId'),
    'shoppingCartId',
  ),
});

const productItemRequest = async (context: Context) => {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    throw apiError('InvalidRequest', 'Request body must be valid JSON');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw apiError('InvalidRequest', 'Request body must be a JSON object');

  const productId = requiredIdentifier(
    'productId' in body ? body.productId : undefined,
    'productId',
  );
  const quantity = positiveInteger(
    'quantity' in body ? body.quantity : undefined,
    'quantity',
  );
  return { productId, quantity };
};

const requiredIdentifier = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw apiError('InvalidRequest', `${name} must be a non-empty string`);
  return value;
};

const positiveInteger = (value: unknown, name: string): number => {
  const number = typeof value === 'string' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isInteger(number) || number <= 0)
    throw apiError('InvalidRequest', `${name} must be a positive integer`);
  return number;
};

const resolveUnitPrice = async (
  getUnitPrice: GetUnitPrice,
  productId: string,
): Promise<number> => {
  try {
    return await getUnitPrice(productId);
  } catch {
    throw apiError('InvalidRequest', 'Unknown product');
  }
};

type AssertOwnedCart = (
  state: ShoppingCart | null,
  clientId: string,
) => asserts state is ShoppingCart;

const assertOwnedCart: AssertOwnedCart = (
  state: ShoppingCart | null,
  clientId: string,
): asserts state is ShoppingCart => {
  if (!state || state.clientId !== clientId)
    throw apiError('NotFound', 'Shopping cart not found');
};

const getOwnedCart = async (
  db: PongoDb,
  clientId: string,
  shoppingCartId: string,
) => {
  const cart = await db
    .collection<ShoppingCart>('shoppingCarts')
    .findOne({ _id: shoppingCartId });
  assertOwnedCart(cart, clientId);
  return cart;
};

const shoppingCartLocation = (clientId: string, shoppingCartId: string) =>
  `/clients/${encodeURIComponent(clientId)}/shopping-carts/${encodeURIComponent(shoppingCartId)}`;

const noContentAt = (
  context: Context,
  clientId: string,
  shoppingCartId: string,
  cart: ShoppingCart,
  status: 201 | 204 = 204,
) => {
  context.header('Location', shoppingCartLocation(clientId, shoppingCartId));
  setCartETag(context, cart);
  return context.body(null, status);
};

const cartResponse = (context: Context, cart: ShoppingCart) => {
  setCartETag(context, cart);
  return context.json(toResponse(cart));
};

const setCartETag = (context: Context, cart: ShoppingCart) => {
  context.header('ETag', `"${documentVersion(cart)}"`);
};

const documentVersion = (cart: ShoppingCart): bigint => {
  const version = (cart as ShoppingCart & { _version?: unknown })._version;
  if (typeof version !== 'bigint') throw new Error('Document version missing');
  return version;
};

const requiredDocument = (document: ShoppingCart | null): ShoppingCart => {
  if (!document) throw new Error('Updated document missing');
  return document;
};

const expectedVersionFromIfMatch = (context: Context): bigint => {
  const ifMatch = context.req.header('If-Match');
  const match = ifMatch?.match(/^"(\d+)"$/);
  if (!match)
    throw apiError(
      'PreconditionFailed',
      'If-Match must contain the current shopping cart ETag',
    );
  return BigInt(match[1]);
};

const toResponse = (cart: ShoppingCart) => {
  const { _version: _, ...response } = cart as ShoppingCart & {
    _version?: bigint;
  };
  return response;
};

const mapError = (context: Context, error: Error) => {
  if (isApiError(error, 'InvalidRequest'))
    return problem(context, 400, 'Bad Request', error.message);
  if (isApiError(error, 'NotFound'))
    return problem(context, 404, 'Not Found', error.message);
  if (
    isApiError(error, 'PreconditionFailed') ||
    error instanceof ConcurrencyError
  )
    return problem(context, 412, 'Precondition Failed', error.message);
  if (error instanceof UniqueConstraintError)
    return problem(context, 409, 'Conflict', 'An opened cart already exists');
  if (
    [
      'Shopping Cart already closed',
      'Shopping Cart is not opened',
      'Not enough products in shopping cart',
      'Shopping Cart is empty',
      'Cannot cancel confirmed Shopping Cart',
    ].includes(error.message)
  )
    return problem(context, 409, 'Conflict', error.message);

  return problem(context, 500, 'Internal Server Error', 'Unexpected error');
};

const isApiError = (
  error: Error,
  apiErrorCode: ApiErrorCode,
): error is ApiError =>
  'apiErrorCode' in error && error.apiErrorCode === apiErrorCode;

const problem = (
  context: Context,
  status: ProblemStatus,
  title: string,
  detail: string,
) =>
  context.newResponse(
    JSON.stringify({ type: 'about:blank', title, status, detail }),
    status,
    { 'Content-Type': 'application/problem+json' },
  );
