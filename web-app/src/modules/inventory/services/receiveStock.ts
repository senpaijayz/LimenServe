import apiClient, { INVENTORY_API_TIMEOUT_MS, clearApiClientCache, extractApiError } from '../../../services/apiClient';
import {
  supplierInvoiceStockReceiptSchema,
  type SupplierInvoiceStockReceiptFormValues,
} from '../schemas';
import type {
  StockReceiptPostResult,
  SupplierInvoiceLineItem,
  SupplierInvoiceStockReceiptInput,
} from '../types';

type FlexibleSupplier = {
  id?: string | null;
  code?: string | null;
  name?: string | null;
  contactName?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

type FlexibleInvoiceLineItem = Partial<SupplierInvoiceLineItem> & {
  part_number?: unknown;
  qty?: unknown;
  unit_cost?: unknown;
};

export type FlexibleSupplierInvoicePayload = Partial<SupplierInvoiceStockReceiptFormValues> & {
  invoice_no?: unknown;
  invoice_date?: unknown;
  order_no?: unknown;
  po_reference?: unknown;
  supplier?: FlexibleSupplier | string | null;
  supplier_id?: unknown;
  supplier_name?: unknown;
  line_items?: FlexibleInvoiceLineItem[];
  items?: FlexibleInvoiceLineItem[];
};

export interface StockReceiptProcessingIssue {
  partNumber?: string;
  path?: Array<string | number>;
  message: string;
}

export interface ReceiveStockFromSupplierInvoiceOptions {
  postReceipt?: (payload: SupplierInvoiceStockReceiptInput) => Promise<StockReceiptPostResult>;
}

export class StockReceiptProcessingError extends Error {
  issues: StockReceiptProcessingIssue[];

  constructor(message: string, issues: StockReceiptProcessingIssue[] = []) {
    super(message);
    this.name = 'StockReceiptProcessingError';
    this.issues = issues;
  }
}

function asText(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : undefined;
}

function asNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

function normalizePartNumber(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/^\*+|\*+$/g, '')
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function getSupplier(payload: FlexibleSupplierInvoicePayload): FlexibleSupplier {
  if (typeof payload.supplier === 'string') {
    return { name: payload.supplier };
  }

  return payload.supplier ?? {};
}

function buildCandidatePayload(payload: FlexibleSupplierInvoicePayload): SupplierInvoiceStockReceiptFormValues {
  const supplier = getSupplier(payload);
  const rawItems = payload.items ?? payload.line_items ?? [];

  return {
    invoiceNumber: asText(payload.invoiceNumber) ?? asText(payload.invoice_no) ?? '',
    invoiceDate: asText(payload.invoiceDate) ?? asText(payload.invoice_date) ?? new Date().toISOString().slice(0, 10),
    supplierId: asText(payload.supplierId) ?? asText(payload.supplier_id) ?? asText(supplier.id),
    supplierCode: asText(payload.supplierCode) ?? asText(supplier.code),
    supplierName: asText(payload.supplierName) ?? asText(payload.supplier_name) ?? asText(supplier.name) ?? '',
    supplierContactName: asText(payload.supplierContactName) ?? asText(supplier.contactName) ?? asText(supplier.contact_name),
    supplierPhone: asText(payload.supplierPhone) ?? asText(supplier.phone),
    supplierEmail: asText(payload.supplierEmail) ?? asText(supplier.email),
    supplierAddress: asText(payload.supplierAddress) ?? asText(supplier.address),
    poReference: asText(payload.poReference) ?? asText(payload.po_reference) ?? asText(payload.order_no),
    notes: asText(payload.notes),
    source: payload.source ?? 'manual_invoice',
    ocrReady: Boolean(payload.ocrReady),
    items: rawItems.map((item) => ({
      lineId: asText(item.lineId),
      partNumber: normalizePartNumber(item.partNumber ?? item.part_number),
      description: asText(item.description) ?? normalizePartNumber(item.partNumber ?? item.part_number),
      quantity: asNumber(item.quantity ?? item.qty),
      unitCost: asNumber(item.unitCost ?? item.unit_cost ?? 0),
      uom: asText(item.uom) ?? 'PC',
      brand: asText(item.brand) ?? 'Mitsubishi',
    })),
  };
}

function mergeDuplicatePartNumbers(invoice: SupplierInvoiceStockReceiptInput): SupplierInvoiceStockReceiptInput {
  const mergedItems = new Map<string, SupplierInvoiceLineItem & { totalCost: number }>();

  invoice.items.forEach((item) => {
    const partNumber = normalizePartNumber(item.partNumber);
    const quantity = Number(item.quantity);
    const unitCost = Number(item.unitCost ?? 0);
    const totalCost = quantity * unitCost;
    const current = mergedItems.get(partNumber);

    if (!current) {
      mergedItems.set(partNumber, {
        ...item,
        partNumber,
        quantity,
        unitCost,
        totalCost,
      });
      return;
    }

    const nextQuantity = current.quantity + quantity;
    const nextTotalCost = current.totalCost + totalCost;
    mergedItems.set(partNumber, {
      ...current,
      description: current.description || item.description,
      quantity: nextQuantity,
      unitCost: nextQuantity > 0 ? roundCurrency(nextTotalCost / nextQuantity) : 0,
      totalCost: nextTotalCost,
    });
  });

  return {
    ...invoice,
    items: [...mergedItems.values()].map(({ totalCost: _totalCost, ...item }) => item),
  };
}

function mapValidationIssues(
  error: { issues: Array<{ path: Array<string | number>; message: string }> },
  candidate: SupplierInvoiceStockReceiptFormValues,
): StockReceiptProcessingIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path,
    partNumber: issue.path[0] === 'items' && typeof issue.path[1] === 'number'
      ? asText(candidate.items?.[issue.path[1]]?.partNumber)
      : undefined,
    message: issue.message,
  }));
}

export function normalizeSupplierInvoicePayload(payload: FlexibleSupplierInvoicePayload): SupplierInvoiceStockReceiptInput {
  const candidate = buildCandidatePayload(payload);
  const parsed = supplierInvoiceStockReceiptSchema.safeParse(candidate);

  if (!parsed.success) {
    throw new StockReceiptProcessingError('Stock receipt invoice is not ready to post.', mapValidationIssues(parsed.error, candidate));
  }

  return mergeDuplicatePartNumbers(parsed.data);
}

async function postStockReceipt(payload: SupplierInvoiceStockReceiptInput): Promise<StockReceiptPostResult> {
  try {
    const { data } = await apiClient.post('/catalog/stock/receive-invoice', payload, {
      timeout: INVENTORY_API_TIMEOUT_MS,
    });
    clearApiClientCache('/catalog/products');
    return data.receipt as StockReceiptPostResult;
  } catch (error) {
    extractApiError(error, 'Failed to receive stock from invoice.');
  }
}

/**
 * Validates and posts a supplier invoice stock receipt through the atomic database RPC.
 *
 * This function is intentionally UI-agnostic: manual forms and future OCR upload flows can
 * pass either camelCase app fields or invoice-style snake_case fields. Duplicate part numbers
 * in the same invoice are merged before posting so the database receives one stock-in line per
 * product, while the RPC still protects atomicity for product upserts, movements, and balances.
 */
export async function receiveStockFromSupplierInvoice(
  payload: FlexibleSupplierInvoicePayload,
  options: ReceiveStockFromSupplierInvoiceOptions = {},
): Promise<StockReceiptPostResult> {
  const normalizedPayload = normalizeSupplierInvoicePayload(payload);
  const postReceipt = options.postReceipt ?? postStockReceipt;

  try {
    return await postReceipt(normalizedPayload);
  } catch (error) {
    if (error instanceof StockReceiptProcessingError) {
      throw error;
    }

    throw new StockReceiptProcessingError(
      error instanceof Error ? error.message : 'Failed to receive stock from invoice.',
      normalizedPayload.items.map((item) => ({
        partNumber: item.partNumber,
        message: 'Invoice posting failed before this line could be committed.',
      })),
    );
  }
}
