/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { STORAGE_KEYS } from '../utils/constants';

// Create Cart Context
const CartContext = createContext(null);

/**
 * Cart Provider Component
 * Manages shopping cart state for POS module
 */
export function CartProvider({ children }) {
    const [items, setItems] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.CART);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    const [discountPercent, setDiscountPercent] = useState(0);
    const [customerName, setCustomerName] = useState('');

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

            localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(newItems));
            return newItems;
        });
    }, []);

    /**
     * Remove item from cart
     */
    const removeItem = useCallback((productId) => {
        setItems(currentItems => {
            const newItems = currentItems.filter(item => item.id !== productId);
            localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(newItems));
            return newItems;
        });
    }, []);

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
            localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(newItems));
            return newItems;
        });
    }, [removeItem]);

    /**
     * Clear entire cart
     */
    const clearCart = useCallback(() => {
        setItems([]);
        setDiscountPercent(0);
        setCustomerName('');
        localStorage.removeItem(STORAGE_KEYS.CART);
    }, []);

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
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
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
