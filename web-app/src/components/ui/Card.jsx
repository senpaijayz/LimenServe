import { motion } from 'framer-motion';

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
    const paddings = {
        none: '',
        sm: 'p-4',
        default: 'p-6',
        lg: 'p-8',
    };

    const cardClasses = [
        'surface',
        paddings[padding],
        hoverable ? 'transition-all duration-300 hover:-translate-y-1 hover:border-accent-info/18' : '',
        className,
    ].join(' ').trim();

    return (
        <motion.div
            className={cardClasses}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
            {...props}
        >
            {(title || headerAction) && (
                <div className="mb-5 flex items-start justify-between gap-4 border-b border-white/8 pb-4">
                    <div>
                        {title && <h3 className="text-lg font-semibold text-white">{title}</h3>}
                        {subtitle && <p className="mt-1 text-sm text-primary-400">{subtitle}</p>}
                    </div>
                    {headerAction && <div>{headerAction}</div>}
                </div>
            )}

            <div>{children}</div>

            {footer && (
                <div className="mt-5 border-t border-white/8 pt-4">
                    {footer}
                </div>
            )}
        </motion.div>
    );
};

export const KPICard = ({
    title,
    value,
    icon,
    trend,
    trendValue,
    className = '',
}) => {
    const trendTone = trend === 'up' ? 'text-accent-success' : 'text-accent-warning';
    const trendArrow = trend === 'up' ? '↑' : '→';

    return (
        <Card className={`overflow-hidden ${className}`} padding="default">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-500">{title}</p>
                    <p className="mt-4 text-3xl font-semibold text-white lg:text-[2.5rem]">{value}</p>
                    {trendValue && (
                        <div className={`mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] ${trend === 'up'
                            ? 'border-accent-success/20 bg-accent-success/10 text-accent-success'
                            : 'border-accent-warning/20 bg-accent-warning/10 text-accent-warning'
                            }`}
                        >
                            <span>{trendArrow}</span>
                            <span className={trendTone}>{trendValue}</span>
                        </div>
                    )}
                </div>
                {icon && (
                    <div className="flex h-14 w-14 items-center justify-center rounded-[22px] border border-accent-info/18 bg-accent-info/10 text-accent-info">
                        {icon}
                    </div>
                )}
            </div>
        </Card>
    );
};

export default Card;
