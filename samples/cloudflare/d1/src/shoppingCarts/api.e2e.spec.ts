import { exports } from 'cloudflare:workers';
import {
  ApiE2ESpecification,
  expectError,
  expectResponse,
  type HonoResponse,
  type TestRequest,
} from '@event-driven-io/emmett-honojs';
import { beforeAll, describe, expect, it } from 'vitest';

const given = ApiE2ESpecification.for({
  getApplication: () => exports.default,
});

describe('D1 shopping-cart Worker', () => {
  beforeAll(async () => {
    await given()
      .when(migrateSchema('test-migration-token'))
      .then([expectResponse(204)]);
  });

  it('does not allow an unauthenticated deployment to migrate storage', () =>
    given()
      .when(migrateSchema())
      .then([expectResponse(401)]));

  it('does not allow an unauthorized deployment to migrate storage', () =>
    given()
      .when(migrateSchema('incorrect'))
      .then([expectResponse(401)]));

  it('allows a deployment to safely retry storage migration', () =>
    given(migrateSchema('test-migration-token'))
      .when(migrateSchema('test-migration-token'))
      .then([expectResponse(204)]));

  it('allows a client to find their active shopping cart', () => {
    const cart = shoppingCart();

    return given(
      ...openedShoppingCart(cart, {
        productId: 'product-1',
        quantity: 2,
      }),
    )
      .when(getCurrentShoppingCart(cart))
      .then([
        async (response) =>
          expectResponse(200, {
            body: {
              _id: shoppingCartId(cart),
              clientId: cart.clientId,
              productItemsCount: 2,
              totalAmount: 2000,
              status: 'Opened',
            },
            headers: { etag: cart.eTag },
          })(response),
      ]);
  });

  it('starts a new shopping cart after confirming the previous one', () => {
    const previousCart = shoppingCart();
    const nextCart = shoppingCart(previousCart.clientId);

    return given(
      ...confirmedShoppingCart(previousCart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(openShoppingCart(nextCart, { productId: 'product-2', quantity: 1 }))
      .then([
        async (response) => {
          await expectResponse(201, {
            headers: { etag: nextCart.eTag },
          })(response);
          expect(response.headers.location).not.toBe(previousCart.location);
        },
      ]);
  });

  it('does not start a shopping cart with an invalid product', () => {
    const cart = shoppingCart();

    return given()
      .when(
        addInvalidProductToCurrentShoppingCart(cart, {
          productId: '',
          quantity: 1,
        }),
      )
      .then([
        expectError(400, {
          type: 'about:blank',
          title: 'Bad Request',
          status: 400,
        }),
      ]);
  });
});

type ProductItemRequest = Readonly<{ productId: string; quantity: number }>;

type TestShoppingCart = {
  clientId: string;
  location: string;
  eTag: string;
};

const shoppingCart = (clientId = crypto.randomUUID()): TestShoppingCart => ({
  clientId,
  location: '',
  eTag: '',
});

const openedShoppingCart = (
  cart: TestShoppingCart,
  productItem: ProductItemRequest,
): TestRequest[] => [openShoppingCart(cart, productItem)];

const confirmedShoppingCart = (
  cart: TestShoppingCart,
  productItem: ProductItemRequest,
): TestRequest[] => [
  ...openedShoppingCart(cart, productItem),
  confirmShoppingCart(cart),
];

const openShoppingCart =
  (cart: TestShoppingCart, productItem: ProductItemRequest): TestRequest =>
  async (request) => {
    const response = await request
      .post(`/clients/${cart.clientId}/shopping-carts/current/product-items`)
      .send(productItem)
      .expect();
    await captureCartResponse(cart, response);
    return response;
  };

const confirmShoppingCart =
  (cart: TestShoppingCart): TestRequest =>
  async (request) => {
    const response = await request
      .post(`${cart.location}/confirm`)
      .set({ 'If-Match': cart.eTag })
      .expect();
    await captureCartResponse(cart, response);
    return response;
  };

const getCurrentShoppingCart =
  (cart: TestShoppingCart): TestRequest =>
  (request) =>
    request.get(`/clients/${cart.clientId}/shopping-carts/current`);

const addInvalidProductToCurrentShoppingCart =
  (cart: TestShoppingCart, body: unknown): TestRequest =>
  (request) =>
    request
      .post(`/clients/${cart.clientId}/shopping-carts/current/product-items`)
      .send(body);

const migrateSchema =
  (token?: string): TestRequest =>
  (request) => {
    const migration = request.post('/_system/migrations');
    return token
      ? migration.set({ Authorization: `Bearer ${token}` })
      : migration;
  };

const shoppingCartId = (cart: TestShoppingCart) =>
  cart.location.split('/').at(-1) ?? '';

const captureCartResponse = async (
  cart: TestShoppingCart,
  response: HonoResponse,
) => {
  const body = (await response.json()) as { _id?: string } | null;

  cart.location = body?._id
    ? `/clients/${cart.clientId}/shopping-carts/${body._id}`
    : cart.location;
  cart.eTag = response.headers.etag || cart.eTag;
};
