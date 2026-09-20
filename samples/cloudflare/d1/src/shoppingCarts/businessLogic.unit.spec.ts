import { describe, expect, it } from 'vitest';
import {
  addProductItem,
  cancel,
  confirm,
  removeProductItem,
} from './businessLogic';
import type { ShoppingCart } from './shoppingCart';

describe('ShoppingCart', () => {
  const clientId = 'client-1';
  const shoppingCartId = 'cart-1';
  const openedAt = new Date('2026-09-13T10:00:00.000Z');
  const confirmedAt = new Date('2026-09-13T11:00:00.000Z');
  const cancelledAt = new Date('2026-09-13T12:00:00.000Z');

  const openedCart = (overrides: Partial<ShoppingCart> = {}): ShoppingCart => ({
    _id: shoppingCartId,
    clientId,
    productItems: [
      {
        productId: 'product-1',
        quantity: 2,
        unitPrice: 1_500,
      },
    ],
    productItemsCount: 2,
    totalAmount: 3_000,
    status: 'Opened',
    openedAt,
    ...overrides,
  });

  describe('adding a product item', () => {
    it('opens a cart when one does not exist', () => {
      // Given
      const state = null;

      // When
      const result = addProductItem(
        {
          clientId,
          shoppingCartId,
          productItem: {
            productId: 'product-1',
            quantity: 2,
            unitPrice: 1_500,
          },
          now: openedAt,
        },
        state,
      );

      // Then
      expect(result).toEqual(openedCart());
    });

    it('adds a new product line to an opened cart', () => {
      // Given
      const state = openedCart();

      // When
      const result = addProductItem(
        {
          clientId,
          shoppingCartId,
          productItem: {
            productId: 'product-2',
            quantity: 1,
            unitPrice: 2_000,
          },
          now: confirmedAt,
        },
        state,
      );

      // Then
      expect(result.productItems).toEqual([
        { productId: 'product-1', quantity: 2, unitPrice: 1_500 },
        { productId: 'product-2', quantity: 1, unitPrice: 2_000 },
      ]);
      expect(result.productItemsCount).toBe(3);
      expect(result.totalAmount).toBe(5_000);
      expect(state).toEqual(openedCart());
    });

    it('keeps the captured price when adding an existing product', () => {
      // Given
      const state = openedCart();

      // When
      const result = addProductItem(
        {
          clientId,
          shoppingCartId,
          productItem: {
            productId: 'product-1',
            quantity: 3,
            unitPrice: 2_000,
          },
          now: confirmedAt,
        },
        state,
      );

      // Then
      expect(result.productItems).toEqual([
        { productId: 'product-1', quantity: 5, unitPrice: 1_500 },
      ]);
      expect(result.productItemsCount).toBe(5);
      expect(result.totalAmount).toBe(7_500);
    });

    it('rejects adding a product to a confirmed cart', () => {
      // Given
      const state = openedCart({ status: 'Confirmed', confirmedAt });

      // When
      const when = () =>
        addProductItem(
          {
            clientId,
            shoppingCartId,
            productItem: {
              productId: 'product-2',
              quantity: 1,
              unitPrice: 2_000,
            },
            now: confirmedAt,
          },
          state,
        );

      // Then
      expect(when).toThrow('Shopping Cart already closed');
    });

    it('rejects adding a product to a cancelled cart', () => {
      // Given
      const state = openedCart({ status: 'Cancelled', cancelledAt });

      // When
      const when = () =>
        addProductItem(
          {
            clientId,
            shoppingCartId,
            productItem: {
              productId: 'product-2',
              quantity: 1,
              unitPrice: 2_000,
            },
            now: cancelledAt,
          },
          state,
        );

      // Then
      expect(when).toThrow('Shopping Cart already closed');
    });
  });

  describe('removing a product item', () => {
    it('decreases the product line and cart totals', () => {
      // Given
      const state = openedCart();

      // When
      const result = removeProductItem(
        { productId: 'product-1', quantity: 1 },
        state,
      );

      // Then
      expect(result.productItems).toEqual([
        { productId: 'product-1', quantity: 1, unitPrice: 1_500 },
      ]);
      expect(result.productItemsCount).toBe(1);
      expect(result.totalAmount).toBe(1_500);
      expect(state).toEqual(openedCart());
    });

    it('removes the product line when its quantity reaches zero', () => {
      // Given
      const state = openedCart();

      // When
      const result = removeProductItem(
        { productId: 'product-1', quantity: 2 },
        state,
      );

      // Then
      expect(result.productItems).toEqual([]);
      expect(result.productItemsCount).toBe(0);
      expect(result.totalAmount).toBe(0);
    });

    it('rejects removing a missing or insufficient product quantity', () => {
      // Given
      const stateWithoutProduct = openedCart();
      const stateWithoutEnoughProduct = openedCart();

      // When
      const removingMissingProduct = () =>
        removeProductItem(
          { productId: 'product-2', quantity: 1 },
          stateWithoutProduct,
        );
      const removingInsufficientQuantity = () =>
        removeProductItem(
          { productId: 'product-1', quantity: 3 },
          stateWithoutEnoughProduct,
        );

      // Then
      expect(removingMissingProduct).toThrow(
        'Not enough products in shopping cart',
      );
      expect(removingInsufficientQuantity).toThrow(
        'Not enough products in shopping cart',
      );
    });

    it('rejects removing a product when the cart is not opened', () => {
      // Given
      const state = null;

      // When
      const when = () =>
        removeProductItem({ productId: 'product-1', quantity: 1 }, state);

      // Then
      expect(when).toThrow('Shopping Cart is not opened');
    });

    it('rejects removing a product from a cancelled cart', () => {
      // Given
      const state = openedCart({ status: 'Cancelled', cancelledAt });

      // When
      const when = () =>
        removeProductItem({ productId: 'product-1', quantity: 1 }, state);

      // Then
      expect(when).toThrow('Shopping Cart is not opened');
    });
  });

  describe('confirming a cart', () => {
    it('confirms a non-empty opened cart', () => {
      // Given
      const state = openedCart();

      // When
      const result = confirm({ now: confirmedAt }, state);

      // Then
      expect(result.status).toBe('Confirmed');
      expect(result.confirmedAt).toEqual(confirmedAt);
      expect(state).toEqual(openedCart());
    });

    it('returns an already confirmed cart unchanged', () => {
      // Given
      const state = openedCart();

      // When
      const firstResult = confirm({ now: openedAt }, state);
      const repeatedResult = confirm({ now: confirmedAt }, firstResult);

      // Then
      expect(repeatedResult).toBe(firstResult);
      expect(repeatedResult.confirmedAt).toEqual(openedAt);
    });

    it('rejects confirming a missing cart', () => {
      // Given
      const state = null;

      // When
      const when = () => confirm({ now: confirmedAt }, state);

      // Then
      expect(when).toThrow('Shopping Cart is not opened');
    });

    it('rejects confirming an empty cart', () => {
      // Given
      const state = openedCart({
        productItems: [],
        productItemsCount: 0,
        totalAmount: 0,
      });

      // When
      const when = () => confirm({ now: confirmedAt }, state);

      // Then
      expect(when).toThrow('Shopping Cart is empty');
    });

    it('rejects confirming a cancelled cart', () => {
      // Given
      const state = openedCart({ status: 'Cancelled', cancelledAt });

      // When
      const when = () => confirm({ now: confirmedAt }, state);

      // Then
      expect(when).toThrow('Shopping Cart is not opened');
    });
  });

  describe('cancelling a cart', () => {
    it('cancels an opened cart', () => {
      // Given
      const state = openedCart();

      // When
      const result = cancel({ now: cancelledAt }, state);

      // Then
      expect(result.status).toBe('Cancelled');
      expect(result.cancelledAt).toEqual(cancelledAt);
      expect(state).toEqual(openedCart());
    });

    it('returns an already cancelled cart unchanged', () => {
      // Given
      const state = openedCart();

      // When
      const firstResult = cancel({ now: openedAt }, state);
      const repeatedResult = cancel({ now: cancelledAt }, firstResult);

      // Then
      expect(repeatedResult).toBe(firstResult);
      expect(repeatedResult.cancelledAt).toEqual(openedAt);
    });

    it('rejects cancelling a missing cart', () => {
      // Given
      const state = null;

      // When
      const when = () => cancel({ now: cancelledAt }, state);

      // Then
      expect(when).toThrow('Shopping Cart is not opened');
    });

    it('rejects cancelling a confirmed cart', () => {
      // Given
      const state = openedCart({ status: 'Confirmed', confirmedAt });

      // When
      const when = () => cancel({ now: cancelledAt }, state);

      // Then
      expect(when).toThrow('Shopping Cart is not opened');
    });
  });
});
