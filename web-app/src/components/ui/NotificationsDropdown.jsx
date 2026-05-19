import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Bell, Check, FileText, Info, LoaderCircle, X } from 'lucide-react';
import {
    dismissNotification,
    getAdminNotifications,
    markAllNotificationsRead,
    markNotificationRead,
} from '../../services/notificationsApi';

const typeIcons = {
    error: AlertTriangle,
    info: FileText,
    quotation: FileText,
    success: Check,
    warning: AlertTriangle,
};

const typeColors = {
    error: 'text-accent-danger bg-accent-danger/15',
    info: 'text-accent-info bg-accent-info/15',
    quotation: 'text-accent-blue bg-accent-blue/15',
    success: 'text-accent-success bg-accent-success/15',
    warning: 'text-accent-warning bg-accent-warning/15',
};

function formatTimeAgo(value) {
    const date = new Date(value);
    const seconds = Math.floor((new Date() - date) / 1000);

    if (!Number.isFinite(seconds)) return 'just now';
    if (seconds < 60) return 'just now';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

const NotificationsDropdown = () => {
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const dropdownRef = useRef(null);

    const unreadCount = notifications.filter((notification) => !notification.read).length;

    const loadNotifications = useCallback(async ({ quiet = false } = {}) => {
        if (!quiet) {
            setIsLoading(true);
        }
        setError('');

        try {
            const data = await getAdminNotifications({ category: 'quotation', limit: 20 });
            setNotifications(data.notifications ?? []);
        } catch (loadError) {
            setError(loadError.message || 'Unable to load notifications.');
        } finally {
            if (!quiet) {
                setIsLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        void loadNotifications({ quiet: true });
        const timer = window.setInterval(() => {
            void loadNotifications({ quiet: true });
        }, 60000);

        return () => window.clearInterval(timer);
    }, [loadNotifications]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const openDropdown = () => {
        const nextOpen = !isOpen;
        setIsOpen(nextOpen);

        if (nextOpen) {
            void loadNotifications();
        }
    };

    const markAllRead = async () => {
        await markAllNotificationsRead();
        setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
    };

    const openNotification = async (notification) => {
        if (!notification.read) {
            const updated = await markNotificationRead(notification.id);
            setNotifications((current) => current.map((item) => (
                item.id === notification.id ? { ...item, ...(updated ?? {}), read: true } : item
            )));
        }

        if (notification.targetPath) {
            setIsOpen(false);
            navigate(notification.targetPath);
        }
    };

    const removeNotification = async (notificationId) => {
        await dismissNotification(notificationId);
        setNotifications((current) => current.filter((notification) => notification.id !== notificationId));
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                onClick={openDropdown}
                className="relative rounded-lg border border-transparent p-2 transition-colors hover:border-primary-200 hover:bg-primary-50"
                aria-label="Open quotation notifications"
            >
                <Bell className="h-5 w-5 text-primary-400" />
                {unreadCount > 0 && (
                    <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-accent-blue"
                    >
                        <span className="text-[10px] font-bold text-white">{unreadCount}</span>
                    </motion.span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full z-50 mt-2 max-h-[480px] w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-primary-200 bg-white shadow-xl shadow-primary-950/5"
                    >
                        <div className="flex items-center justify-between border-b border-primary-100 bg-primary-50 px-4 py-3">
                            <div className="min-w-0">
                                <h3 className="text-sm font-bold text-primary-950">Quotation Notifications</h3>
                                <p className="text-xs text-primary-500">Public quote requests from customers</p>
                            </div>
                            {unreadCount > 0 && (
                                <button
                                    type="button"
                                    onClick={markAllRead}
                                    className="flex items-center gap-1 text-xs font-semibold text-accent-blue hover:underline"
                                >
                                    <Check className="h-3 w-3" /> Mark all read
                                </button>
                            )}
                        </div>

                        <div className="max-h-[380px] overflow-y-auto">
                            {isLoading ? (
                                <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm font-semibold text-primary-500">
                                    <LoaderCircle className="h-4 w-4 animate-spin" />
                                    Loading quotations
                                </div>
                            ) : error ? (
                                <div className="px-4 py-6 text-sm text-accent-danger">{error}</div>
                            ) : notifications.length === 0 ? (
                                <div className="px-4 py-12 text-center">
                                    <Bell className="mx-auto mb-3 h-10 w-10 text-primary-200" />
                                    <p className="text-sm font-medium text-primary-400">No public quotation notifications yet</p>
                                </div>
                            ) : (
                                notifications.map((notification) => {
                                    const Icon = typeIcons[notification.category] || typeIcons[notification.type] || Info;
                                    const colorClass = typeColors[notification.category] || typeColors[notification.type] || typeColors.info;

                                    return (
                                        <div
                                            key={notification.id}
                                            className={`flex cursor-pointer items-start gap-3 border-b border-primary-100 px-4 py-3 transition-colors hover:bg-primary-50 ${!notification.read ? 'bg-accent-blue/5' : ''}`}
                                            onClick={() => openNotification(notification)}
                                        >
                                            <div className={`mt-0.5 flex-shrink-0 rounded-lg p-1.5 ${colorClass}`}>
                                                <Icon className="h-3.5 w-3.5" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="mb-0.5 flex items-center gap-2">
                                                    <p className={`truncate text-sm font-semibold ${!notification.read ? 'text-primary-950' : 'text-primary-600'}`}>
                                                        {notification.title}
                                                    </p>
                                                    {!notification.read && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-blue" />}
                                                </div>
                                                <p className="line-clamp-2 text-xs text-primary-500">{notification.message}</p>
                                                <p className="mt-1 text-[10px] font-medium text-primary-400">{formatTimeAgo(notification.createdAt)}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    void removeNotification(notification.id);
                                                }}
                                                className="flex-shrink-0 rounded p-1 text-primary-300 transition-colors hover:bg-primary-100 hover:text-accent-danger"
                                                aria-label="Dismiss notification"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default NotificationsDropdown;
