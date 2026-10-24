import { useEffect, useCallback, useRef } from 'react';
import { motion as Motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

// Scanner dialogs may be nested over stock receiving. Closing the scanner
// must not unlock background scrolling while another dialog is still open.
let openModalCount = 0;
let previousBodyOverflow = '';

/**
 * Modal Component
 * A centered overlay modal with backdrop blur
 * 
 * @example
 * <Modal isOpen={isOpen} onClose={handleClose} title="Confirm Action">
 *   <p>Are you sure you want to proceed?</p>
 * </Modal>
 */
const Modal = ({
    isOpen,
    onClose,
    title,
    children,
    size = 'md',
    showCloseButton = true,
    closeOnBackdrop = true,
    closeOnEscape = true,
    footer,
    className = '',
}) => {
    const modalRef = useRef(null);
    const onCloseRef = useRef(onClose);
    const shouldReduceMotion = useReducedMotion();

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    // Handle escape key
    const handleEscape = useCallback((e) => {
        if (e.key === 'Escape' && closeOnEscape && modalRef.current?.contains(document.activeElement)) {
            onCloseRef.current();
        }
    }, [closeOnEscape]);

    useEffect(() => {
        if (isOpen) {
            const previousFocus = document.activeElement;
            const modalElement = modalRef.current;
            const trapFocus = (event) => {
                if (event.key !== 'Tab' || !modalElement) return;
                const controls = [...modalElement.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter((el) => el.getClientRects().length);
                const first = controls[0], last = controls.at(-1);
                if (!first) { event.preventDefault(); return; }
                if (event.shiftKey && (document.activeElement === first || document.activeElement === modalElement)) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            };
            modalElement?.addEventListener('keydown', trapFocus);
            document.addEventListener('keydown', handleEscape);
            if (openModalCount++ === 0) previousBodyOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            const focusFrame = window.requestAnimationFrame(() => {
                modalRef.current?.focus();
            });
            return () => {
                window.cancelAnimationFrame(focusFrame);
                document.removeEventListener('keydown', handleEscape);
                modalElement?.removeEventListener('keydown', trapFocus);
                if (previousFocus?.isConnected) previousFocus.focus();
                if (--openModalCount === 0) document.body.style.overflow = previousBodyOverflow;
            };
        }
    }, [isOpen, handleEscape]);

    // Handle backdrop click
    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget && closeOnBackdrop) {
            onClose();
        }
    };

    // Size classes
    const sizes = {
        sm: 'max-w-sm',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl',
        full: 'max-w-[90vw]',
    };

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <Motion.div
                    className="modal-overlay"
                    initial={shouldReduceMotion ? false : { opacity: 0 }}
                    animate={shouldReduceMotion ? undefined : { opacity: 1 }}
                    exit={shouldReduceMotion ? undefined : { opacity: 0 }}
                    onClick={handleBackdropClick}
                >
                    <Motion.div
                        ref={modalRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label={typeof title === 'string' ? title : 'Dialog'}
                        tabIndex={-1}
                        className={`modal ${sizes[size]} ${className}`}
                        initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.96, y: 16 }}
                        animate={shouldReduceMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
                        exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.96, y: 16 }}
                        transition={shouldReduceMotion ? undefined : { duration: 0.18 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        {(title || showCloseButton) && (
                            <div className="modal-header">
                                {title && <h2 className="modal-title">{title}</h2>}
                                {showCloseButton && (
                                    <button
                                        onClick={onClose}
                                        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700 transition-colors hover:border-red-300 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                                        aria-label="Close modal"
                                        type="button"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Body */}
                        <div className="modal-body">
                            {children}
                        </div>

                        {/* Footer */}
                        {footer && (
                            <div className="modal-footer">
                                {footer}
                            </div>
                        )}
                    </Motion.div>
                </Motion.div>
            )}
        </AnimatePresence>
    );

    // Use portal to render at document root
    return createPortal(modalContent, document.body);
};

export default Modal;
