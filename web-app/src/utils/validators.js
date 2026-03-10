import { z } from 'zod';

/**
 * Common validation schemas using Zod
 */

// Email validation
export const emailSchema = z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address');

// Password validation
export const passwordSchema = z
    .string()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters');

// Strong password validation
export const strongPasswordSchema = z
    .string()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number');

// Phone number validation (Philippine format)
export const phoneSchema = z
    .string()
    .min(1, 'Phone number is required')
    .regex(/^(09|\+639)\d{9}$/, 'Please enter a valid Philippine phone number');

// Required string
export const requiredString = (fieldName = 'This field') =>
    z.string().min(1, `${fieldName} is required`);

// Optional string
export const optionalString = z.string().optional();

// Positive number
export const positiveNumber = (fieldName = 'Value') =>
    z.number().positive(`${fieldName} must be greater than 0`);

// Non-negative number
export const nonNegativeNumber = (fieldName = 'Value') =>
    z.number().nonnegative(`${fieldName} cannot be negative`);

// Login form schema
export const loginSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
});

// User form schema
export const userSchema = z.object({
    firstName: requiredString('First name'),
    lastName: requiredString('Last name'),
    email: emailSchema,
    phone: phoneSchema.optional().or(z.literal('')),
    role: z.enum(['admin', 'cashier', 'stock_clerk'], {
        required_error: 'Please select a role',
    }),
});

// Product form schema
export const productSchema = z.object({
    name: requiredString('Product name'),
    sku: requiredString('SKU'),
    barcode: z.string().optional(),
    description: z.string().optional(),
    category: requiredString('Category'),
    price: z.number().positive('Price must be greater than 0'),
    cost: z.number().nonnegative('Cost cannot be negative'),
    quantity: z.number().int().nonnegative('Quantity cannot be negative'),
    lowStockThreshold: z.number().int().nonnegative(),
    location: z.object({
        floor: z.number().int().min(1).max(2),
        section: z.string().optional(),
        shelf: z.string().optional(),
    }).optional(),
});

// Service order schema
export const serviceOrderSchema = z.object({
    customerName: requiredString('Customer name'),
    customerPhone: phoneSchema,
    vehicleInfo: z.object({
        make: requiredString('Vehicle make'),
        model: requiredString('Vehicle model'),
        year: z.number().int().min(1950).max(new Date().getFullYear() + 1),
        plateNumber: requiredString('Plate number'),
    }),
    description: requiredString('Service description'),
    estimatedCost: z.number().nonnegative(),
    notes: z.string().optional(),
});

// Quotation schema
export const quotationSchema = z.object({
    customerName: requiredString('Customer name'),
    customerPhone: phoneSchema.optional().or(z.literal('')),
    customerEmail: emailSchema.optional().or(z.literal('')),
    items: z.array(z.object({
        productId: z.string().optional(),
        description: requiredString('Item description'),
        quantity: z.number().int().positive('Quantity must be at least 1'),
        unitPrice: z.number().nonnegative('Price cannot be negative'),
    })).min(1, 'At least one item is required'),
    services: z.array(z.object({
        description: requiredString('Service description'),
        price: z.number().nonnegative('Price cannot be negative'),
    })).optional(),
    notes: z.string().optional(),
    validUntil: z.date().optional(),
});

/**
 * Validate data against a schema
 * @param {z.ZodSchema} schema - Zod schema
 * @param {any} data - Data to validate
 * @returns {{ success: boolean, data?: any, errors?: object }}
 */
export const validate = (schema, data) => {
    const result = schema.safeParse(data);

    if (result.success) {
        return { success: true, data: result.data };
    }

    const errors = {};
    result.error.issues.forEach((issue) => {
        const path = issue.path.join('.');
        errors[path] = issue.message;
    });

    return { success: false, errors };
};
