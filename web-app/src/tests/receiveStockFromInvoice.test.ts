import { describe, expect, it, vi } from 'vitest';
import {
  normalizeSupplierInvoicePayload,
  receiveStockFromSupplierInvoice,
  StockReceiptProcessingError,
} from '../modules/inventory/services/receiveStock';

describe('receiveStockFromSupplierInvoice', () => {
  it('normalizes invoice aliases and merges duplicate part numbers before posting', async () => {
    const postReceipt = vi.fn().mockResolvedValue({
      receiptId: 'receipt-1',
      supplierId: 'supplier-1',
      supplierName: 'Diamond Motor Corporation',
      invoiceNumber: 'INV-100',
      invoiceDate: '2026-05-19',
      totalLines: 1,
      totalQuantity: 5,
      totalCost: 700,
      items: [
        {
          lineNumber: 1,
          productId: 'product-1',
          partNumber: 'MD360935',
          description: 'FILTER, OIL',
          quantity: 5,
          unitCost: 140,
          previousStock: 2,
          updatedStock: 7,
          movementId: 'movement-1',
        },
      ],
    });

    const result = await receiveStockFromSupplierInvoice({
      invoice_no: 'INV-100',
      invoice_date: '2026-05-19',
      supplier: { name: 'Diamond Motor Corporation' },
      line_items: [
        { part_number: ' md360935 ', description: 'FILTER, OIL', quantity: 2, unit_cost: 100 },
        { part_number: '*MD360935*', description: 'FILTER, OIL', quantity: 3, unit_cost: 166.6667 },
      ],
    }, { postReceipt });

    expect(postReceipt).toHaveBeenCalledTimes(1);
    expect(postReceipt).toHaveBeenCalledWith(expect.objectContaining({
      invoiceNumber: 'INV-100',
      supplierName: 'Diamond Motor Corporation',
      items: [
        expect.objectContaining({
          partNumber: 'MD360935',
          quantity: 5,
          unitCost: 0,
        }),
      ],
    }));
    expect(result.receiptId).toBe('receipt-1');
  });

  it('throws a structured validation error when a received quantity is not positive', async () => {
    await expect(receiveStockFromSupplierInvoice({
      invoiceNumber: 'INV-101',
      invoiceDate: '2026-05-19',
      supplierName: 'Diamond Motor Corporation',
      items: [
        { partNumber: 'MR984204', description: 'ELEMENT, AIR CLEANER', quantity: 0, unitCost: 500 },
      ],
    }, { postReceipt: vi.fn() })).rejects.toMatchObject({
      name: 'StockReceiptProcessingError',
      issues: expect.arrayContaining([
        expect.objectContaining({
          partNumber: 'MR984204',
          message: expect.stringContaining('Quantity'),
        }),
      ]),
    });
  });

  it('exposes normalized payloads for future OCR flows without posting', () => {
    const normalized = normalizeSupplierInvoicePayload({
      invoiceNumber: 'INV-102',
      invoiceDate: '2026-05-19',
      supplierName: 'Diamond Motor Corporation',
      items: [
        { partNumber: 'MR984204', description: 'ELEMENT, AIR CLEANER', quantity: '4', unitCost: '500' },
      ],
    });

    expect(normalized.items).toEqual([
      expect.objectContaining({
        partNumber: 'MR984204',
        quantity: 4,
        unitCost: 0,
      }),
    ]);
  });

  it('uses a domain error type for clear caller handling', () => {
    const error = new StockReceiptProcessingError('Unable to post stock receipt.', [
      { message: 'Something failed.' },
    ]);

    expect(error.name).toBe('StockReceiptProcessingError');
    expect(error.issues[0].message).toBe('Something failed.');
  });
});
