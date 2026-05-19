export type StockReceiptSource = 'manual_invoice' | 'ocr_upload' | 'api_import';

export interface SupplierInvoiceHeader {
  invoiceNumber: string;
  invoiceDate: string;
  supplierId?: string | null;
  supplierCode?: string | null;
  supplierName: string;
  supplierContactName?: string | null;
  supplierPhone?: string | null;
  supplierEmail?: string | null;
  supplierAddress?: string | null;
  poReference?: string | null;
  notes?: string | null;
  source?: StockReceiptSource;
}

export interface SupplierInvoiceLineItem {
  lineId?: string;
  partNumber: string;
  description: string;
  quantity: number;
  unitCost: number;
  uom?: string;
  brand?: string;
}

export interface SupplierInvoiceStockReceiptInput extends SupplierInvoiceHeader {
  items: SupplierInvoiceLineItem[];
  ocrReady?: boolean;
  allowNewProducts?: boolean;
}

export interface StockReceiptItemResult {
  lineNumber: number;
  productId: string;
  partNumber: string;
  description: string;
  quantity: number;
  unitCost: number;
  previousStock: number;
  updatedStock: number;
  movementId: string;
}

export interface StockReceiptPostResult {
  receiptId: string;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalLines: number;
  totalQuantity: number;
  totalCost: number;
  items: StockReceiptItemResult[];
}

export interface InventoryStockMovement {
  productId: string;
  movementType: 'stock_in';
  quantity: number;
  referenceType: 'supplier_invoice';
  referenceId: string;
  notes?: string | null;
  performedBy?: string | null;
  businessDate: string;
}
