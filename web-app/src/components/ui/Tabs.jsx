import { useState } from 'react';
import { motion as Motion, useReducedMotion } from 'framer-motion';

/**
 * Tabs Component
 * Tabbed navigation with panels
 * 
 * @example
 * <Tabs
 *   tabs={[
 *     { id: 'overview', label: 'Overview', content: <Overview /> },
 *     { id: 'details', label: 'Details', content: <Details /> },
 *   ]}
 * />
 */
const Tabs = ({
    tabs = [],
    defaultTab,
    variant = 'default',
    onChange,
    className = '',
}) => {
    const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);
    const shouldReduceMotion = useReducedMotion();

    const handleTabChange = (tabId) => {
        setActiveTab(tabId);
        onChange?.(tabId);
    };

    // Variant styles
    const tabStyles = {
        default: {
            container: 'border-b border-primary-700',
            tab: 'px-4 py-3 text-sm font-medium transition-colors',
            active: 'text-accent-primary border-b-2 border-accent-primary -mb-px',
            inactive: 'text-primary-400 hover:text-primary-200',
        },
        pills: {
            container: 'bg-primary-800/50 rounded-lg p-1 inline-flex',
            tab: 'px-4 py-2 text-sm font-medium rounded-md transition-all',
            active: 'bg-accent-primary text-white shadow',
            inactive: 'text-primary-400 hover:text-primary-100 hover:bg-primary-700/50',
        },
        underline: {
            container: 'space-x-8',
            tab: 'pb-3 text-sm font-medium transition-colors relative',
            active: 'text-primary-100',
            inactive: 'text-primary-400 hover:text-primary-200',
        },
    };

    const styles = tabStyles[variant];
    const activeTabData = tabs.find(t => t.id === activeTab);

    return (
        <div className={className}>
            {/* Tab List */}
            <div className={`flex max-w-full overflow-x-auto overscroll-x-contain ${styles.container}`}>
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id)}
                        disabled={tab.disabled}
                        className={`
              ${styles.tab}
              min-h-11 shrink-0 whitespace-nowrap
              ${activeTab === tab.id ? styles.active : styles.inactive}
              ${tab.disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
                    >
                        <span className="flex items-center gap-2">
                            {tab.icon}
                            {tab.label}
                            {tab.badge && (
                                <span className="px-1.5 py-0.5 text-xs bg-accent-primary/20 text-accent-primary rounded-full">
                                    {tab.badge}
                                </span>
                            )}
                        </span>

                        {/* Animated underline for underline variant */}
                        {variant === 'underline' && activeTab === tab.id && (
                            <Motion.div
                                layoutId="tab-underline"
                                className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary"
                            />
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Panel */}
            <div className="mt-4">
                <Motion.div
                    key={activeTab}
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                    animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                    transition={shouldReduceMotion ? undefined : { duration: 0.16 }}
                >
                    {activeTabData?.content}
                </Motion.div>
            </div>
        </div>
    );
};

export default Tabs;
