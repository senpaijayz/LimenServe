// Application constants for LimenServe

import { resolveApiBaseUrl } from '../config/runtimeEnvironment';

// API Configuration
// Every hosted build uses its environment-scoped backend URL. Local development
// retains a safe localhost default when no Vite environment has been configured.
export const API_BASE_URL = resolveApiBaseUrl(import.meta.env);

// User Roles
export const ROLES = {
    ADMIN: 'admin',
    CASHIER: 'cashier',
    STAFF: 'staff',
    STOCK_CLERK: 'stock_clerk',
    VIEWER: 'viewer',
    CUSTOMER: 'customer',
};

// Role Display Names
export const ROLE_LABELS = {
    [ROLES.ADMIN]: 'Administrator',
    [ROLES.CASHIER]: 'Cashier',
    [ROLES.STAFF]: 'Staff',
    [ROLES.STOCK_CLERK]: 'Clerk',
    [ROLES.VIEWER]: 'Viewer',
    [ROLES.CUSTOMER]: 'Customer',
};

export function getDefaultAuthenticatedPath(role) {
    if (role === ROLES.CUSTOMER) {
        return '/my-reservations';
    }

    if (role === ROLES.CASHIER) {
        return '/pos';
    }

    if (role === ROLES.STOCK_CLERK) {
        return '/inventory';
    }

    return '/dashboard';
}

// Order/Service Status
export const SERVICE_STATUS = {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
};

export const STATUS_LABELS = {
    [SERVICE_STATUS.PENDING]: 'Pending',
    [SERVICE_STATUS.IN_PROGRESS]: 'In Progress',
    [SERVICE_STATUS.COMPLETED]: 'Completed',
    [SERVICE_STATUS.CANCELLED]: 'Cancelled',
};

export const STATUS_COLORS = {
    [SERVICE_STATUS.PENDING]: 'warning',
    [SERVICE_STATUS.IN_PROGRESS]: 'info',
    [SERVICE_STATUS.COMPLETED]: 'success',
    [SERVICE_STATUS.CANCELLED]: 'danger',
};

// Stock Level Thresholds
export const STOCK_LEVELS = {
    LOW: 10,
    CRITICAL: 5,
};

// Payment Methods
export const PAYMENT_METHODS = {
    CASH: 'cash',
    GCASH: 'gcash',
    BANK_TRANSFER: 'bank_transfer',
};

export const PAYMENT_LABELS = {
    [PAYMENT_METHODS.CASH]: 'Cash',
    [PAYMENT_METHODS.GCASH]: 'GCash',
    [PAYMENT_METHODS.BANK_TRANSFER]: 'Bank Transfer',
};

// Currency
export const CURRENCY = {
    CODE: 'PHP',
    SYMBOL: '₱',
    LOCALE: 'en-PH',
};

// Date Formats
export const DATE_FORMATS = {
    DISPLAY: 'MMM dd, yyyy',
    DISPLAY_WITH_TIME: 'MMM dd, yyyy hh:mm a',
    INPUT: 'yyyy-MM-dd',
    TIME: 'hh:mm a',
};

// Pagination
export const PAGINATION = {
    DEFAULT_PAGE_SIZE: 10,
    PAGE_SIZE_OPTIONS: [10, 25, 50, 100],
};

// Navigation Items
export const NAV_ITEMS = {
    main: [
        { path: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard', roles: [ROLES.ADMIN] },
        { path: '/pos', label: 'Point of Sale', icon: 'ShoppingCart', roles: [ROLES.ADMIN, ROLES.CASHIER] },
        { path: '/inventory', label: 'Inventory', icon: 'Package', roles: [ROLES.ADMIN, ROLES.STOCK_CLERK] },
        { path: '/services', label: 'Service Orders', icon: 'Wrench', roles: [ROLES.ADMIN, ROLES.CASHIER] },
        { path: '/my-services', label: 'My Services', icon: 'Wrench', roles: [ROLES.CUSTOMER] },
        { path: '/my-reservations', label: 'My Reservations', icon: 'ClipboardList', roles: [ROLES.CUSTOMER] },
    ],
    admin: [
        { path: '/products', label: 'Products', icon: 'Boxes', roles: [ROLES.ADMIN] },
        { path: '/suppliers', label: 'Suppliers', icon: 'Truck', roles: [ROLES.ADMIN] },
        { path: '/reservations', label: 'Part Reservations', icon: 'ClipboardList', roles: [ROLES.ADMIN] },
        { path: '/quotation', label: 'Quotation', icon: 'FileText', roles: [ROLES.ADMIN] },
        { path: '/reports', label: 'Reports', icon: 'BarChart3', roles: [ROLES.ADMIN] },
        { path: '/users', label: 'User Management', icon: 'Users', roles: [ROLES.ADMIN] },
        { path: '/cms', label: 'Content CMS', icon: 'FileText', roles: [ROLES.ADMIN] },
        { path: '/locator-3d', label: '3D Locator', icon: 'Box', roles: [ROLES.ADMIN, ROLES.STOCK_CLERK] },
    ],
};

// Stockroom Configuration
export const STOCKROOM = {
    FLOORS: [
        { id: 1, label: 'Floor 1 - Sales Area' },
        { id: 2, label: 'Floor 2 - Stockroom' },
    ],
};

// Toast Configuration
export const TOAST = {
    DURATION: 4000,
    POSITION: 'top-right',
};

// File Upload
export const FILE_UPLOAD = {
    MAX_SIZE: 5 * 1024 * 1024, // 5MB
    ACCEPTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
};

// LocalStorage Keys
export const STORAGE_KEYS = {
    AUTH_TOKEN: 'limenserve_token',
    USER_DATA: 'limenserve_user',
    CART: 'limenserve_cart',
    THEME: 'limenserve_theme',
    SIDEBAR_COLLAPSED: 'limenserve_sidebar',
};
