import { env } from 'cloudflare:workers';
import {
  ApiE2ESpecification,
  expectError,
  expectResponse,
  type HonoResponse,
  type TestRequest,
} from '@event-driven-io/emmett-honojs';
import { pongoClient, type PongoDb } from '@event-driven-io/pongo';
import { d1Driver } from '@event-driven-io/pongo/cloudflare';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import pongoConfig from '../pongo.config';
import { shoppingCartApi } from './api';

describe('D1 shopping-cart API integration', () => {
  let db: PongoDb;

  beforeAll(async () => {
    const client = pongoClient({
      driver: d1Driver,
      database: env.DB,
      schema: { definition: pongoConfig.schema, autoMigration: 'None' },
    });
    db = client.database;
    await db.schema.migrate();
  });

  it('starts a shopping cart by adding the first product', () => {
    const cart = shoppingCart();

    return givenApi(db)()
      .when(openShoppingCart(cart, { productId: 'product-1', quantity: 2 }))
      .then([
        async (response) => {
          await expectResponse(201, { headers: { etag: '"1"' } })(response);
          expect(await response.text()).toBe('');
          expect(response.headers.location).toMatch(
            new RegExp(`^/clients/${cart.clientId}/shopping-carts/[^/]+$`),
          );
        },
      ]);
  });

  it('allows a client to revisit a known shopping cart', () => {
    const now = new Date('2026-09-13T10:00:00.000Z');
    const cart = shoppingCart();
    const given = givenApi(db, now);

    return given(
      ...openedShoppingCart(cart, {
        productId: 'product-1',
        quantity: 2,
      }),
    )
      .when(getShoppingCart(cart))
      .then([
        async (response) =>
          expectResponse(200, {
            body: {
              clientId: cart.clientId,
              productItems: [
                { productId: 'product-1', quantity: 2, unitPrice: 1000 },
              ],
              productItemsCount: 2,
              totalAmount: 2000,
              status: 'Opened',
              openedAt: now.toISOString(),
            },
            headers: { etag: cart.eTag },
          })(response),
      ]);
  });

  it('allows a client to find their active shopping cart', () => {
    const cart = shoppingCart();
    const given = givenApi(db);

    return given(
      ...openedShoppingCart(cart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(getCurrentShoppingCart(cart))
      .then([
        async (response) =>
          expectResponse(200, {
            body: {
              _id: shoppingCartId(cart),
              clientId: cart.clientId,
              status: 'Opened',
            },
            headers: { etag: cart.eTag },
          })(response),
      ]);
  });

  it('adds another product to an opened shopping cart', () => {
    const cart = shoppingCart();
    const given = givenApi(db);

    return given(
      ...openedShoppingCart(cart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(addProductToShoppingCart(cart, 'product-2', 1))
      .then([
        async (response) =>
          expectResponse(204, {
            headers: { location: cart.location, etag: '"2"' },
          })(response),
      ]);
  });

  it('shows all products added to a shopping cart', () => {
    const cart = shoppingCart();
    const given = givenApi(db);

    return given(
      ...openedShoppingCart(
        cart,
        { productId: 'product-1', quantity: 1 },
        { productId: 'product-2', quantity: 1 },
      ),
    )
      .when(getShoppingCart(cart))
      .then([
        async (response) =>
          expectResponse(200, {
            body: {
              productItems: [
                { productId: 'product-1', quantity: 1, unitPrice: 1000 },
                { productId: 'product-2', quantity: 1, unitPrice: 2500 },
              ],
              productItemsCount: 2,
              totalAmount: 3500,
            },
            headers: { etag: cart.eTag },
          })(response),
      ]);
  });

  it('reduces the product quantity in a shopping cart', () => {
    const cart = shoppingCart();
    const given = givenApi(db);

    return given(
      ...openedShoppingCart(cart, {
        productId: 'product-1',
        quantity: 2,
      }),
      removeProductFromShoppingCart(cart, 'product-1', 1),
    )
      .when(getShoppingCart(cart))
      .then([
        async (response) =>
          expectResponse(200, {
            body: {
              productItems: [
                { productId: 'product-1', quantity: 1, unitPrice: 1000 },
              ],
              productItemsCount: 1,
              totalAmount: 1000,
              status: 'Opened',
            },
            headers: { etag: cart.eTag },
          })(response),
      ]);
  });

  it('does not confirm an empty shopping cart', () => {
    const cart = shoppingCart();
    const given = givenApi(db);

    return given(
      ...openedShoppingCart(cart, {
        productId: 'product-1',
        quantity: 1,
      }),
      removeProductFromShoppingCart(cart, 'product-1', 1),
    )
      .when(confirmShoppingCart(cart))
      .then([expectError(409)]);
  });

  it('confirms an opened shopping cart', () => {
    const cart = shoppingCart();
    const given = givenApi(db);

    return given(
      ...openedShoppingCart(cart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(confirmShoppingCart(cart))
      .then([
        async (response) =>
          expectResponse(204, {
            headers: { location: cart.location, etag: '"2"' },
          })(response),
      ]);
  });

  it('allows a client to safely retry confirmation', () => {
    const cart = shoppingCart();
    const given = givenApi(db);

    return given(
      ...confirmedShoppingCart(cart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(confirmShoppingCart(cart))
      .then([
        async (response) =>
          expectResponse(204, { headers: { etag: cart.eTag } })(response),
      ]);
  });

  it('stops treating a confirmed shopping cart as active', () => {
    const cart = shoppingCart();
    const given = givenApi(db);

    return given(
      ...confirmedShoppingCart(cart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(getCurrentShoppingCart(cart))
      .then([expectError(404)]);
  });

  it('starts a new shopping cart after confirming the previous one', () => {
    const previousCart = shoppingCart();
    const nextCart = shoppingCart(previousCart.clientId);
    const given = givenApi(db);

    return given(
      ...confirmedShoppingCart(previousCart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(openShoppingCart(nextCart, { productId: 'product-2', quantity: 1 }))
      .then([
        async (response) => {
          await expectResponse(201, { headers: { etag: '"1"' } })(response);
          expect(response.headers.location).not.toBe(previousCart.location);
        },
      ]);
  });

  it('cancels an opened shopping cart', () => {
    const cart = shoppingCart();
    const given = givenApi(db);

    return given(
      ...openedShoppingCart(cart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(cancelShoppingCart(cart))
      .then([expectResponse(204)]);
  });

  it('allows a client to safely retry cancellation', () => {
    const cart = shoppingCart();
    const given = givenApi(db);

    return given(
      ...cancelledShoppingCart(cart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(cancelShoppingCart(cart))
      .then([expectResponse(204)]);
  });

  it('does not add products to a cancelled shopping cart', () => {
    const cart = shoppingCart();
    const given = givenApi(db);

    return given(
      ...cancelledShoppingCart(cart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(addProductToShoppingCart(cart, 'product-1', 1))
      .then([expectError(404)]);
  });

  it('does not overwrite a shopping cart changed by another request', () => {
    const cart = shoppingCart();
    const given = givenApi(db);

    return given(
      ...openedShoppingCart(
        cart,
        { productId: 'product-1', quantity: 1 },
        { productId: 'product-2', quantity: 1 },
      ),
    )
      .when(addProductUsingPreviousVersion(cart, 'product-2', 1))
      .then([expectError(412, { status: 412, title: 'Precondition Failed' })]);
  });

  it('requires changes to be based on the current shopping cart state', () => {
    const cart = shoppingCart();
    const given = givenApi(db);

    return given(
      ...openedShoppingCart(cart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(addProductWithoutETag(cart, 'product-2', 1))
      .then([expectError(412, { status: 412, title: 'Precondition Failed' })]);
  });

  it.each([
    ['a missing request body', undefined],
    ['a missing product identifier', { quantity: 1 }],
    ['an empty product identifier', { productId: '', quantity: 1 }],
    ['a missing quantity', { productId: 'product-1' }],
    ['a non-positive quantity', { productId: 'product-1', quantity: 0 }],
    ['a non-integer quantity', { productId: 'product-1', quantity: 1.5 }],
    ['an unknown product', { productId: 'unknown', quantity: 1 }],
  ])('rejects %s', (_case, body) => {
    const cart = shoppingCart();

    return givenApi(db)()
      .when(addInvalidProductToCurrentShoppingCart(cart, body))
      .then([expectError(400, { status: 400, title: 'Bad Request' })]);
  });

  it('keeps one active cart when first products are added concurrently', async () => {
    const first = shoppingCart();
    const second = shoppingCart(first.clientId);
    const given = givenApi(db);

    await Promise.all([
      given()
        .when(openShoppingCart(first, { productId: 'product-1', quantity: 1 }))
        .then([expectOneOf(201, 204)]),
      given()
        .when(openShoppingCart(second, { productId: 'product-2', quantity: 1 }))
        .then([expectOneOf(201, 204)]),
    ]);

    await given()
      .when(getCurrentShoppingCart(first))
      .then([
        async (response) => {
          expect([first.status, second.status].sort()).toEqual([201, 204]);
          expect(first.location).toBe(second.location);

          const productItems = [
            { productId: 'product-1', quantity: 1, unitPrice: 1000 },
            { productId: 'product-2', quantity: 1, unitPrice: 2500 },
          ];
          if (second.status === 201) productItems.reverse();

          await expectResponse(200, {
            body: {
              clientId: first.clientId,
              productItems,
              productItemsCount: 2,
              totalAmount: 3500,
              status: 'Opened',
            },
          })(response);
        },
      ]);
  });
});

type ProductItemRequest = Readonly<{ productId: string; quantity: number }>;

type TestShoppingCart = {
  clientId: string;
  location: string;
  eTag: string;
  previousETag: string;
  status: number;
};

const shoppingCart = (clientId = crypto.randomUUID()): TestShoppingCart => ({
  clientId,
  location: '',
  eTag: '',
  previousETag: '',
  status: 0,
});

const openedShoppingCart = (
  cart: TestShoppingCart,
  ...productItems: [ProductItemRequest, ...ProductItemRequest[]]
): TestRequest[] => {
  const [firstProductItem, ...additionalProductItems] = productItems;
  return [
    openShoppingCart(cart, firstProductItem),
    ...additionalProductItems.map(({ productId, quantity }) =>
      addProductToShoppingCart(cart, productId, quantity),
    ),
  ];
};

const confirmedShoppingCart = (
  cart: TestShoppingCart,
  ...productItems: [ProductItemRequest, ...ProductItemRequest[]]
): TestRequest[] => [
  ...openedShoppingCart(cart, ...productItems),
  confirmShoppingCart(cart),
];

const cancelledShoppingCart = (
  cart: TestShoppingCart,
  ...productItems: [ProductItemRequest, ...ProductItemRequest[]]
): TestRequest[] => [
  ...openedShoppingCart(cart, ...productItems),
  cancelShoppingCart(cart),
];

const openShoppingCart =
  (cart: TestShoppingCart, productItem: ProductItemRequest): TestRequest =>
  async (request) => {
    const response = await request
      .post(`/clients/${cart.clientId}/shopping-carts/current/product-items`)
      .send(productItem)
      .expect();
    captureCartResponse(cart, response);
    return response;
  };

const addProductToShoppingCart =
  (cart: TestShoppingCart, productId: string, quantity: number): TestRequest =>
  async (request) => {
    const response = await request
      .post(`${cart.location}/product-items`)
      .set({ 'If-Match': cart.eTag })
      .send({ productId, quantity })
      .expect();
    captureCartResponse(cart, response);
    return response;
  };

const addProductUsingPreviousVersion =
  (cart: TestShoppingCart, productId: string, quantity: number): TestRequest =>
  (request) =>
    request
      .post(`${cart.location}/product-items`)
      .set({ 'If-Match': cart.previousETag })
      .send({ productId, quantity });

const addProductWithoutETag =
  (cart: TestShoppingCart, productId: string, quantity: number): TestRequest =>
  (request) =>
    request
      .post(`${cart.location}/product-items`)
      .send({ productId, quantity });

const addInvalidProductToCurrentShoppingCart =
  (cart: TestShoppingCart, body: unknown): TestRequest =>
  (request) =>
    request
      .post(`/clients/${cart.clientId}/shopping-carts/current/product-items`)
      .send(body);

const removeProductFromShoppingCart =
  (cart: TestShoppingCart, productId: string, quantity: number): TestRequest =>
  async (request) => {
    const response = await request
      .delete(
        `${cart.location}/product-items/${productId}?quantity=${quantity}`,
      )
      .set({ 'If-Match': cart.eTag })
      .expect();
    captureCartResponse(cart, response);
    return response;
  };

const confirmShoppingCart =
  (cart: TestShoppingCart): TestRequest =>
  async (request) => {
    const response = await request
      .post(`${cart.location}/confirm`)
      .set({ 'If-Match': cart.eTag })
      .expect();
    captureCartResponse(cart, response);
    return response;
  };

const cancelShoppingCart =
  (cart: TestShoppingCart): TestRequest =>
  (request) =>
    request.delete(cart.location).set({ 'If-Match': cart.eTag });

const getShoppingCart =
  (cart: TestShoppingCart): TestRequest =>
  (request) =>
    request.get(cart.location);

const getCurrentShoppingCart =
  (cart: TestShoppingCart): TestRequest =>
  (request) =>
    request.get(`/clients/${cart.clientId}/shopping-carts/current`);

const shoppingCartId = (cart: TestShoppingCart) =>
  cart.location.split('/').at(-1) ?? '';

const captureCartResponse = (
  cart: TestShoppingCart,
  response: HonoResponse,
) => {
  cart.previousETag = cart.eTag;
  cart.location = response.headers.location || cart.location;
  cart.eTag = response.headers.etag || cart.eTag;
  cart.status = response.status;
};

const expectOneOf =
  (...statuses: number[]) =>
  (response: HonoResponse) => {
    expect(statuses).toContain(response.status);
  };

const unitPrices: Readonly<Record<string, number>> = {
  'product-1': 1000,
  'product-2': 2500,
};

const getUnitPrice = (productId: string): Promise<number> => {
  const unitPrice = unitPrices[productId];
  if (unitPrice === undefined) throw new Error('Product not found');
  return Promise.resolve(unitPrice);
};

const givenApi = (db: PongoDb, now = new Date()) => {
  const app = new Hono<{ Bindings: CloudflareBindings }>();
  shoppingCartApi<CloudflareBindings>(
    () => db,
    getUnitPrice,
    () => now,
  )(app);
  return ApiE2ESpecification.for({
    fetch: (request) => app.fetch(request),
  });
};
