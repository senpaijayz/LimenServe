type OcrProgress = {
  progress?: number;
  status?: string;
};

export type ParsedInvoiceLine = {
  partNumber: string;
  description: string;
  quantity: number;
  unitCost: number;
};

export type ParsedSupplierInvoice = {
  invoiceNumber: string;
  invoiceDate: string;
  orderNumber?: string;
  supplierName: string;
  items: ParsedInvoiceLine[];
  rawText: string;
};

declare global {
  interface Window {
    Tesseract?: {
      recognize: (
        image: File | Blob | string,
        language?: string,
        options?: { logger?: (progress: OcrProgress) => void },
      ) => Promise<{ data?: { text?: string } }>;
    };
  }
}

let tesseractLoader: Promise<void> | null = null;

function normalizePartNumber(value: string): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^\*+|\*+$/g, '')
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseMoney(value: string | undefined): number {
  const parsed = Number(String(value || '').replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(2)) : 0;
}

function toIsoDate(value: string | undefined): string {
  const fallback = new Date().toISOString().slice(0, 10);
  const text = String(value || '').trim();
  const match = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);

  if (!match) {
    return fallback;
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const rawYear = Number(match[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;

  if (!month || !day || month > 12 || day > 31) {
    return fallback;
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function cleanOcrLine(line: string): string {
  return line
    .replace(/[|;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findHeaderValue(text: string, label: string): string {
  const regex = new RegExp(`${label}\\s*[:#-]?\\s*([A-Z0-9][A-Z0-9\\-/]+)`, 'i');
  return text.match(regex)?.[1]?.trim() || '';
}

function looksLikePartNumber(token: string): boolean {
  const normalized = normalizePartNumber(token);
  return /^(?:[A-Z]{1,4}\d[A-Z0-9-]{4,}|\d{3,}[A-Z][A-Z0-9-]{2,})$/.test(normalized);
}

function parseInvoiceLine(line: string): ParsedInvoiceLine | null {
  const cleaned = cleanOcrLine(line);
  const tokens = cleaned.split(' ').filter(Boolean);
  const partIndex = tokens.findIndex(looksLikePartNumber);

  if (partIndex < 0) {
    return null;
  }

  const partNumber = normalizePartNumber(tokens[partIndex]);
  const moneyMatches = [...cleaned.matchAll(/\b\d{1,3}(?:,\d{3})*\.\d{2}\b/g)].map((match) => match[0]);
  const unitCost = parseMoney(moneyMatches[0]);
  const beforeMoney = moneyMatches[0] ? cleaned.slice(0, cleaned.indexOf(moneyMatches[0])).trim() : cleaned;
  const qtyMatch = beforeMoney.match(/\s(\d{1,4})(?:\s*)$/);
  const quantity = qtyMatch ? Number(qtyMatch[1]) : Number.NaN;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  const descriptionStart = cleaned.indexOf(tokens[partIndex]) + tokens[partIndex].length;
  const descriptionEnd = qtyMatch ? beforeMoney.lastIndexOf(qtyMatch[1]) : beforeMoney.length;
  const description = cleaned
    .slice(descriptionStart, Math.max(descriptionStart, descriptionEnd))
    .replace(/^\d+\s*/, '')
    .replace(/\s+\d{1,4}$/, '')
    .trim();

  return {
    partNumber,
    description: description || partNumber,
    quantity,
    unitCost,
  };
}

function mergeLines(items: ParsedInvoiceLine[]): ParsedInvoiceLine[] {
  const merged = new Map<string, ParsedInvoiceLine & { totalCost: number }>();

  items.forEach((item) => {
    const current = merged.get(item.partNumber);
    const totalCost = item.quantity * item.unitCost;

    if (!current) {
      merged.set(item.partNumber, { ...item, totalCost });
      return;
    }

    const quantity = current.quantity + item.quantity;
    const nextTotalCost = current.totalCost + totalCost;
    merged.set(item.partNumber, {
      ...current,
      description: current.description || item.description,
      quantity,
      unitCost: quantity > 0 ? Number((nextTotalCost / quantity).toFixed(2)) : 0,
      totalCost: nextTotalCost,
    });
  });

  return [...merged.values()].map(({ totalCost: _totalCost, ...item }) => item);
}

export function parseSupplierInvoiceText(rawText: string): ParsedSupplierInvoice {
  const text = String(rawText || '');
  const compactText = text.replace(/\s+/g, ' ');
  const lines = text.split(/\r?\n/).map(cleanOcrLine).filter(Boolean);
  const supplierName = /Diamond/i.test(compactText) ? 'Diamond Motor Corporation' : 'Supplier';
  const invoiceNumber = findHeaderValue(compactText, 'No') || findHeaderValue(compactText, 'Invoice') || '';
  const orderNumber = findHeaderValue(compactText, 'Order') || undefined;
  const invoiceDate = toIsoDate(compactText.match(/Date\s*[:#-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i)?.[1]);
  const items = mergeLines(lines.map(parseInvoiceLine).filter((item): item is ParsedInvoiceLine => Boolean(item)));

  return {
    invoiceNumber,
    invoiceDate,
    orderNumber,
    supplierName,
    items,
    rawText: text,
  };
}

function loadTesseract(): Promise<void> {
  if (window.Tesseract) {
    return Promise.resolve();
  }

  if (!tesseractLoader) {
    tesseractLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Unable to load OCR engine. Check the network connection and try again.'));
      document.head.appendChild(script);
    });
  }

  return tesseractLoader;
}

export async function recognizeInvoiceImage(
  image: File,
  onProgress?: (progress: OcrProgress) => void,
): Promise<ParsedSupplierInvoice> {
  await loadTesseract();

  if (!window.Tesseract) {
    throw new Error('OCR engine is not available in this browser.');
  }

  const result = await window.Tesseract.recognize(image, 'eng', {
    logger: onProgress,
  });

  return parseSupplierInvoiceText(result.data?.text || '');
}

export const DIAMOND_INVOICE_SAMPLE_TEXT = `
Diamond Motor Corporation
PARTS INVOICE
No PSI-HO-A0089610
Order PRS-HO-A0068334
Date 4/17/2026
Item No. Stock No Description Qty Unit Price Amount
1 MN171315 CONTROL UNIT,4WD INDICATOR 1 5,506.00 5,506.00
2 1120A377 FLYWHEEL ASSY 2 11,474.00 22,948.00
3 54500W070P ARM ASSY,FR SUSP,LWR RH 1 7,134.00 7,134.00
4 MR446308 OIL SEAL,A/T EXTENSION HSG 3 558.00 1,674.00
5 CW774278 CYLINDER ASSY, BRAKE MASTER 1 9,602.00 9,602.00
6 1801A079 BOLT,ALTERNATOR 5 153.00 765.00
7 MD050127 SPACER,BALANCER BELT TRAIN 5 477.00 2,385.00
8 1130A230 GEAR,INJECTION PUMP DRIVE 3 2,672.00 8,016.00
9 1741B248 HOSE,FUEL LINE 2 320.00 640.00
`;
