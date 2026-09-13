import { env } from 'cloudflare:workers';
import {
  ApiE2ESpecification,
  getApplication,
  expectError,
  expectResponse,
  type HonoResponse,
  type TestRequest,
} from '@event-driven-io/emmett-honojs';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { shoppingCartApi } from './api';

describe('Durable Object shopping-cart API integration', () => {
  it('starts a shopping cart by adding the first product', () => {
    const cart = shoppingCart();

    return givenApi()()
      .when(openShoppingCart(cart, { productId: 'product-1', quantity: 2 }))
      .then([
        async (response) => {
          expect(cart.eTag).not.toBe('');
          await expectResponse(201, { headers: { etag: cart.eTag } })(response);
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
    const given = givenApi(now);

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
    const given = givenApi();

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
    const given = givenApi();

    return given(
      ...openedShoppingCart(cart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(addProductToShoppingCart(cart, 'product-2', 1))
      .then([
        async (response) => {
          expect(cart.eTag).not.toBe(cart.previousETag);
          await expectResponse(204, {
            headers: { location: cart.location, etag: cart.eTag },
          })(response);
        },
      ]);
  });

  it('shows all products added to a shopping cart', () => {
    const cart = shoppingCart();
    const given = givenApi();

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
    const given = givenApi();

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
    const given = givenApi();

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
    const given = givenApi();

    return given(
      ...openedShoppingCart(cart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(confirmShoppingCart(cart))
      .then([
        async (response) => {
          expect(cart.eTag).not.toBe(cart.previousETag);
          await expectResponse(204, {
            headers: { location: cart.location, etag: cart.eTag },
          })(response);
        },
      ]);
  });

  it('allows a client to safely retry confirmation', () => {
    const cart = shoppingCart();
    const given = givenApi();

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
    const given = givenApi();

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
    const given = givenApi();

    return given(
      ...confirmedShoppingCart(previousCart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(openShoppingCart(nextCart, { productId: 'product-2', quantity: 1 }))
      .then([
        async (response) => {
          expect(nextCart.eTag).not.toBe('');
          await expectResponse(201, {
            headers: { etag: nextCart.eTag },
          })(response);
          expect(response.headers.location).not.toBe(previousCart.location);
        },
      ]);
  });

  it('cancels an opened shopping cart', () => {
    const cart = shoppingCart();
    const given = givenApi();

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
    const given = givenApi();

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
    const given = givenApi();

    return given(
      ...cancelledShoppingCart(cart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(addProductToShoppingCart(cart, 'product-1', 1))
      .then([expectError(404)]);
  });

  it('does not add a product based on an earlier shopping cart state', () => {
    const cart = shoppingCart();
    const given = givenApi();

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

  it('does not remove a product based on an earlier shopping cart state', () => {
    const cart = shoppingCart();
    const given = givenApi();

    return given(
      ...openedShoppingCart(
        cart,
        { productId: 'product-1', quantity: 2 },
        { productId: 'product-2', quantity: 1 },
      ),
    )
      .when(removeProductUsingPreviousVersion(cart, 'product-1', 1))
      .then([expectError(412, { status: 412, title: 'Precondition Failed' })]);
  });

  it('does not confirm a shopping cart based on an earlier state', () => {
    const cart = shoppingCart();
    const given = givenApi();

    return given(
      ...openedShoppingCart(
        cart,
        { productId: 'product-1', quantity: 1 },
        { productId: 'product-2', quantity: 1 },
      ),
    )
      .when(confirmShoppingCartUsingPreviousVersion(cart))
      .then([expectError(412, { status: 412, title: 'Precondition Failed' })]);
  });

  it('does not cancel a shopping cart based on an earlier state', () => {
    const cart = shoppingCart();
    const given = givenApi();

    return given(
      ...openedShoppingCart(
        cart,
        { productId: 'product-1', quantity: 1 },
        { productId: 'product-2', quantity: 1 },
      ),
    )
      .when(cancelShoppingCartUsingPreviousVersion(cart))
      .then([expectError(412, { status: 412, title: 'Precondition Failed' })]);
  });

  it('does not allow another client to view a shopping cart', () => {
    const cart = shoppingCart();
    const anotherClientId = crypto.randomUUID();
    const given = givenApi();

    return given(
      ...openedShoppingCart(cart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(getShoppingCartAs(cart, anotherClientId))
      .then([expectError(404)]);
  });

  it('does not allow another client to add products to a shopping cart', () => {
    const cart = shoppingCart();
    const anotherClientId = crypto.randomUUID();
    const given = givenApi();

    return given(
      ...openedShoppingCart(cart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(addProductToShoppingCartAs(cart, anotherClientId, 'product-2', 1))
      .then([expectError(404)]);
  });

  it('does not allow another client to remove products from a shopping cart', () => {
    const cart = shoppingCart();
    const anotherClientId = crypto.randomUUID();
    const given = givenApi();

    return given(
      ...openedShoppingCart(cart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(
        removeProductFromShoppingCartAs(cart, anotherClientId, 'product-1', 1),
      )
      .then([expectError(404)]);
  });

  it('does not allow another client to confirm a shopping cart', () => {
    const cart = shoppingCart();
    const anotherClientId = crypto.randomUUID();
    const given = givenApi();

    return given(
      ...openedShoppingCart(cart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(confirmShoppingCartAs(cart, anotherClientId))
      .then([expectError(404)]);
  });

  it("does not reveal another client's shopping cart during cancellation", () => {
    const cart = shoppingCart();
    const anotherClientId = crypto.randomUUID();
    const given = givenApi();

    return given(
      ...openedShoppingCart(cart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(cancelShoppingCartAs(cart, anotherClientId))
      .then([expectResponse(204)]);
  });

  it('does not add products to a shopping cart that does not exist', () => {
    const cart = missingShoppingCart();

    return givenApi()()
      .when(addProductToShoppingCart(cart, 'product-1', 1))
      .then([expectError(404)]);
  });

  it('does not remove products from a shopping cart that does not exist', () => {
    const cart = missingShoppingCart();

    return givenApi()()
      .when(removeProductFromShoppingCart(cart, 'product-1', 1))
      .then([expectError(404)]);
  });

  it('does not confirm a shopping cart that does not exist', () => {
    const cart = missingShoppingCart();

    return givenApi()()
      .when(confirmShoppingCart(cart))
      .then([expectError(404)]);
  });

  it('requires changes to be based on the current shopping cart state', () => {
    const cart = shoppingCart();
    const given = givenApi();

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

    return givenApi()()
      .when(addInvalidProductToCurrentShoppingCart(cart, body))
      .then([expectError(400, { status: 400, title: 'Bad Request' })]);
  });

  it('keeps one active cart when first products are added concurrently', async () => {
    const first = shoppingCart();
    const second = shoppingCart(first.clientId);
    const given = givenApi();

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

const missingShoppingCart = (
  clientId = crypto.randomUUID(),
): TestShoppingCart => ({
  clientId,
  location: `/clients/${clientId}/shopping-carts/${crypto.randomUUID()}`,
  eTag: '"0"',
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

const addProductToShoppingCartAs =
  (
    cart: TestShoppingCart,
    clientId: string,
    productId: string,
    quantity: number,
  ): TestRequest =>
  (request) =>
    request
      .post(`${shoppingCartLocation(cart, clientId)}/product-items`)
      .set({ 'If-Match': cart.eTag })
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

const removeProductUsingPreviousVersion =
  (cart: TestShoppingCart, productId: string, quantity: number): TestRequest =>
  (request) =>
    request
      .delete(
        `${cart.location}/product-items/${productId}?quantity=${quantity}`,
      )
      .set({ 'If-Match': cart.previousETag });

const removeProductFromShoppingCartAs =
  (
    cart: TestShoppingCart,
    clientId: string,
    productId: string,
    quantity: number,
  ): TestRequest =>
  (request) =>
    request
      .delete(
        `${shoppingCartLocation(cart, clientId)}/product-items/${productId}?quantity=${quantity}`,
      )
      .set({ 'If-Match': cart.eTag });

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

const confirmShoppingCartUsingPreviousVersion =
  (cart: TestShoppingCart): TestRequest =>
  (request) =>
    request
      .post(`${cart.location}/confirm`)
      .set({ 'If-Match': cart.previousETag });

const confirmShoppingCartAs =
  (cart: TestShoppingCart, clientId: string): TestRequest =>
  (request) =>
    request
      .post(`${shoppingCartLocation(cart, clientId)}/confirm`)
      .set({ 'If-Match': cart.eTag });

const cancelShoppingCart =
  (cart: TestShoppingCart): TestRequest =>
  (request) =>
    request.delete(cart.location).set({ 'If-Match': cart.eTag });

const cancelShoppingCartUsingPreviousVersion =
  (cart: TestShoppingCart): TestRequest =>
  (request) =>
    request.delete(cart.location).set({ 'If-Match': cart.previousETag });

const cancelShoppingCartAs =
  (cart: TestShoppingCart, clientId: string): TestRequest =>
  (request) =>
    request
      .delete(shoppingCartLocation(cart, clientId))
      .set({ 'If-Match': cart.eTag });

const getShoppingCart =
  (cart: TestShoppingCart): TestRequest =>
  (request) =>
    request.get(cart.location);

const getShoppingCartAs =
  (cart: TestShoppingCart, clientId: string): TestRequest =>
  (request) =>
    request.get(shoppingCartLocation(cart, clientId));

const getCurrentShoppingCart =
  (cart: TestShoppingCart): TestRequest =>
  (request) =>
    request.get(`/clients/${cart.clientId}/shopping-carts/current`);

const shoppingCartId = (cart: TestShoppingCart) =>
  cart.location.split('/').at(-1) ?? '';

const shoppingCartLocation = (cart: TestShoppingCart, clientId: string) =>
  `/clients/${clientId}/shopping-carts/${shoppingCartId(cart)}`;

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

const givenApi = (now = new Date()) => {
  const api = new Hono<{ Bindings: CloudflareBindings }>();
  shoppingCartApi(getUnitPrice, () => now)(api);
  const app = getApplication({ apis: [] });
  app.route('/', api);
  return ApiE2ESpecification.for({
    fetch: (request) => app.fetch(request, env),
  });
};
