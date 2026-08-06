import Modal from './Modal';
import Button from './Button';

const ConfirmDialog = ({
    isOpen,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    confirmVariant = 'danger',
    isLoading = false,
    onConfirm,
    onClose,
}) => (
    <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        size="sm"
        showCloseButton={false}
        closeOnBackdrop={!isLoading}
        closeOnEscape={!isLoading}
        footer={(
            <>
                <Button variant="secondary" onClick={onClose} isDisabled={isLoading}>
                    {cancelLabel}
                </Button>
                <Button
                    variant={confirmVariant}
                    onClick={onConfirm}
                    isLoading={isLoading}
                    loadingLabel="Working..."
                    autoFocus
                >
                    {confirmLabel}
                </Button>
            </>
        )}
    >
        <p className="text-sm leading-6 text-primary-700">{message}</p>
    </Modal>
);

export default ConfirmDialog;
