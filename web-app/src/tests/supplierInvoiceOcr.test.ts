import { describe, expect, it } from 'vitest';
import {
  DIAMOND_INVOICE_SAMPLE_TEXT,
  parseSupplierInvoiceText,
} from '../modules/inventory/utils/invoiceOcr';

describe('parseSupplierInvoiceText', () => {
  it('detects Diamond parts invoice header and received quantities', () => {
    const invoice = parseSupplierInvoiceText(DIAMOND_INVOICE_SAMPLE_TEXT);

    expect(invoice.supplierName).toBe('Diamond Motor Corporation');
    expect(invoice.invoiceNumber).toBe('PSI-HO-A0089610');
    expect(invoice.orderNumber).toBe('PRS-HO-A0068334');
    expect(invoice.invoiceDate).toBe('2026-04-17');
    expect(invoice.items).toEqual([
      expect.objectContaining({ partNumber: 'MN171315', quantity: 1 }),
      expect.objectContaining({ partNumber: '1120A377', quantity: 2 }),
      expect.objectContaining({ partNumber: '54500W070P', quantity: 1 }),
      expect.objectContaining({ partNumber: 'MR446308', quantity: 3 }),
      expect.objectContaining({ partNumber: 'CW774278', quantity: 1 }),
      expect.objectContaining({ partNumber: '1801A079', quantity: 5 }),
      expect.objectContaining({ partNumber: 'MD050127', quantity: 5 }),
      expect.objectContaining({ partNumber: '1130A230', quantity: 3 }),
      expect.objectContaining({ partNumber: '1741B248', quantity: 2 }),
    ]);
  });
});
