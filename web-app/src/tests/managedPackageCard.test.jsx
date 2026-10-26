import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ManagedPackageCard from '../modules/public/components/ManagedPackageCard';

describe('published package card', () => {
  it('switches the headline, complete contents and add action to the selected explicit variant', () => {
    const onAdd = vi.fn();
    const definition = { id: 'package', name: 'CMS package name', description: 'Saved customer description',
      eligibility: [{ id: 'rule', mode: 'universal', verified: true }],
      variants: [{ id: 'one', active: true }, { id: 'two', active: true }] };
    const prices = [{ variantId: 'one', label: 'Essential', packageTotal: 90, catalogTotal: 100, grandTotal: 100.8, savings: 10,
      availability: 'available', lines: [{ itemId: 'a', sku: 'PART-A', name: 'First part', quantity: 1, catalogTotal: 100, effectiveTotal: 90, savings: 10 }] },
    { variantId: 'two', label: 'Complete', packageTotal: 270, catalogTotal: 300, grandTotal: 302.4, savings: 30,
      availability: 'available', lines: [{ itemId: 'b', sku: 'PART-B', name: 'Second part', quantity: 3, catalogTotal: 300, effectiveTotal: 270, savings: 30 }] }];
    render(<ManagedPackageCard definition={definition} prices={prices} onAdd={onAdd} />);
    expect(screen.getByText('CMS package name')).toBeTruthy();
    expect(screen.getByText('PART-A')).toBeTruthy();
    expect(screen.getAllByText('₱90.00').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByRole('combobox', { name: 'Choose an option' }), { target: { value: 'two' } });
    expect(screen.queryByText('PART-A')).toBeNull();
    expect(screen.getByText('PART-B')).toBeTruthy();
    expect(screen.getAllByText('₱270.00').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Add package' }));
    expect(onAdd).toHaveBeenCalledWith(definition, prices[1]);
  });

  it('does not allow a missing-price offer to be added', () => {
    render(<ManagedPackageCard definition={{ name: 'Unavailable offer', variants: [{ id: 'one' }] }}
      prices={[{ variantId: 'one', valid: false, error: 'Missing current catalog price' }]} onAdd={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('Missing current catalog price');
    expect(screen.getByRole('button', { name: 'Add package' }).disabled).toBe(true);
  });
});
