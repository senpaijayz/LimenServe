import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SaleReceiptPreview from '../modules/pos/components/SaleReceiptPreview';
vi.mock('../services/cmsApi', () => ({ getPublicCmsSite: vi.fn().mockResolvedValue({settings:{company_name:'Limen Approved Name',address:'Approved address',primary_phone:'Approved phone'}}) }));
afterEach(cleanup);
it('uses saved business settings and never prints the placeholder TIN', async () => {
    render(<SaleReceiptPreview receipt={{items:[],total:0}} />);
    await screen.findByText('Limen Approved Name');
    expect(screen.getByText('Approved address')).toBeTruthy();
    expect(screen.queryByText(/000-123-456/)).toBeNull();
});
