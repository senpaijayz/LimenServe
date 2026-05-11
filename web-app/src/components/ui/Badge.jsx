/**
 * Badge Component
 * Status indicators with various color variants
 * 
 * @example
 * <Badge variant="success">Active</Badge>
 * <Badge variant="warning" dot>Low Stock</Badge>
 */
const Badge = ({
    children,
    variant = 'neutral',
    size = 'md',
    dot = false,
    className = '',
}) => {
    // Variant classes
    const variants = {
        success: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
        warning: 'border border-amber-200 bg-amber-50 text-amber-700',
        danger: 'border border-red-200 bg-red-50 text-red-700',
        info: 'border border-blue-200 bg-blue-50 text-blue-700',
        neutral: 'border border-primary-200 bg-primary-50 text-primary-600',
    };

    // Size classes
    const sizes = {
        sm: 'text-xs px-2 py-0.5',
        md: 'text-xs px-2.5 py-1',
        lg: 'text-sm px-3 py-1.5',
    };

    // Dot colors
    const dotColors = {
        success: 'bg-accent-success',
        warning: 'bg-accent-warning',
        danger: 'bg-accent-danger',
        info: 'bg-accent-info',
        neutral: 'bg-primary-400',
    };

    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full font-bold ${variants[variant]} ${sizes[size]} ${className}`}>
            {dot && (
                <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />
            )}
            {children}
        </span>
    );
};

/**
 * Role Badge Component
 * Specialized badge for user roles
 */
export const RoleBadge = ({ role }) => {
    const roleConfig = {
        admin: { label: 'Admin', variant: 'danger' },
        cashier: { label: 'Cashier', variant: 'info' },
        staff: { label: 'Clerk', variant: 'success' },
        stock_clerk: { label: 'Clerk', variant: 'success' },
    };

    const config = roleConfig[role] || roleConfig.stock_clerk;

    return (
        <Badge variant={config.variant}>
            {config.label}
        </Badge>
    );
};

/**
 * Status Badge Component
 * Specialized badge for order/service status
 */
export const StatusBadge = ({ status }) => {
    const statusConfig = {
        pending: { label: 'Pending', variant: 'warning' },
        in_progress: { label: 'In Progress', variant: 'info' },
        completed: { label: 'Completed', variant: 'success' },
        cancelled: { label: 'Cancelled', variant: 'danger' },
    };

    const config = statusConfig[status] || statusConfig.pending;

    return (
        <Badge variant={config.variant} dot>
            {config.label}
        </Badge>
    );
};

/**
 * Stock Level Badge
 * Shows stock status based on quantity
 */
export const StockBadge = ({ quantity, lowThreshold = 10, criticalThreshold = 5 }) => {
    const stockQuantity = Number(quantity ?? 0);
    let variant = 'success';
    let label = 'In Stock';

    if (stockQuantity <= 0) {
        variant = 'danger';
        label = 'Out of Stock';
    } else if (stockQuantity <= criticalThreshold) {
        variant = 'danger';
        label = 'Critical';
    } else if (stockQuantity <= lowThreshold) {
        variant = 'warning';
        label = 'Low Stock';
    }

    return (
        <Badge variant={variant} dot>
            {label}
        </Badge>
    );
};

export default Badge;
