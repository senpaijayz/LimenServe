import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../components/ui/CameraScannerModal', () => ({ default: ({ isOpen, onScan }) => isOpen ? <button onClick={() => onScan('MD094120')}>Detected fixture</button> : null }));
import { BulkItemRow } from '../modules/inventory/components/AddStockModal';

const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('receiving scanner lookup coordination', () => {
    it('shares camera lookup with the subsequent text debounce', async () => {
        vi.useFakeTimers(); const request = deferred(); const findProduct = vi.fn(() => request.promise); const onUpdate = vi.fn();
        render(<BulkItemRow item={{}} index={0} products={[]} onUpdate={onUpdate} onRemove={() => {}} findProduct={findProduct} />);
        fireEvent.click(screen.getByLabelText('Scan product barcode')); fireEvent.click(screen.getByText('Detected fixture'));
        await act(async () => { await vi.advanceTimersByTimeAsync(500); });
        expect(findProduct).toHaveBeenCalledTimes(1);
        await act(async () => request.resolve({ id: 'one', sku: 'MD094120' }));
        expect(onUpdate).toHaveBeenCalledTimes(1);
    });
    it('does not replace a newer selection with an older lookup response', async () => {
        vi.useFakeTimers(); const first = deferred(); const second = deferred(); const onUpdate = vi.fn();
        const findProduct = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        render(<BulkItemRow item={{}} index={0} products={[]} onUpdate={onUpdate} onRemove={() => {}} findProduct={findProduct} />);
        const input = screen.getByPlaceholderText('Scan barcode or type part number...');
        fireEvent.change(input, { target: { value: 'OLD' } }); await act(async () => { await vi.advanceTimersByTimeAsync(401); });
        fireEvent.change(input, { target: { value: 'NEW' } }); await act(async () => { await vi.advanceTimersByTimeAsync(401); });
        onUpdate.mockClear();
        await act(async () => second.resolve({ id: 'new', sku: 'NEW' }));
        await act(async () => first.resolve({ id: 'old', sku: 'OLD' }));
        expect(onUpdate).toHaveBeenCalledTimes(1);
        expect(onUpdate).toHaveBeenCalledWith(0, { product: { id: 'new', sku: 'NEW' }, searchQuery: 'NEW' });
    });
});
