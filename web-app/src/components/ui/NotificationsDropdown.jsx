import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, AlertTriangle, Package, CheckCircle, Info, Wrench, X, Check } from 'lucide-react';

// Mock notifications
const initialNotifications = [
    {
        id: 1,
        type: 'warning',
        title: 'Low Stock Alert',
        message: 'Oil Filter - Montero Sport is running low (5 remaining)',
        time: new Date(Date.now() - 15 * 60000),
        read: false,
    },
    {
        id: 2,
        type: 'success',
        title: 'Sale Completed',
        message: 'Transaction #T-1234 completed successfully — ₱3,250.00',
        time: new Date(Date.now() - 45 * 60000),
        read: false,
    },
    {
        id: 3,
        type: 'info',
        title: 'Service Order Updated',
        message: 'SVC-001 has been marked as In Progress',
        time: new Date(Date.now() - 2 * 3600000),
        read: false,
    },
    {
        id: 4,
        type: 'warning',
        title: 'Low Stock Alert',
        message: 'Brake Pads Front - Mirage stock at 3 units',
        time: new Date(Date.now() - 4 * 3600000),
        read: true,
    },
    {
        id: 5,
        type: 'success',
        title: 'New Service Order',
        message: 'SVC-004 created for Ana Reyes — Wheel Alignment',
        time: new Date(Date.now() - 6 * 3600000),
        read: true,
    },
];

const typeIcons = {
    warning: AlertTriangle,
    success: CheckCircle,
    info: Info,
    error: AlertTriangle,
};

const typeColors = {
    warning: 'text-accent-warning bg-accent-warning/15',
    success: 'text-accent-success bg-accent-success/15',
    info: 'text-accent-info bg-accent-info/15',
    error: 'text-accent-danger bg-accent-danger/15',
};

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

/**
 * NotificationsDropdown
 * Dropdown panel for viewing and managing notifications
 */
const NotificationsDropdown = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState(initialNotifications);
    const dropdownRef = useRef(null);

    const unreadCount = notifications.filter(n => !n.read).length;

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const markAllRead = () => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    const markRead = (id) => {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    };

    const removeNotification = (id) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 rounded-lg hover:bg-primary-50 transition-colors border border-transparent hover:border-primary-200"
            >
                <Bell className="w-5 h-5 text-primary-400" />
                {unreadCount > 0 && (
                    <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-accent-blue rounded-full flex items-center justify-center border-2 border-white"
                    >
                        <span className="text-[10px] font-bold text-white">{unreadCount}</span>
                    </motion.span>
                )}
            </button>

            {/* Dropdown */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-2 w-96 max-h-[480px] overflow-hidden rounded-xl border border-primary-200 bg-white shadow-xl shadow-primary-950/5 z-50"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-primary-100 bg-primary-50">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-bold text-primary-950">Notifications</h3>
                                {unreadCount > 0 && (
                                    <span className="text-xs bg-accent-blue/10 text-accent-blue px-2 py-0.5 rounded-full font-bold">
                                        {unreadCount} new
                                    </span>
                                )}
                            </div>
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllRead}
                                    className="text-xs font-semibold text-accent-blue hover:underline flex items-center gap-1"
                                >
                                    <Check className="w-3 h-3" /> Mark all read
                                </button>
                            )}
                        </div>

                        {/* Notifications List */}
                        <div className="overflow-y-auto max-h-[380px]">
                            {notifications.length === 0 ? (
                                <div className="text-center py-12 px-4">
                                    <Bell className="w-10 h-10 text-primary-200 mx-auto mb-3" />
                                    <p className="text-sm font-medium text-primary-400">No notifications</p>
                                </div>
                            ) : (
                                notifications.map((notification) => {
                                    const Icon = typeIcons[notification.type] || Info;
                                    const colorClass = typeColors[notification.type] || typeColors.info;

                                    return (
                                        <div
                                            key={notification.id}
                                            className={`flex items-start gap-3 px-4 py-3 border-b border-primary-100 hover:bg-primary-50 cursor-pointer transition-colors ${!notification.read ? 'bg-accent-blue/5' : ''}`}
                                            onClick={() => markRead(notification.id)}
                                        >
                                            <div className={`p-1.5 rounded-lg flex-shrink-0 mt-0.5 ${colorClass}`}>
                                                <Icon className="w-3.5 h-3.5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <p className={`text-sm font-semibold ${!notification.read ? 'text-primary-950' : 'text-primary-600'}`}>
                                                        {notification.title}
                                                    </p>
                                                    {!notification.read && (
                                                        <span className="w-1.5 h-1.5 rounded-full bg-accent-blue flex-shrink-0" />
                                                    )}
                                                </div>
                                                <p className="text-xs text-primary-500 line-clamp-2">{notification.message}</p>
                                                <p className="text-[10px] font-medium text-primary-400 mt-1">{formatTimeAgo(notification.time)}</p>
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); removeNotification(notification.id); }}
                                                className="p-1 rounded hover:bg-primary-100 text-primary-300 hover:text-accent-danger flex-shrink-0 transition-colors"
                                            >
                                                <X className="w-3 h-3" />
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
