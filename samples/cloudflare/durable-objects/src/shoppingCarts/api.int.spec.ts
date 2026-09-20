import { env } from 'cloudflare:workers';
import {
  ApiE2ESpecification,
  getApplication,
  expectError,
  expectResponse,
  type HonoResponse,
  type TestRequest,
} from '@event-driven-io/emmett-honojs';
import { describe, expect, it } from 'vitest';
import { shoppingCartApi } from './api';
import { getUnitPrice } from './pricing';

describe('Durable Object shopping-cart API integration', () => {
  it('starts a shopping cart by adding the first product', () => {
    const cart = shoppingCart();

    return givenApi()()
      .when(openShoppingCart(cart, { productId: 'product-1', quantity: 2 }))
      .then([
        async (response) => {
          await expectResponse(201, {
            headers: { etag: 'W/"1"' },
            body: {
              clientId: cart.clientId,
              productItems: [
                { productId: 'product-1', quantity: 2, unitPrice: 1000 },
              ],
              productItemsCount: 2,
              totalAmount: 2000,
              status: 'Opened',
            },
          })(response);
          expectCapturedETag(cart, response);
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

  it.each([
    ['view', (cart: TestShoppingCart) => getShoppingCart(cart)],
    [
      'add a product to',
      (cart: TestShoppingCart) =>
        addProductToShoppingCart(cart, 'product-2', 1),
    ],
    [
      'remove a product from',
      (cart: TestShoppingCart) =>
        removeProductFromShoppingCart(cart, 'product-1', 1),
    ],
    ['confirm', (cart: TestShoppingCart) => confirmShoppingCart(cart)],
    ['cancel', (cart: TestShoppingCart) => cancelShoppingCart(cart)],
  ])(
    'does not allow another client to %s a shopping cart',
    (_action, accessShoppingCart) => {
      const ownerCart = shoppingCart();
      const given = givenApi();

      return given(
        ...openedShoppingCart(ownerCart, {
          productId: 'product-1',
          quantity: 2,
        }),
      )
        .when(accessAsAnotherClient(ownerCart, accessShoppingCart))
        .then([expectError(404)]);
    },
  );

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
          await expectResponse(200, {
            body: {
              productItems: [
                { productId: 'product-1', quantity: 1, unitPrice: 1000 },
                { productId: 'product-2', quantity: 1, unitPrice: 2500 },
              ],
              productItemsCount: 2,
              totalAmount: 3500,
              status: 'Opened',
            },
          })(response);
          expectChangedETag(cart, response);
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
          await expectResponse(200, { body: { status: 'Confirmed' } })(
            response,
          );
          expectChangedETag(cart, response);
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
          expectResponse(200, {
            headers: { etag: cart.eTag },
            body: { status: 'Confirmed' },
          })(response),
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
          await expectResponse(201)(response);
          expectCapturedETag(nextCart, response);
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
      .then([
        async (response) => {
          await expectResponse(200, { body: { status: 'Cancelled' } })(
            response,
          );
          expectChangedETag(cart, response);
        },
      ]);
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
      .then([
        async (response) =>
          expectResponse(200, {
            headers: { etag: cart.eTag },
            body: { status: 'Cancelled' },
          })(response),
      ]);
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
      .then([expectError(409)]);
  });

  it('stops treating a cancelled shopping cart as active', () => {
    const cart = shoppingCart();
    const given = givenApi();

    return given(
      ...cancelledShoppingCart(cart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(getCurrentShoppingCart(cart))
      .then([expectError(404)]);
  });

  it('starts a new shopping cart after cancelling the previous one', () => {
    const previousCart = shoppingCart();
    const nextCart = shoppingCart(previousCart.clientId);
    const given = givenApi();

    return given(
      ...cancelledShoppingCart(previousCart, {
        productId: 'product-1',
        quantity: 1,
      }),
    )
      .when(openShoppingCart(nextCart, { productId: 'product-2', quantity: 1 }))
      .then([
        async (response) => {
          await expectResponse(201)(response);
          expectCapturedETag(nextCart, response);
          expect(response.headers.location).not.toBe(previousCart.location);
        },
      ]);
  });

  it.each([
    [
      'add a product',
      (cart: TestShoppingCart) =>
        addProductToShoppingCart(cart, 'product-1', 1),
    ],
    [
      'remove a product',
      (cart: TestShoppingCart) =>
        removeProductFromShoppingCart(cart, 'product-1', 1),
    ],
    ['confirm it', (cart: TestShoppingCart) => confirmShoppingCart(cart)],
    ['cancel it', (cart: TestShoppingCart) => cancelShoppingCart(cart)],
  ])(
    'does not %s when the shopping cart does not exist',
    (_action, changeShoppingCart) => {
      const cart = missingShoppingCart();

      return givenApi()()
        .when(changeShoppingCart(cart))
        .then([expectError(404)]);
    },
  );

  it('does not add a product based on an out-of-date shopping cart', () => {
    const cart = shoppingCart();
    const given = givenApi();

    return given(
      ...openedShoppingCart(
        cart,
        { productId: 'product-1', quantity: 1 },
        { productId: 'product-2', quantity: 1 },
      ),
    )
      .when(addProductUsingPreviousETag(cart, 'product-2', 1))
      .then([expectError(412, { status: 412, title: 'Precondition Failed' })]);
  });

  it('does not remove a product based on an out-of-date shopping cart', () => {
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

  it('does not confirm an out-of-date shopping cart', () => {
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

  it('does not cancel an out-of-date shopping cart', () => {
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
    // TODO: bring back once Emmett maps Hono's HTTPException status to problem details; today a missing body answers 500
    // ['a missing request body', undefined],
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
        .then([expectOneOf(200, 201)]),
      given()
        .when(openShoppingCart(second, { productId: 'product-2', quantity: 1 }))
        .then([expectOneOf(200, 201)]),
    ]);

    await given()
      .when(getCurrentShoppingCart(first))
      .then([
        async (response) => {
          expect([first.status, second.status].sort()).toEqual([200, 201]);
          expect(first.location).toBe(second.location);

          const productItems = [
            { productId: 'product-1', quantity: 1, unitPrice: 1000 },
            { productId: 'product-2', quantity: 1, unitPrice: 2500 },
          ];
          if (second.status === 201) productItems.reverse();

          await expectResponse(200, {
            body: {
              _id: shoppingCartId(first),
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
  eTag: 'W/"1"',
  previousETag: '',
  status: 0,
});

const accessAsAnotherClient = (
  ownerCart: TestShoppingCart,
  accessShoppingCart: (cart: TestShoppingCart) => TestRequest,
): TestRequest => {
  const clientId = crypto.randomUUID();
  return (request) =>
    accessShoppingCart({
      ...ownerCart,
      clientId,
      location: `/clients/${clientId}/shopping-carts/${shoppingCartId(ownerCart)}`,
    })(request);
};

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
    await captureCartResponse(cart, response);
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
    await captureCartResponse(cart, response);
    return response;
  };

const addProductUsingPreviousETag =
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
    await captureCartResponse(cart, response);
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

const confirmShoppingCartUsingPreviousVersion =
  (cart: TestShoppingCart): TestRequest =>
  (request) =>
    request
      .post(`${cart.location}/confirm`)
      .set({ 'If-Match': cart.previousETag });

const cancelShoppingCart =
  (cart: TestShoppingCart): TestRequest =>
  async (request) => {
    const response = await request
      .post(`${cart.location}/cancel`)
      .set({ 'If-Match': cart.eTag })
      .expect();
    await captureCartResponse(cart, response);
    return response;
  };

const cancelShoppingCartUsingPreviousVersion =
  (cart: TestShoppingCart): TestRequest =>
  (request) =>
    request
      .post(`${cart.location}/cancel`)
      .set({ 'If-Match': cart.previousETag });

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

const captureCartResponse = async (
  cart: TestShoppingCart,
  response: HonoResponse,
) => {
  const body = (await response.json()) as { _id?: string } | null;

  cart.previousETag = cart.eTag;
  cart.location = body?._id
    ? `/clients/${cart.clientId}/shopping-carts/${body._id}`
    : cart.location;
  cart.eTag = response.headers.etag || cart.eTag;
  cart.status = response.status;
};

const expectCapturedETag = (cart: TestShoppingCart, response: HonoResponse) => {
  expect(cart.eTag).not.toBe('');
  expect(response.headers.etag).toBe(cart.eTag);
};

const expectChangedETag = (cart: TestShoppingCart, response: HonoResponse) => {
  expectCapturedETag(cart, response);
  expect(cart.eTag).not.toBe(cart.previousETag);
};

const expectOneOf =
  (...statuses: number[]) =>
  (response: HonoResponse) => {
    expect(statuses).toContain(response.status);
  };

const givenApi = (now = new Date()) =>
  ApiE2ESpecification.for({
    getApplication: () =>
      getApplication({
        apis: [
          shoppingCartApi({
            shoppingCarts: env.SHOPPING_CARTS,
            getUnitPrice,
            getCurrentTime: () => now,
          }),
        ],
      }),
  });
