/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { STORAGE_KEYS } from '../utils/constants';
import { useAuth } from './useAuth';

// Create Cart Context
const CartContext = createContext(null);

/**
 * Cart Provider Component
 * Manages shopping cart state for POS module
 */
export function CartProvider({ children }) {
    const { user } = useAuth();
    const owner = user?.id || null;
    return <StaffCartProvider key={owner || 'signed-out'} owner={owner} canRecoverLegacy={user?.role === 'admin'}>{children}</StaffCartProvider>;
}

function StaffCartProvider({ children, owner, canRecoverLegacy }) {
    const cartKey = owner ? `${STORAGE_KEYS.CART}:staff:${owner}` : null;
    const [items, setItems] = useState(() => {
        try {
            const saved = cartKey ? JSON.parse(localStorage.getItem(cartKey) || '[]') : [];
            return Array.isArray(saved) ? saved : [];
        } catch {
            return [];
        }
    });

    const legacyItems = useMemo(() => {
        try {
            if (!canRecoverLegacy || !cartKey || items.length || localStorage.getItem(cartKey) !== null) return [];
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.CART) || '[]');
            return Array.isArray(saved) && saved.every(item => item && typeof item.id === 'string' && Number.isFinite(item.price) && item.price >= 0 && Number.isFinite(item.quantity) && item.quantity > 0) ? saved : [];
        } catch { return []; }
    }, [canRecoverLegacy, cartKey, items.length]);

    const [discountPercent, setDiscountPercent] = useState(0);
    const [customerName, setCustomerName] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState(null);

    // Persist cart to localStorage
    /**
     * Add item to cart
     */
    const addItem = useCallback((product, quantity = 1) => {
        setItems(currentItems => {
            const existingIndex = currentItems.findIndex(item => item.id === product.id);
            const lineType = product.lineType || (product.category === 'Service' ? 'service' : 'product');
            const normalizedItem = {
                id: product.id,
                productId: lineType === 'product' ? (product.productId || product.id) : null,
                serviceId: lineType === 'service' ? (product.serviceId || null) : null,
                lineType,
                name: product.name,
                sku: product.sku,
                price: product.price,
                quantity,
                maxQuantity: product.maxQuantity ?? product.quantity ?? 999,
            };

            if (lineType === 'product' && (normalizedItem.maxQuantity <= 0 || quantity <= 0)) return currentItems;
            normalizedItem.quantity = Math.min(quantity, normalizedItem.maxQuantity);

            let newItems;
            if (existingIndex >= 0) {
                // Update quantity if item exists
                newItems = currentItems.map((item, index) =>
                    index === existingIndex
                        ? { ...item, quantity: Math.min(item.quantity + quantity, item.maxQuantity) }
                        : item
                );
            } else {
                // Add new item
                newItems = [...currentItems, normalizedItem];
            }

            if (cartKey) localStorage.setItem(cartKey, JSON.stringify(newItems));
            return newItems;
        });
    }, [cartKey]);

    /**
     * Remove item from cart
     */
    const removeItem = useCallback((productId) => {
        setItems(currentItems => {
            const newItems = currentItems.filter(item => item.id !== productId);
            if (cartKey) localStorage.setItem(cartKey, JSON.stringify(newItems));
            return newItems;
        });
    }, [cartKey]);

    // Refresh retail prices without removing quantities, services or discounts.
    const refreshProductPrices = useCallback((prices) => {
        const byId = new Map(prices.filter((row) => row.available && row.price != null).map((row) => [row.productId, Number(row.price)]));
        setItems((current) => {
            const updated = current.map((item) => item.lineType !== 'service' && byId.has(item.productId || item.id)
                ? { ...item, price: byId.get(item.productId || item.id) } : item);
            if (cartKey) localStorage.setItem(cartKey, JSON.stringify(updated));
            return updated;
        });
    }, [cartKey]);

    /**
     * Update item quantity
     */
    const updateQuantity = useCallback((productId, quantity) => {
        if (quantity < 1) {
            removeItem(productId);
            return;
        }

        setItems(currentItems => {
            const newItems = currentItems.map(item =>
                item.id === productId
                    ? { ...item, quantity: Math.min(quantity, item.maxQuantity) }
                    : item
            );
            if (cartKey) localStorage.setItem(cartKey, JSON.stringify(newItems));
            return newItems;
        });
    }, [removeItem, cartKey]);

    /**
     * Clear entire cart
     */
    const clearCart = useCallback(() => {
        // Clear durable items before acknowledging checkout cleanup. Keep an empty
        // owned record so an old, unowned basket is never restored automatically.
        if (cartKey) localStorage.setItem(cartKey, '[]');
        setItems([]);
        setDiscountPercent(0);
        setCustomerName('');
        setSelectedCustomer(null);
    }, [cartKey]);

    const recoverLegacyCart = useCallback(() => {
        if (!cartKey || !canRecoverLegacy || items.length || !legacyItems.length) return false;
        localStorage.setItem(cartKey, JSON.stringify(legacyItems));
        setItems(legacyItems);
        return true;
    }, [cartKey, canRecoverLegacy, items.length, legacyItems]);

    /**
     * Calculate cart totals
     */
    const totals = useMemo(() => {
        const rawSubtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        // Calculate discount amount
        const discountAmount = rawSubtotal * (discountPercent / 100);
        const subtotal = rawSubtotal - discountAmount;

        const tax = subtotal * 0.12; // 12% VAT
        const total = subtotal + tax;
        const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

        return { rawSubtotal, discountAmount, subtotal, tax, total, itemCount };
    }, [items, discountPercent]);

    /**
     * Check if product is in cart
     */
    const isInCart = useCallback((productId) => {
        return items.some(item => item.id === productId);
    }, [items]);

    /**
     * Get quantity of product in cart
     */
    const getItemQuantity = useCallback((productId) => {
        const item = items.find(item => item.id === productId);
        return item?.quantity || 0;
    }, [items]);

    const value = {
        items,
        totals,
        discountPercent,
        setDiscountPercent,
        customerName,
        setCustomerName,
        selectedCustomer,
        setSelectedCustomer,
        addItem,
        removeItem,
        updateQuantity,
        refreshProductPrices,
        clearCart,
        legacyItems,
        recoverLegacyCart,
        isInCart,
        getItemQuantity,
        isEmpty: items.length === 0,
    };

    return (
        <CartContext.Provider value={value}>
            {children}
        </CartContext.Provider>
    );
}

/**
 * Hook to access cart context
 */
export function useCart() {
    const context = useContext(CartContext);

    if (!context) {
        throw new Error('useCart must be used within a CartProvider');
    }

    return context;
}

export default CartContext;
