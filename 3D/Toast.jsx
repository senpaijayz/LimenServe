import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

const Toast = ({ message, type = 'info', onClose, duration = 3000 }) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Trigger enter animation
        const timerIn = setTimeout(() => setIsVisible(true), 10);

        // Auto close
        const timerOut = setTimeout(() => {
            setIsVisible(false);
            setTimeout(onClose, 300); // Wait for exit animation
        }, duration);

        return () => {
            clearTimeout(timerIn);
            clearTimeout(timerOut);
        };
    }, [duration, onClose]);

    const getIcon = () => {
        switch (type) {
            case 'success': return <CheckCircle size={20} className="text-emerald-400" />;
            case 'error': return <XCircle size={20} className="text-red-400" />;
            case 'warning': return <Info size={20} className="text-amber-400" />;
            default: return <Info size={20} className="text-blue-400" />;
        }
    };

    const getBorderColor = () => {
        switch (type) {
            case 'success': return 'var(--color-success)';
            case 'error': return 'var(--color-error)';
            case 'warning': return 'var(--color-warning)';
            default: return 'var(--color-info)';
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: `translateX(-50%) translateY(${isVisible ? '0' : '-20px'})`,
            opacity: isVisible ? 1 : 0,
            transition: 'all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
            zIndex: 'var(--z-notification)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 20px',
            background: 'rgba(15, 23, 42, 0.9)', // Darker glass
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
            border: '1px solid var(--glass-border)',
            borderLeft: `4px solid ${getBorderColor()}`,
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            minWidth: '300px',
            maxWidth: '90vw'
        }}>
            <div style={{ flexShrink: 0 }}>
                {getIcon()}
            </div>
            <div style={{ flex: 1, color: 'var(--color-white)', fontSize: '0.95rem', fontWeight: 500 }}>
                {message}
            </div>
            <button
                onClick={() => {
                    setIsVisible(false);
                    setTimeout(onClose, 300);
                }}
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-gray-400)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                <X size={16} />
            </button>
        </div>
    );
};

export default Toast;
