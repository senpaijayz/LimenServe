import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ToastProvider, useToast } from '../components/ui/Toast';

function ToastHarness() {
    const toast = useToast();
    const [loadingId, setLoadingId] = useState(null);

    return (
        <div>
            <button type="button" onClick={() => setLoadingId(toast.loading('Saving changes...'))}>Start saving</button>
            <button
                type="button"
                onClick={() => toast.updateToast(loadingId, {
                    duration: 0,
                    message: 'Changes saved.',
                    type: 'success',
                })}
            >
                Finish saving
            </button>
            <button type="button" onClick={() => toast.error('Could not save changes.', { duration: 0 })}>Show error</button>
        </div>
    );
}

describe('ToastProvider', () => {
    it('animates an in-progress toast into a success state', () => {
        render(
            <ToastProvider>
                <ToastHarness />
            </ToastProvider>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Start saving' }));
        expect(screen.getByRole('status').textContent).toContain('Saving changes...');
        expect(screen.getByRole('status').getAttribute('data-toast-type')).toBe('loading');

        fireEvent.click(screen.getByRole('button', { name: 'Finish saving' }));
        expect(screen.getByRole('status').textContent).toContain('Changes saved.');
        expect(screen.getByRole('status').getAttribute('data-toast-type')).toBe('success');
    });

    it('renders errors as assertive alert notifications', () => {
        render(
            <ToastProvider>
                <ToastHarness />
            </ToastProvider>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Show error' }));
        const alert = screen.getByRole('alert');
        expect(alert.textContent).toContain('Could not save changes.');
        expect(alert.getAttribute('data-toast-type')).toBe('error');
    });
});
