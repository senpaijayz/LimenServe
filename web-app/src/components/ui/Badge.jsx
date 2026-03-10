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
        success: 'badge-success',
        warning: 'badge-warning',
        danger: 'badge-danger',
        info: 'badge-info',
        neutral: 'badge-neutral',
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
        <span className={`badge ${variants[variant]} ${sizes[size]} ${className}`}>
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
        stock_clerk: { label: 'Stock Clerk', variant: 'success' },
        customer: { label: 'Customer', variant: 'neutral' },
    };

    const config = roleConfig[role] || roleConfig.customer;

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
    let variant = 'success';
    let label = 'In Stock';

    if (quantity === 0) {
        variant = 'danger';
        label = 'Out of Stock';
    } else if (quantity <= criticalThreshold) {
        variant = 'danger';
        label = 'Critical';
    } else if (quantity <= lowThreshold) {
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
