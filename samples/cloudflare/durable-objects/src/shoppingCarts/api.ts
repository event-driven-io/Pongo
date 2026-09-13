import { ConcurrencyError } from '@event-driven-io/dumbo';
import { NotFoundError, ValidationError } from '@event-driven-io/emmett';
import type { Context, Hono } from 'hono';
import type {
  AddProductItemToShoppingCart,
  ConfirmShoppingCart,
  RemoveProductItemFromShoppingCart,
} from './businessLogic';
import type { ShoppingCartDurableObject } from './shoppingCartDurableObject';
import type { ShoppingCart } from './shoppingCart';

type GetUnitPrice = (productId: string) => Promise<number>;
type GetCurrentTime = () => Date;
type BindingsWithShoppingCarts = {
  SHOPPING_CARTS: DurableObjectNamespace<ShoppingCartDurableObject>;
};

export const shoppingCartApi =
  <Bindings extends BindingsWithShoppingCarts>(
    getUnitPrice: GetUnitPrice,
    getCurrentTime: GetCurrentTime,
  ) =>
  (router: Hono<{ Bindings: Bindings }>) => {
    router.post(
      '/clients/:clientId/shopping-carts/current/product-items',
      async (context) => {
        const clientId = requiredIdentifier(
          context.req.param('clientId'),
          'clientId',
        );
        const { productId, quantity } = await productItemRequest(context);
        const unitPrice = await resolveUnitPrice(getUnitPrice, productId);
        const command: AddProductItemToShoppingCart = {
          type: 'AddProductItemToShoppingCart',
          data: {
            clientId,
            shoppingCartId: crypto.randomUUID(),
            productItem: { productId, quantity, unitPrice },
            now: getCurrentTime(),
          },
        };
        const result = await shoppingCarts(
          context,
          clientId,
        ).addProductItemToCurrent(command.data);

        return noContentAt(
          context,
          clientId,
          result.cart,
          result.created ? 201 : 204,
        );
      },
    );

    router.get('/clients/:clientId/shopping-carts/current', async (context) => {
      const clientId = requiredIdentifier(
        context.req.param('clientId'),
        'clientId',
      );
      const cart = await shoppingCarts(context, clientId).getCurrent(clientId);
      if (!cart)
        throw new NotFoundError({
          id: clientId,
          type: 'Shopping cart',
          message: 'Shopping cart not found',
        });
      return cartResponse(context, cart);
    });

    router.get(
      '/clients/:clientId/shopping-carts/:shoppingCartId',
      async (context) => {
        const { clientId, shoppingCartId } = routeIds(context);
        const cart = await shoppingCarts(context, clientId).getById(
          shoppingCartId,
        );
        if (!cart)
          throw new NotFoundError({
            id: shoppingCartId,
            type: 'Shopping cart',
            message: 'Shopping cart not found',
          });
        return cartResponse(context, cart);
      },
    );

    router.post(
      '/clients/:clientId/shopping-carts/:shoppingCartId/product-items',
      async (context) => {
        const { clientId, shoppingCartId } = routeIds(context);
        const { productId, quantity } = await productItemRequest(context);
        const unitPrice = await resolveUnitPrice(getUnitPrice, productId);
        const command: AddProductItemToShoppingCart = {
          type: 'AddProductItemToShoppingCart',
          data: {
            clientId,
            shoppingCartId,
            productItem: { productId, quantity, unitPrice },
            now: getCurrentTime(),
          },
        };
        const cart = await shoppingCarts(context, clientId).addProductItem(
          command.data,
          expectedVersionFromIfMatch(context),
        );
        if (!cart)
          throw new NotFoundError({
            id: shoppingCartId,
            type: 'Shopping cart',
            message: 'Shopping cart not found',
          });
        return noContentAt(context, clientId, cart);
      },
    );

    router.delete(
      '/clients/:clientId/shopping-carts/:shoppingCartId/product-items/:productId',
      async (context) => {
        const { clientId, shoppingCartId } = routeIds(context);
        const command: RemoveProductItemFromShoppingCart = {
          type: 'RemoveProductItemFromShoppingCart',
          data: {
            productId: requiredIdentifier(
              context.req.param('productId'),
              'productId',
            ),
            quantity: positiveInteger(
              context.req.query('quantity'),
              'quantity',
            ),
          },
        };
        const cart = await shoppingCarts(context, clientId).removeProductItem(
          shoppingCartId,
          command.data,
          expectedVersionFromIfMatch(context),
        );
        if (!cart)
          throw new NotFoundError({
            id: shoppingCartId,
            type: 'Shopping cart',
            message: 'Shopping cart not found',
          });
        return noContentAt(context, clientId, cart);
      },
    );

    router.post(
      '/clients/:clientId/shopping-carts/:shoppingCartId/confirm',
      async (context) => {
        const { clientId, shoppingCartId } = routeIds(context);
        const command: ConfirmShoppingCart = {
          type: 'ConfirmShoppingCart',
          data: { now: getCurrentTime() },
        };
        const cart = await shoppingCarts(context, clientId).confirmShoppingCart(
          shoppingCartId,
          command.data,
          expectedVersionFromIfMatch(context),
        );
        if (!cart)
          throw new NotFoundError({
            id: shoppingCartId,
            type: 'Shopping cart',
            message: 'Shopping cart not found',
          });
        return noContentAt(context, clientId, cart);
      },
    );

    router.delete(
      '/clients/:clientId/shopping-carts/:shoppingCartId',
      async (context) => {
        const { clientId, shoppingCartId } = routeIds(context);
        await shoppingCarts(context, clientId).cancelShoppingCart(
          shoppingCartId,
          optionalExpectedVersionFromIfMatch(context),
        );
        return context.body(null, 204);
      },
    );
  };

const shoppingCarts = <Bindings extends BindingsWithShoppingCarts>(
  context: Context<{ Bindings: Bindings }>,
  clientId: string,
) => context.env.SHOPPING_CARTS.getByName(clientId);

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
    throw new ValidationError('Request body must be valid JSON');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new ValidationError('Request body must be a JSON object');

  return {
    productId: requiredIdentifier(
      'productId' in body ? body.productId : undefined,
      'productId',
    ),
    quantity: positiveInteger(
      'quantity' in body ? body.quantity : undefined,
      'quantity',
    ),
  };
};

const requiredIdentifier = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new ValidationError(`${name} must be a non-empty string`);
  return value;
};

const positiveInteger = (value: unknown, name: string): number => {
  const number = typeof value === 'string' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isInteger(number) || number <= 0)
    throw new ValidationError(`${name} must be a positive integer`);
  return number;
};

const resolveUnitPrice = async (
  getUnitPrice: GetUnitPrice,
  productId: string,
): Promise<number> => {
  try {
    return await getUnitPrice(productId);
  } catch {
    throw new ValidationError('Unknown product');
  }
};

const expectedVersionFromIfMatch = (context: Context): bigint => {
  const expectedVersion = optionalExpectedVersionFromIfMatch(context);
  if (expectedVersion === undefined)
    throw new ConcurrencyError(
      'If-Match must contain the current shopping cart ETag',
    );
  return expectedVersion;
};

const optionalExpectedVersionFromIfMatch = (
  context: Context,
): bigint | undefined => {
  const ifMatch = context.req.header('If-Match');
  if (ifMatch === undefined) return undefined;
  const match = ifMatch.match(/^"(\d+)"$/);
  if (!match)
    throw new ConcurrencyError(
      'If-Match must contain the current shopping cart ETag',
    );
  return BigInt(match[1]);
};

const shoppingCartLocation = (cart: ShoppingCart) =>
  `/clients/${encodeURIComponent(cart.clientId)}/shopping-carts/${encodeURIComponent(cart._id)}`;

const noContentAt = (
  context: Context,
  clientId: string,
  cart: ShoppingCart,
  status: 201 | 204 = 204,
) => {
  if (cart.clientId !== clientId)
    throw new NotFoundError({
      id: cart._id,
      type: 'Shopping cart',
      message: 'Shopping cart not found',
    });
  context.header('Location', shoppingCartLocation(cart));
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

const toResponse = (cart: ShoppingCart) => {
  const { _version: _, ...response } = cart as ShoppingCart & {
    _version?: bigint;
  };
  return response;
};
