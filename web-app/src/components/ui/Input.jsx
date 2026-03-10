import { forwardRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

/**
 * Input Component
 * A styled input field with label, error, and helper text support
 * 
 * @example
 * <Input label="Email" type="email" placeholder="Enter email" />
 * <Input label="Password" type="password" error="Password is required" />
 */
const Input = forwardRef(({
    label,
    type = 'text',
    placeholder,
    error,
    helperText,
    leftIcon,
    rightIcon,
    fullWidth = true,
    className = '',
    containerClassName = '',
    disabled = false,
    required = false,
    ...props
}, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    const isPassword = type === 'password';
    const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

    const inputClasses = `
    input
    ${error ? 'input-error' : ''}
    ${leftIcon ? 'pl-10' : ''}
    ${rightIcon || isPassword ? 'pr-10' : ''}
    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
    ${className}
  `.trim().replace(/\s+/g, ' ');

    return (
        <div className={`input-group ${fullWidth ? 'w-full' : ''} ${containerClassName}`}>
            {label && (
                <label className="input-label">
                    {label}
                    {required && <span className="text-accent-danger ml-1">*</span>}
                </label>
            )}

            <div className="relative">
                {leftIcon && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-500">
                        {leftIcon}
                    </span>
                )}

                <input
                    ref={ref}
                    type={inputType}
                    placeholder={placeholder}
                    disabled={disabled}
                    className={inputClasses}
                    {...props}
                />

                {isPassword ? (
                    <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-500 hover:text-primary-300 transition-colors"
                        onClick={() => setShowPassword(!showPassword)}
                        tabIndex={-1}
                    >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                ) : rightIcon ? (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-500">
                        {rightIcon}
                    </span>
                ) : null}
            </div>

            {error && <p className="input-error-text">{error}</p>}
            {helperText && !error && <p className="input-helper">{helperText}</p>}
        </div>
    );
});

Input.displayName = 'Input';

export default Input;
