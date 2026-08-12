import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PublicQuoteLookupCard from '../modules/public/components/PublicQuoteLookupCard';

const createProps = (overrides = {}) => ({
    estimateNumber: '',
    onEstimateNumberChange: vi.fn(),
    phone: '',
    onPhoneChange: vi.fn(),
    onLookup: vi.fn(),
    loading: false,
    error: '',
    result: null,
    onPreviewPrint: vi.fn(),
    ...overrides,
});

describe('PublicQuoteLookupCard', () => {
    it('requires both lookup factors and keeps controls mobile-safe', () => {
        render(<PublicQuoteLookupCard {...createProps({ estimateNumber: 'EST-2026-100' })} />);

        const quoteInput = screen.getByRole('textbox', { name: 'Quote number' });
        const phoneInput = screen.getByRole('textbox', { name: 'Phone number used for quote' });
        const lookupButton = screen.getByRole('button', { name: 'Retrieve Quote' });
        const controls = screen.getByRole('group', { name: 'Quote lookup verification' });

        expect(quoteInput.required).toBe(true);
        expect(phoneInput.required).toBe(true);
        expect(phoneInput.getAttribute('inputmode')).toBe('tel');
        expect(lookupButton.disabled).toBe(true);
        expect(lookupButton.className).toContain('w-full');
        expect(controls.className).toContain('min-w-0');
        expect(controls.className).toContain('lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]');
    });

    it('forwards phone edits to its controlled input callback', () => {
        const onPhoneChange = vi.fn();
        render(<PublicQuoteLookupCard {...createProps({ onPhoneChange })} />);

        fireEvent.change(screen.getByRole('textbox', { name: 'Phone number used for quote' }), {
            target: { value: '+63 917 123 4567' },
        });

        expect(onPhoneChange).toHaveBeenCalledWith('+63 917 123 4567');
    });

    it('submits from the keyboard only when quote number and phone are present', () => {
        const onLookup = vi.fn();
        render(
            <PublicQuoteLookupCard
                {...createProps({
                    estimateNumber: 'EST-2026-100',
                    phone: '09171234567',
                    onLookup,
                })}
            />,
        );

        const lookupButton = screen.getByRole('button', { name: 'Retrieve Quote' });
        expect(lookupButton.disabled).toBe(false);

        fireEvent.keyDown(screen.getByRole('textbox', { name: 'Phone number used for quote' }), {
            key: 'Enter',
        });
        expect(onLookup).toHaveBeenCalledTimes(1);
    });
});
