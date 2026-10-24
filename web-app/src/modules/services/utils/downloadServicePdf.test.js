import { beforeEach, describe, expect, it, vi } from 'vitest';

const { instances } = vi.hoisted(() => ({ instances: [] }));

vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor() {
      this.internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
      this.text = vi.fn();
      this.save = vi.fn();
      this.addPage = vi.fn();
      this.setFont = vi.fn();
      this.setFontSize = vi.fn();
      this.setTextColor = vi.fn();
      this.setDrawColor = vi.fn();
      this.line = vi.fn();
      this.splitTextToSize = (text) => [String(text)];
      instances.push(this);
    }
  },
}));

import { downloadServiceOrderPdf, downloadServiceReceiptPdf } from './downloadServicePdf';

const order = {
  id: 'order-1', orderNumber: 'SVC-100/2', customerName: 'Alex Cruz',
  vehicle: { year: 2020, make: 'Mitsubishi', model: 'Montero', plate: 'ABC 1234' },
  description: 'Change oil and inspect brakes',
};

describe('service PDF downloads', () => {
  beforeEach(() => { instances.length = 0; });

  it('saves a service order with its reference and itemized work', () => {
    downloadServiceOrderPdf({
      order, orderTotal: 1250, mechanicName: 'Sam',
      serviceItems: [{ itemName: 'Oil change', quantity: 1, unitPrice: 1000, lineTotal: 1000 }],
      partItems: [{ itemSku: 'ABC-1', itemName: 'Filter', quantity: 1, unitPrice: 250, lineTotal: 250 }],
    });
    const doc = instances.at(-1);
    expect(doc.save).toHaveBeenCalledWith('LimenServe_Service_Order_SVC-100-2.pdf');
    const printedText = doc.text.mock.calls.map(([value]) => String(value)).join(' ');
    expect(printedText).toContain('SERVICE ORDER');
    expect(printedText).toContain('ABC-1 - Filter');
    expect(printedText).toContain('PHP 1,250.00');
    expect(printedText).toContain('Unpaid');
  });

  it('saves the paid receipt using posted sale amounts rather than the order estimate', () => {
    downloadServiceReceiptPdf(order, {
      transaction_number: 'POS-42', payment_method: 'cash', created_at: '2026-10-25T04:00:00Z',
      total_amount: 520, cash_received: 600, change_due: 80,
      lines: [{ item_sku_snapshot: 'PART-7', item_name_snapshot: 'Brake pad', quantity: 2, unit_price: 260, line_total: 520 }],
    });
    const doc = instances.at(-1);
    expect(doc.save).toHaveBeenCalledWith('LimenServe_Service_Receipt_POS-42.pdf');
    const printedText = doc.text.mock.calls.map(([value]) => String(value)).join(' ');
    expect(printedText).toContain('SERVICE RECEIPT');
    expect(printedText).toContain('PART-7 - Brake pad');
    expect(printedText).toContain('TOTAL: PHP 520.00');
    expect(printedText).toContain('Cash received: PHP 600.00    Change: PHP 80.00');
  });

  it('does not offer a receipt before the sale is posted', () => {
    expect(() => downloadServiceReceiptPdf(order, null)).toThrow('No paid receipt');
    expect(instances).toHaveLength(0);
  });
});
