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
    const variants = {
        success: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
        warning: 'border border-amber-200 bg-amber-50 text-amber-700',
        danger: 'border border-red-200 bg-red-50 text-red-700',
        info: 'border border-blue-200 bg-blue-50 text-blue-700',
        neutral: 'border border-primary-200 bg-primary-50 text-primary-600',
    };

    const sizes = {
        sm: 'text-xs px-2 py-0.5',
        md: 'text-xs px-2.5 py-1',
        lg: 'text-sm px-3 py-1.5',
    };

    const dotColors = {
        success: 'bg-emerald-500',
        warning: 'bg-amber-500',
        danger: 'bg-red-500',
        info: 'bg-blue-500',
        neutral: 'bg-primary-400',
    };

    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full font-bold ${variants[variant]} ${sizes[size]} ${className}`}>
            {dot && (
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColors[variant]}`} />
            )}
            {children}
        </span>
    );
};

/**
 * Role Badge Component
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
 * Stock Level Badge — Color coded:
 *  🟢 In Stock   (qty > lowThreshold)
 *  🟡 Low Stock  (qty 1 – lowThreshold)
 *  🔴 Out of Stock (qty 0)
 */
export const StockBadge = ({ quantity, lowThreshold = 10 }) => {
    const qty = Number(quantity ?? 0);

    if (qty <= 0) {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 font-bold text-xs px-2.5 py-1 text-red-700">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-red-500" />
                Out of Stock
            </span>
        );
    }

    if (qty <= lowThreshold) {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 font-bold text-xs px-2.5 py-1 text-amber-700">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-amber-500" />
                Low Stock
            </span>
        );
    }

    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 font-bold text-xs px-2.5 py-1 text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-emerald-500" />
            In Stock
        </span>
    );
};

export default Badge;
