import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ConfirmDialog from '../components/ui/ConfirmDialog';

describe('ConfirmDialog', () => {
    it('exposes an accessible modal and requires an explicit confirmation', () => {
        const onConfirm = vi.fn();
        const onClose = vi.fn();

        render(
            <ConfirmDialog
                isOpen
                title="Cancel reservation?"
                message="Allocated stock will be released."
                confirmLabel="Cancel reservation"
                onConfirm={onConfirm}
                onClose={onClose}
            />
        );

        expect(screen.getByRole('dialog', { name: 'Cancel reservation?' })).toBeTruthy();
        expect(screen.getByText('Allocated stock will be released.')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Cancel reservation' }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('locks both actions while the confirmed mutation is running', () => {
        render(
            <ConfirmDialog
                isOpen
                title="Remove assignment?"
                message="Assignment history will be preserved."
                confirmLabel="Remove assignment"
                isLoading
                onConfirm={vi.fn()}
                onClose={vi.fn()}
            />
        );

        expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true);
        expect(screen.getByRole('button', { name: 'Working...' }).disabled).toBe(true);
    });
});
