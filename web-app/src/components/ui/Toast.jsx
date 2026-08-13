import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion as Motion, useReducedMotion } from 'framer-motion';
import {
    AlertCircle,
    AlertTriangle,
    CheckCircle2,
    Info,
    LoaderCircle,
    X,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { TOAST } from '../../utils/constants';

const ToastContext = createContext(null);
const MAX_VISIBLE_TOASTS = 4;

const TOAST_STYLES = {
    loading: {
        icon: LoaderCircle,
        iconClass: 'text-sky-600',
        iconSurface: 'bg-sky-50',
        surface: 'border-sky-200 bg-white',
        progress: 'bg-sky-500',
        role: 'status',
    },
    success: {
        icon: CheckCircle2,
        iconClass: 'text-emerald-600',
        iconSurface: 'bg-emerald-50',
        surface: 'border-emerald-200 bg-white',
        progress: 'bg-emerald-500',
        role: 'status',
    },
    error: {
        icon: AlertCircle,
        iconClass: 'text-rose-600',
        iconSurface: 'bg-rose-50',
        surface: 'border-rose-200 bg-white',
        progress: 'bg-rose-500',
        role: 'alert',
    },
    warning: {
        icon: AlertTriangle,
        iconClass: 'text-amber-600',
        iconSurface: 'bg-amber-50',
        surface: 'border-amber-200 bg-white',
        progress: 'bg-amber-500',
        role: 'alert',
    },
    info: {
        icon: Info,
        iconClass: 'text-indigo-600',
        iconSurface: 'bg-indigo-50',
        surface: 'border-indigo-200 bg-white',
        progress: 'bg-indigo-500',
        role: 'status',
    },
};

function getToastType(type) {
    return TOAST_STYLES[type] ? type : 'info';
}

function getMessage(message) {
    if (message instanceof Error) {
        return message.message;
    }

    return String(message ?? '');
}

function getDuration(type, duration) {
    if (duration !== undefined) {
        return Math.max(0, Number(duration) || 0);
    }

    return type === 'loading' ? 0 : TOAST.DURATION;
}

function resolveMessage(value, fallback, result) {
    if (typeof value === 'function') {
        return getMessage(value(result));
    }

    return getMessage(value ?? fallback);
}

/**
 * Shared feedback layer for the entire app.
 *
 * The promise helper keeps an in-progress toast alive and morphs it into a
 * success or error notification when the async operation settles.
 */
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const timersRef = useRef(new Map());

    const clearTimer = useCallback((id) => {
        const timer = timersRef.current.get(id);
        if (timer) {
            window.clearTimeout(timer);
            timersRef.current.delete(id);
        }
    }, []);

    const scheduleDismiss = useCallback((id, duration) => {
        clearTimer(id);
        if (duration > 0) {
            const timer = window.setTimeout(() => {
                setToasts((current) => current.filter((toast) => toast.id !== id));
                timersRef.current.delete(id);
            }, duration);
            timersRef.current.set(id, timer);
        }
    }, [clearTimer]);

    const removeToast = useCallback((id) => {
        clearTimer(id);
        setToasts((current) => current.filter((toast) => toast.id !== id));
    }, [clearTimer]);

    const updateToast = useCallback((id, updates = {}) => {
        setToasts((current) => current.map((toast) => {
            if (toast.id !== id) {
                return toast;
            }

            const type = getToastType(updates.type ?? toast.type);
            const duration = getDuration(type, updates.duration);
            return {
                ...toast,
                ...updates,
                message: updates.message === undefined ? toast.message : getMessage(updates.message),
                title: updates.title === undefined ? toast.title : getMessage(updates.title),
                type,
                duration,
            };
        }));

        const nextType = getToastType(updates.type ?? 'info');
        if (updates.duration !== undefined || nextType !== 'info') {
            scheduleDismiss(id, getDuration(nextType, updates.duration));
        }
    }, [scheduleDismiss]);

    const addToast = useCallback((message, options = {}) => {
        const type = getToastType(options.type);
        const duration = getDuration(type, options.duration);
        const id = options.id ?? (Date.now() + '-' + Math.random().toString(36).slice(2));
        const toast = {
            id,
            message: getMessage(message),
            title: options.title ? getMessage(options.title) : '',
            type,
            duration,
            dismissible: options.dismissible !== false,
        };

        setToasts((current) => [...current, toast].slice(-MAX_VISIBLE_TOASTS));
        scheduleDismiss(id, duration);
        return id;
    }, [scheduleDismiss]);

    const success = useCallback((message, options) => addToast(message, { ...options, type: 'success' }), [addToast]);
    const error = useCallback((message, options) => addToast(message, { ...options, type: 'error' }), [addToast]);
    const warning = useCallback((message, options) => addToast(message, { ...options, type: 'warning' }), [addToast]);
    const info = useCallback((message, options) => addToast(message, { ...options, type: 'info' }), [addToast]);
    const loading = useCallback((message, options) => addToast(message, { ...options, type: 'loading', duration: 0 }), [addToast]);

    const promise = useCallback(async (operation, messages = {}) => {
        const id = loading(messages.loading ?? 'Working...', { title: messages.loadingTitle });

        try {
            const result = await (typeof operation === 'function' ? operation() : operation);
            updateToast(id, {
                title: messages.successTitle ?? '',
                message: resolveMessage(messages.success, 'Completed successfully.', result),
                type: 'success',
                duration: messages.duration,
            });
            return result;
        } catch (operationError) {
            updateToast(id, {
                title: messages.errorTitle ?? '',
                message: resolveMessage(messages.error, operationError.message || 'Something went wrong.', operationError),
                type: 'error',
                duration: messages.duration,
            });
            throw operationError;
        }
    }, [loading, updateToast]);

    useEffect(() => () => {
        timersRef.current.forEach((timer) => window.clearTimeout(timer));
        timersRef.current.clear();
    }, []);

    const value = {
        toasts,
        addToast,
        removeToast,
        updateToast,
        promise,
        loading,
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

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

function ToastContainer({ toasts, removeToast }) {
    const shouldReduceMotion = useReducedMotion();

    if (typeof document === 'undefined') {
        return null;
    }

    return createPortal(
        <div
            aria-label="Notifications"
            className="pointer-events-none fixed inset-x-3 top-4 z-[200] flex justify-end sm:inset-x-6 sm:top-6"
            data-testid="toast-container"
        >
            <div className="flex w-full max-w-sm flex-col gap-3">
                <AnimatePresence initial={false} mode="popLayout">
                    {toasts.map((toast) => {
                        const style = TOAST_STYLES[getToastType(toast.type)];
                        const Icon = style.icon;
                        const isLoading = toast.type === 'loading';
                        const motionState = shouldReduceMotion
                            ? { opacity: 1 }
                            : { opacity: 1, x: 0, y: 0, scale: 1 };

                        return (
                            <Motion.div
                                animate={motionState}
                                className={'pointer-events-auto relative overflow-hidden rounded-2xl border shadow-[0_18px_42px_rgba(15,23,42,0.14)] backdrop-blur ' + style.surface}
                                data-toast-type={toast.type}
                                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 20, scale: 0.96 }}
                                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 24, y: -8, scale: 0.96 }}
                                key={toast.id}
                                layout
                                role={style.role}
                                transition={{ duration: shouldReduceMotion ? 0.01 : 0.24, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <div className="flex items-start gap-3 p-3.5">
                                    <span className={'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ' + style.iconSurface}>
                                        <Icon className={'h-5 w-5 ' + style.iconClass + (isLoading ? ' animate-spin' : '')} />
                                    </span>
                                    <div className="min-w-0 flex-1 pt-0.5">
                                        {toast.title && <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{toast.title}</p>}
                                        <p className="mt-0.5 text-sm font-semibold leading-5 text-slate-900">{toast.message}</p>
                                    </div>
                                    {toast.dismissible && (
                                        <button
                                            aria-label={'Dismiss notification: ' + toast.message}
                                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-indigo-400"
                                            onClick={() => removeToast(toast.id)}
                                            type="button"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                                {toast.duration > 0 && (
                                    <Motion.span
                                        aria-hidden="true"
                                        className={'absolute inset-x-0 bottom-0 h-0.5 origin-left ' + style.progress}
                                        initial={shouldReduceMotion ? { scaleX: 0 } : { scaleX: 1 }}
                                        animate={{ scaleX: 0 }}
                                        transition={{ duration: toast.duration / 1000, ease: 'linear' }}
                                    />
                                )}
                            </Motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </div>,
        document.body,
    );
}

export default ToastProvider;
