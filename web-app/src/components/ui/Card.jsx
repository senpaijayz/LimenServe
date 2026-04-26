import { motion as Motion, useReducedMotion } from 'framer-motion';

/**
 * Card Component
 * A glassmorphic card container
 * 
 * @example
 * <Card title="Statistics" subtitle="Last 7 days">
 *   <p>Card content here</p>
 * </Card>
 */
const Card = ({
    children,
    title,
    subtitle,
    headerAction,
    footer,
    className = '',
    hoverable = false,
    padding = 'default',
    ...props
}) => {
    const shouldReduceMotion = useReducedMotion();

    // Padding classes
    const paddings = {
        none: '',
        sm: 'p-4',
        default: 'p-6',
        lg: 'p-8',
    };

    const cardClasses = `
    surface rounded-xl border border-primary-200 shadow-sm bg-white
    ${paddings[padding]}
    ${hoverable ? 'transition-all duration-300 hover:border-primary-300 hover:shadow-md cursor-pointer' : ''}
    ${className}
  `.trim().replace(/\s+/g, ' ');

    return (
        <Motion.div
            className={cardClasses}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={shouldReduceMotion ? undefined : { duration: 0.22 }}
            {...props}
        >
            {/* Header */}
            {(title || headerAction) && (
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-primary-200">
                    <div>
                        {title && <h3 className="text-lg font-semibold font-display text-primary-950">{title}</h3>}
                        {subtitle && <p className="text-sm text-primary-500 mt-0.5">{subtitle}</p>}
                    </div>
                    {headerAction && <div>{headerAction}</div>}
                </div>
            )}

            {/* Body */}
            <div className="card-content">
                {children}
            </div>

            {/* Footer */}
            {footer && (
                <div className="mt-4 pt-4 border-t border-primary-200">
                    {footer}
                </div>
            )}
        </Motion.div>
    );
};

/**
 * KPI Card Component
 * A specialized card for displaying key metrics
 */
export const KPICard = ({
    title,
    value,
    icon,
    trend,
    trendValue,
    accentColor = 'border-accent-blue',
    iconBg = 'bg-blue-50 text-accent-blue',
    className = '',
}) => {
    const isPositive = trend === 'up';

    return (
        <Card className={`kpi-card group border-l-4 ${accentColor} ${className}`} padding="default">
            <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm text-primary-500 font-medium tracking-wide uppercase">{title}</p>
                    <p className="mt-1 break-words text-2xl font-bold font-display leading-tight text-primary-950 lg:text-3xl">
                        {value}
                    </p>
                    {trendValue && (
                        <div className={`flex items-center gap-1 mt-2 text-sm font-medium tracking-wide ${isPositive ? 'text-accent-success' : 'text-accent-danger'}`}>
                            <span>{isPositive ? '↑' : '↓'}</span>
                            <span>{trendValue}</span>
                            <span className="text-primary-400 font-normal">vs last period</span>
                        </div>
                    )}
                </div>
                {icon && (
                    <div className={`p-3 rounded-xl border border-primary-100 ${iconBg}`}>
                        {icon}
                    </div>
                )}
            </div>
        </Card>
    );
};

export default Card;
