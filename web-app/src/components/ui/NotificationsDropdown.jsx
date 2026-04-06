import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Check, Info, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useExperienceStore from '../../store/useExperienceStore';

const toneClassMap = {
    live: 'border-accent-info/20 bg-accent-info/10 text-accent-info',
    alert: 'border-accent-warning/20 bg-accent-warning/10 text-accent-warning',
    success: 'border-accent-success/20 bg-accent-success/10 text-accent-success',
    neutral: 'border-white/10 bg-white/[0.05] text-primary-300',
};

const NotificationsDropdown = () => {
    const navigate = useNavigate();
    const dropdownRef = useRef(null);
    const { activityFeed } = useExperienceStore();
    const [isOpen, setIsOpen] = useState(false);
    const [readIds, setReadIds] = useState([]);
    const [dismissedIds, setDismissedIds] = useState([]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const notifications = useMemo(
        () => activityFeed.filter((item) => !dismissedIds.includes(item.id)).slice(0, 8),
        [activityFeed, dismissedIds],
    );

    const unreadCount = notifications.filter((item) => !readIds.includes(item.id)).length;

    const markAllRead = () => setReadIds(notifications.map((item) => item.id));

    const openNotification = (item) => {
        setReadIds((current) => [...new Set([...current, item.id])]);
        setIsOpen(false);
        navigate(item.route);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setIsOpen((current) => !current)}
                className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-primary-300 transition hover:border-accent-info/20 hover:text-white"
                aria-label="Open notifications"
            >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                    <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute right-1.5 top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-info px-1 text-[10px] font-bold text-primary-950"
                    >
                        {unreadCount}
                    </motion.span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.98 }}
                        transition={{ duration: 0.16 }}
                        className="absolute right-0 top-full z-50 mt-3 w-[24rem] overflow-hidden rounded-[28px] border border-white/10 bg-primary-950/96 shadow-[0_30px_90px_rgba(2,8,23,0.72)]"
                    >
                        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                            <div>
                                <p className="text-sm font-semibold text-white">Notifications</p>
                                <p className="mt-1 text-xs text-primary-500">Operational cues pulled from the latest workspace signals.</p>
                            </div>
                            {unreadCount > 0 && (
                                <button
                                    type="button"
                                    onClick={markAllRead}
                                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-primary-300"
                                >
                                    <Check className="h-3.5 w-3.5" />
                                    Read all
                                </button>
                            )}
                        </div>

                        <div className="max-h-[26rem] overflow-y-auto px-3 py-3">
                            {notifications.length > 0 ? notifications.map((item) => {
                                const Icon = item.icon || Info;
                                const isRead = readIds.includes(item.id);

                                return (
                                    <div
                                        key={item.id}
                                        className={`mb-2 rounded-[24px] border px-4 py-4 transition ${isRead
                                            ? 'border-white/8 bg-white/[0.03]'
                                            : 'border-accent-info/16 bg-accent-info/8'
                                            }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <button
                                                type="button"
                                                onClick={() => openNotification(item)}
                                                className="flex min-w-0 flex-1 items-start gap-3 text-left"
                                            >
                                                <span className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border ${toneClassMap[item.tone] || toneClassMap.neutral}`}>
                                                    <Icon className="h-4 w-4" />
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="flex items-center gap-2">
                                                        <span className="truncate text-sm font-semibold text-white">{item.title}</span>
                                                        {!isRead && <Sparkles className="h-3.5 w-3.5 text-accent-info" />}
                                                    </span>
                                                    <span className="mt-1 block text-sm text-primary-400">{item.detail}</span>
                                                    <span className="mt-3 block text-[11px] uppercase tracking-[0.18em] text-primary-500">{item.tag}</span>
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDismissedIds((current) => [...current, item.id])}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-primary-500 transition hover:bg-white/[0.05] hover:text-white"
                                                aria-label="Dismiss notification"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
                                    <Bell className="h-10 w-10 text-primary-500" />
                                    <p className="mt-4 text-sm font-semibold text-white">No new signals right now</p>
                                    <p className="mt-2 text-sm text-primary-400">
                                        Activity notifications will appear here as stock, sales, and quotation data refresh.
                                    </p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default NotificationsDropdown;
