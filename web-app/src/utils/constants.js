// Application constants for LimenServe

// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// User Roles
export const ROLES = {
    ADMIN: 'admin',
    CASHIER: 'cashier',
    STOCK_CLERK: 'stock_clerk',
};

// Role Display Names
export const ROLE_LABELS = {
    [ROLES.ADMIN]: 'Administrator',
    [ROLES.CASHIER]: 'Cashier',
    [ROLES.STOCK_CLERK]: 'Clerk',
};

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
        { path: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard', roles: [ROLES.ADMIN, ROLES.CASHIER, ROLES.STOCK_CLERK] },
        { path: '/pos', label: 'Point of Sale', icon: 'ShoppingCart', roles: [ROLES.ADMIN, ROLES.CASHIER] },
        { path: '/inventory', label: 'Inventory', icon: 'Package', roles: [ROLES.ADMIN, ROLES.STOCK_CLERK] },
        { path: '/quotation', label: 'Quotation', icon: 'FileText', roles: [ROLES.ADMIN, ROLES.CASHIER] },
        { path: '/services', label: 'Service Orders', icon: 'Wrench', roles: [ROLES.ADMIN, ROLES.CASHIER, ROLES.STOCK_CLERK] },
        { path: '/stockroom', label: '3D Stockroom', icon: 'Box', roles: [ROLES.ADMIN, ROLES.STOCK_CLERK] },
    ],
    admin: [
        { path: '/reports', label: 'Reports', icon: 'BarChart3', roles: [ROLES.ADMIN] },
        { path: '/users', label: 'User Management', icon: 'Users', roles: [ROLES.ADMIN] },
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
