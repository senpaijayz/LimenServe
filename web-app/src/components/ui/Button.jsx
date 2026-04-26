import { forwardRef } from 'react';
import { motion as Motion, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

/**
 * Button Component
 * A versatile button with multiple variants, sizes, and loading state
 * 
 * @example
 * <Button variant="primary" onClick={handleClick}>Submit</Button>
 * <Button variant="secondary" size="lg" isLoading>Processing</Button>
 * <Button variant="outline" leftIcon={<Plus />}>Add Item</Button>
 */
const Button = forwardRef(({
    children,
    variant = 'primary',
    size = 'md',
    isLoading = false,
    isDisabled = false,
    disabled = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    className = '',
    type = 'button',
    onClick,
    ...props
}, ref) => {
    const shouldReduceMotion = useReducedMotion();
    const isUnavailable = isDisabled || disabled || isLoading;

    // Variant classes
    const variants = {
        primary: 'btn-primary',
        secondary: 'btn-secondary',
        outline: 'btn-outline',
        ghost: 'btn-ghost',
        success: 'btn-success',
        warning: 'btn-warning',
        danger: 'btn-danger',
    };

    // Size classes
    const sizes = {
        sm: 'btn-sm',
        md: '',
        lg: 'btn-lg',
        icon: 'btn-icon',
    };

    const buttonClasses = `
    btn
    ${variants[variant] || variants.primary}
    ${sizes[size] || ''}
    ${fullWidth ? 'w-full' : ''}
    ${isUnavailable ? 'opacity-50 cursor-not-allowed' : ''}
    ${className}
  `.trim().replace(/\s+/g, ' ');

    return (
        <Motion.button
            ref={ref}
            type={type}
            className={buttonClasses}
            disabled={isUnavailable}
            onClick={onClick}
            whileTap={shouldReduceMotion || isUnavailable ? undefined : { scale: 0.98 }}
            {...props}
        >
            {isLoading ? (
                <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{children}</span>
                </>
            ) : (
                <>
                    {leftIcon && <span className="w-4 h-4">{leftIcon}</span>}
                    <span>{children}</span>
                    {rightIcon && <span className="w-4 h-4">{rightIcon}</span>}
                </>
            )}
        </Motion.button>
    );
});

Button.displayName = 'Button';

export default Button;
