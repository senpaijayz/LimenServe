import { z } from 'zod';
import type { SupplierInvoiceStockReceiptInput } from './types';

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => {
    const trimmed = String(value ?? '').trim();
    return trimmed.length > 0 ? trimmed : undefined;
  });

const positiveDecimal = (fieldName: string) => z.coerce
  .number({ error: `${fieldName} must be a number.` })
  .finite(`${fieldName} must be a valid number.`)
  .positive(`${fieldName} must be greater than zero.`);

const nonNegativeDecimal = (fieldName: string) => z.coerce
  .number({ error: `${fieldName} must be a number.` })
  .finite(`${fieldName} must be a valid number.`)
  .nonnegative(`${fieldName} cannot be negative.`);

export const supplierInvoiceLineItemSchema = z.object({
  lineId: optionalTrimmedString,
  partNumber: z
    .string()
    .trim()
    .min(1, 'Part number is required.')
    .transform((value) => value.toUpperCase().replace(/^\*+|\*+$/g, '').replace(/\s+/g, '')),
  description: z
    .string()
    .trim()
    .min(1, 'Description is required.'),
  quantity: positiveDecimal('Quantity'),
  unitCost: nonNegativeDecimal('Unit cost').default(0),
  uom: optionalTrimmedString.default('PC'),
  brand: optionalTrimmedString.default('Mitsubishi'),
});

export const supplierInvoiceHeaderSchema = z.object({
  invoiceNumber: z.string().trim().min(1, 'Invoice number is required.'),
  invoiceDate: z
    .string()
    .trim()
    .min(1, 'Invoice date is required.')
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00`)), 'Invoice date must be valid.'),
  supplierId: optionalTrimmedString,
  supplierCode: optionalTrimmedString,
  supplierName: z.string().trim().min(1, 'Supplier name is required.'),
  supplierContactName: optionalTrimmedString,
  supplierPhone: optionalTrimmedString,
  supplierEmail: optionalTrimmedString.refine(
    (value) => !value || z.email().safeParse(value).success,
    'Supplier email must be valid.',
  ),
  supplierAddress: optionalTrimmedString,
  poReference: optionalTrimmedString,
  notes: optionalTrimmedString,
  source: z.enum(['manual_invoice', 'ocr_upload', 'api_import']).default('manual_invoice'),
});

export const supplierInvoiceStockReceiptSchema = supplierInvoiceHeaderSchema
  .extend({
    items: z
      .array(supplierInvoiceLineItemSchema)
      .min(1, 'Add at least one invoice line item.'),
    ocrReady: z.boolean().optional().default(false),
    allowNewProducts: z.boolean().optional().default(true),
  }) satisfies z.ZodType<SupplierInvoiceStockReceiptInput>;

export type SupplierInvoiceLineItemFormValues = z.input<typeof supplierInvoiceLineItemSchema>;
export type SupplierInvoiceStockReceiptFormValues = z.input<typeof supplierInvoiceStockReceiptSchema>;

export function getSupplierInvoiceTotals(invoice: Pick<SupplierInvoiceStockReceiptInput, 'items'>) {
  return invoice.items.reduce(
    (totals, item) => ({
      totalLines: totals.totalLines + 1,
      totalQuantity: totals.totalQuantity + Number(item.quantity || 0),
      totalCost: totals.totalCost + Number(item.quantity || 0) * Number(item.unitCost || 0),
    }),
    {
      totalLines: 0,
      totalQuantity: 0,
      totalCost: 0,
    },
  );
}

export const DIAMOND_MOTOR_INVOICE_SAMPLE: SupplierInvoiceStockReceiptInput = {
  invoiceNumber: 'DMC-SAMPLE-0001',
  invoiceDate: new Date().toISOString().slice(0, 10),
  supplierName: 'Diamond Motor Corporation',
  source: 'manual_invoice',
  items: [
    {
      lineId: 'sample-1',
      partNumber: 'MD360935',
      description: 'FILTER, OIL',
      quantity: 12,
      unitCost: 285,
      uom: 'PC',
      brand: 'Mitsubishi',
    },
    {
      lineId: 'sample-2',
      partNumber: 'MR984204',
      description: 'ELEMENT, AIR CLEANER',
      quantity: 6,
      unitCost: 720,
      uom: 'PC',
      brand: 'Mitsubishi',
    },
  ],
};
