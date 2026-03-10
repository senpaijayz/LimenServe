/**
 * Skeleton Component
 * Loading placeholder animations
 * 
 * @example
 * <Skeleton className="h-12 w-full" />
 * <Skeleton variant="circle" className="w-10 h-10" />
 */
const Skeleton = ({
    variant = 'rectangle',
    width,
    height,
    className = '',
}) => {
    const variants = {
        rectangle: 'rounded',
        rounded: 'rounded-lg',
        circle: 'rounded-full',
        text: 'rounded h-4',
    };

    const style = {
        width: width,
        height: height,
    };

    return (
        <div
            className={`skeleton ${variants[variant]} ${className}`}
            style={style}
        />
    );
};

/**
 * Skeleton Text
 * Multiple lines of skeleton text
 */
export const SkeletonText = ({ lines = 3, className = '' }) => {
    return (
        <div className={`space-y-2 ${className}`}>
            {[...Array(lines)].map((_, i) => (
                <Skeleton
                    key={i}
                    variant="text"
                    className={i === lines - 1 ? 'w-3/4' : 'w-full'}
                />
            ))}
        </div>
    );
};

/**
 * Skeleton Card
 * A card-shaped skeleton
 */
export const SkeletonCard = ({ className = '' }) => {
    return (
        <div className={`glass-card space-y-4 ${className}`}>
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
        </div>
    );
};

/**
 * Skeleton Table Row
 * Table row loading state
 */
export const SkeletonTableRow = ({ columns = 4, className = '' }) => {
    return (
        <tr className={className}>
            {[...Array(columns)].map((_, i) => (
                <td key={i} className="px-4 py-3">
                    <Skeleton className="h-4 w-full" />
                </td>
            ))}
        </tr>
    );
};

export default Skeleton;
