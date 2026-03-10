import { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { createPortal } from 'react-dom';
import { TOAST } from '../../utils/constants';

// Toast Context
const ToastContext = createContext(null);

/**
 * Toast Provider Component
 */
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, options = {}) => {
        const id = Date.now() + Math.random();
        const toast = {
            id,
            message,
            type: options.type || 'info',
            duration: options.duration || TOAST.DURATION,
        };

        setToasts(prev => [...prev, toast]);

        // Auto dismiss
        if (toast.duration > 0) {
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, toast.duration);
        }

        return id;
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // Convenience methods
    const success = useCallback((message, options) => {
        return addToast(message, { ...options, type: 'success' });
    }, [addToast]);

    const error = useCallback((message, options) => {
        return addToast(message, { ...options, type: 'error' });
    }, [addToast]);

    const warning = useCallback((message, options) => {
        return addToast(message, { ...options, type: 'warning' });
    }, [addToast]);

    const info = useCallback((message, options) => {
        return addToast(message, { ...options, type: 'info' });
    }, [addToast]);

    const value = {
        toasts,
        addToast,
        removeToast,
        success,
        error,
        warning,
        info,
    };

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </ToastContext.Provider>
    );
}

/**
 * Hook to use toast
 */
export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

/**
 * Toast Container Component
 */
function ToastContainer({ toasts, removeToast }) {
    const icons = {
        success: <CheckCircle className="w-5 h-5 text-accent-success" />,
        error: <AlertCircle className="w-5 h-5 text-accent-danger" />,
        warning: <AlertTriangle className="w-5 h-5 text-accent-warning" />,
        info: <Info className="w-5 h-5 text-accent-info" />,
    };

    const variants = {
        success: 'toast-success',
        error: 'toast-error',
        warning: 'toast-warning',
        info: 'toast-info',
    };

    return createPortal(
        <div className="toast-container">
            <AnimatePresence>
                {toasts.map((toast) => (
                    <motion.div
                        key={toast.id}
                        className={`toast ${variants[toast.type]}`}
                        initial={{ opacity: 0, y: -20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                    >
                        {icons[toast.type]}
                        <p className="flex-1 text-sm text-primary-100">{toast.message}</p>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="p-1 rounded hover:bg-primary-700/50 transition-colors"
                        >
                            <X className="w-4 h-4 text-primary-400" />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>,
        document.body
    );
}

export default ToastProvider;
