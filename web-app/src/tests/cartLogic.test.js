import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { CartProvider, useCart } from '../context/CartContext';

// Mock localStorage for tests
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => { store[key] = value.toString(); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; }
    };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('CartLogic and Financial Calculations', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('should initialize an empty cart', () => {
        const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
        expect(result.current.items).toEqual([]);
        expect(result.current.totals.subtotal).toBe(0);
        expect(result.current.totals.tax).toBe(0);
        expect(result.current.totals.total).toBe(0);
    });

    it('should add items and calculate correct totals (subtotal, tax, total) avoiding manual calculation errors', () => {
        const { result } = renderHook(() => useCart(), { wrapper: CartProvider });

        act(() => {
            // Note: context expects `quantity` as stock in the product object, and second arg as quantity to add
            result.current.addItem({ id: 1, name: 'Premium Oil Filter', sku: 'OF-100', price: 500, quantity: 10 }, 2);
        });

        expect(result.current.items.length).toBe(1);
        expect(result.current.items[0].quantity).toBe(2);

        // subtotal = 500 * 2 = 1000
        // tax = 1000 * 0.12 = 120
        // total = 1120
        expect(result.current.totals.subtotal).toBe(1000);
        expect(result.current.totals.tax).toBe(120);
        expect(result.current.totals.total).toBe(1120);
    });

    it('should update quantities correctly and prevent exceeding available stock', () => {
        const { result } = renderHook(() => useCart(), { wrapper: CartProvider });

        act(() => {
            // Only 5 in stock max
            result.current.addItem({ id: 2, name: 'Brake Pads', sku: 'BP-200', price: 1500, quantity: 5 }, 1);
        });

        act(() => {
            result.current.updateQuantity(2, 10); // Try exceeding max stock of 5
        });

        // Should cap at 5
        expect(result.current.items[0].quantity).toBe(5);

        // Total should be 5 * 1500 = 7500
        expect(result.current.totals.subtotal).toBe(7500);
    });

    it('should properly accumulate total for multiple disparate items', () => {
        const { result } = renderHook(() => useCart(), { wrapper: CartProvider });

        act(() => {
            result.current.addItem({ id: 1, name: 'Item 1', sku: 'SKU-1', price: 100, quantity: 10 }, 1);
            result.current.addItem({ id: 2, name: 'Item 2', sku: 'SKU-2', price: 200, quantity: 10 }, 2);
        });

        // Subtotal: (100 * 1) + (200 * 2) = 500
        expect(result.current.totals.subtotal).toBe(500);
        expect(result.current.totals.tax).toBe(60);
        expect(result.current.totals.total).toBe(560);
    });
});
