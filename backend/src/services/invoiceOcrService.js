import { supabaseAdmin } from '../config/supabase.js';

function normalizePartNumber(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^\*+|\*+$/g, '')
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseMoney(value) {
  const normalized = String(value || '')
    .replace(/,/g, '')
    .replace(/\.(?=.*\.)/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(2)) : 0;
}

function toIsoDate(value) {
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

function cleanOcrLine(line) {
  return String(line || '')
    .replace(/[|;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findHeaderValue(text, label) {
  const regex = new RegExp(`${label}\\s*[:#-]?\\s*([A-Z0-9][A-Z0-9\\-/]+)`, 'i');
  return text.match(regex)?.[1]?.trim() || '';
}

function findLineAfterLabel(lines, label, matcher) {
  const labelIndex = lines.findIndex((line) => new RegExp(`^${label}\\b:?$`, 'i').test(line));

  if (labelIndex < 0) {
    return '';
  }

  for (let index = labelIndex + 1; index < Math.min(lines.length, labelIndex + 8); index += 1) {
    const candidate = lines[index]?.trim();

    if (candidate && matcher(candidate)) {
      return candidate;
    }
  }

  return '';
}

function findInvoiceNumber(compactText, lines) {
  return findLineAfterLabel(lines, 'No', (value) => /^PSI[-A-Z0-9]+$/i.test(value))
    || compactText.match(/\b(PSI[-A-Z0-9]+)\b/i)?.[1]?.trim()
    || findHeaderValue(compactText, 'Invoice')
    || '';
}

function findOrderNumber(compactText, lines) {
  return findLineAfterLabel(lines, 'Order', (value) => /^PRS[-A-Z0-9]+$/i.test(value))
    || compactText.match(/\b(PRS[-A-Z0-9]+)\b/i)?.[1]?.trim()
    || findHeaderValue(compactText, 'Order')
    || '';
}

function looksLikePartNumber(token) {
  const normalized = normalizePartNumber(token);
  return /^(?:[A-Z]{1,4}\d[A-Z0-9-]{4,}|\d{3,}[A-Z][A-Z0-9-]{2,})$/.test(normalized);
}

function parseInvoiceLine(line) {
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
  const qtyMatch = beforeMoney.match(/\s\.?(\d{1,4})(?:\s*)$/);
  const quantity = qtyMatch ? Number(qtyMatch[1]) : Number.NaN;

  const descriptionStart = cleaned.indexOf(tokens[partIndex]) + tokens[partIndex].length;
  const descriptionEnd = qtyMatch ? beforeMoney.lastIndexOf(qtyMatch[1]) : beforeMoney.length;
  const description = cleaned
    .slice(descriptionStart, Math.max(descriptionStart, descriptionEnd))
    .replace(/^\d+\s*/, '')
    .replace(/\s+\d{1,4}$/, '')
    .trim();

  return {
    partNumber,
    detectedDescription: description || '',
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
    reviewNote: Number.isFinite(quantity) && quantity > 0 ? '' : 'Enter the quantity from the photo.',
    unitCost: 0,
  };
}

function mergeDetectedItems(items) {
  const merged = new Map();

  items.forEach((item) => {
    const current = merged.get(item.partNumber);

    if (!current) {
      merged.set(item.partNumber, { ...item });
      return;
    }

    merged.set(item.partNumber, {
      ...current,
      detectedDescription: current.detectedDescription || item.detectedDescription,
      quantity: current.quantity == null || item.quantity == null ? null : Number(current.quantity) + Number(item.quantity),
      unitCost: 0,
    });
  });

  return [...merged.values()];
}

function collectColumn(lines, startLabel, stopLabels) {
  const startIndex = lines.findIndex((line) => new RegExp(`^${startLabel}\\b:?$`, 'i').test(line));

  if (startIndex < 0) {
    return [];
  }

  const values = [];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (stopLabels.some((label) => new RegExp(`^${label}\\b:?`, 'i').test(line))) {
      break;
    }

    values.push(line);
  }

  return values;
}

function collectMoneyColumn(lines, startLabel, stopLabels) {
  return collectColumn(lines, startLabel, stopLabels)
    .filter((line) => /\d+(?:[,.]\d{3})*\.\d{2}/.test(line))
    .map(parseMoney)
    .filter((value) => value > 0);
}

function collectQuantityColumn(lines) {
  return collectColumn(lines, 'Qty', ['UNIT PRICE', 'Unit Price', 'AMOUNT', 'Discount'])
    .map((line) => Number(String(line).replace(/[^\d]/g, '')))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function parseColumnarInvoiceItems(lines) {
  const stockNumbers = collectColumn(lines, 'Stock No', ['Description'])
    .map(normalizePartNumber)
    .filter(looksLikePartNumber);
  const descriptions = collectColumn(lines, 'Description', ['Qty', 'I/We', 'RECEIVED ABOVE', 'Supplier'])
    .filter((line) => !looksLikePartNumber(line));
  const quantities = collectQuantityColumn(lines);
  const unitCosts = collectMoneyColumn(lines, 'UNIT PRICE', ['Discount', 'Vatable Sales', 'AMOUNT']);
  const amounts = collectMoneyColumn(lines, 'AMOUNT', ['Printed Date', 'PMIS', 'Acknowledgement', 'Range']);

  if (stockNumbers.length < 2 || descriptions.length < 2) {
    return [];
  }
  // Filtered/missing cells cannot safely be paired by their new array indexes.
  if (descriptions.length !== stockNumbers.length) return [];
  const alignedQuantities = quantities.length === stockNumbers.length;
  const alignedAmounts = unitCosts.length === stockNumbers.length && amounts.length === stockNumbers.length;

  return stockNumbers.map((partNumber, index) => {
    const unitCents = Math.round((unitCosts[index] || 0) * 100);
    const amountCents = Math.round((amounts[index] || 0) * 100);
    const inferredQuantity = alignedAmounts && unitCents > 0 && amountCents > 0 && amountCents % unitCents === 0 ? amountCents / unitCents : null;
    const quantity = alignedQuantities ? quantities[index] : inferredQuantity;

    return {
      partNumber,
      detectedDescription: descriptions[index] || '',
      quantity,
      reviewNote: !quantity ? 'Enter the quantity from the photo.' : !alignedQuantities ? 'Quantity cross-checked using the row amounts. Check it against the photo.' : '',
      unitCost: 0,
    };
  });
}

export function parseSupplierInvoiceOcrText(rawText) {
  const text = String(rawText || '');
  const compactText = text.replace(/\s+/g, ' ');
  const lines = text.split(/\r?\n/).map(cleanOcrLine).filter(Boolean);
  const lineItems = lines.map(parseInvoiceLine).filter(Boolean);
  const columnItems = parseColumnarInvoiceItems(lines);

  return {
    invoiceNumber: findInvoiceNumber(compactText, lines),
    orderNumber: findOrderNumber(compactText, lines),
    invoiceDate: toIsoDate(compactText.match(/Date\s*[:#-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i)?.[1]),
    supplierName: /Diamond/i.test(compactText) ? 'Diamond Motor Corporation' : 'Supplier',
    detectedItems: mergeDetectedItems(columnItems.length > lineItems.length ? columnItems : lineItems),
    rawText: text,
  };
}

async function classifyDetectedProducts(detectedItems) {
  const partNumbers = [...new Set(detectedItems.map((item) => item.partNumber).filter(Boolean))];

  const { data, error } = partNumbers.length ? await supabaseAdmin
    .schema('catalog')
    .from('products')
    .select('id, sku, name, brand, uom')
    .in('sku', partNumbers) : { data: [], error: null };

  if (error) {
    throw error;
  }

  const productsBySku = new Map((data || []).map((product) => [normalizePartNumber(product.sku), product]));
  const existingProducts = [];
  const newProducts = [];

  detectedItems.forEach((item) => {
    const product = productsBySku.get(item.partNumber);

    if (product) {
      existingProducts.push({
        status: 'existing',
        productId: product.id,
        partNumber: item.partNumber,
        description: product.name,
        detectedDescription: item.detectedDescription,
        quantity: item.quantity,
        reviewNote: item.reviewNote || '',
        sourceRow: item.sourceRow,
        brand: product.brand || 'Mitsubishi',
        uom: product.uom || 'PC',
      });
      return;
    }

    newProducts.push({
      status: 'new',
      productId: null,
      partNumber: item.partNumber,
      description: '',
      detectedDescription: item.detectedDescription,
      quantity: item.quantity,
      reviewNote: item.reviewNote || '',
      sourceRow: item.sourceRow,
      requiredAction: 'Check the part number against the photo. Create a product only if this is a new part.',
    });
  });

  return {
    existingProducts,
    newProducts,
  };
}

export async function analyzeSupplierInvoiceText(rawText, rawRows) {
  if (typeof rawText !== 'string' || !rawText.trim() || rawText.length > 128_000) {
    throw Object.assign(new Error('Read a clear invoice image first (maximum 128,000 text characters).'), { statusCode: 400 });
  }
  const parsed = parseSupplierInvoiceOcrText(rawText);
  if (rawRows !== undefined) {
    if (!Array.isArray(rawRows) || !rawRows.length || rawRows.length > 200) {
      throw Object.assign(new Error('Provide between 1 and 200 invoice rows, or scan a smaller section.'), { statusCode: 400 });
    }
    parsed.detectedItems = rawRows.map((row, index) => {
      if (!row || typeof row !== 'object' || typeof row.partNumber !== 'string' || row.partNumber.length > 64 || ![null, undefined].includes(row.quantity) && (!Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 10_000)) {
        throw Object.assign(new Error(`Invoice row ${index + 1} is invalid. Check its part number and quantity.`), { statusCode: 400 });
      }
      return {
        partNumber: normalizePartNumber(row.partNumber),
        detectedDescription: typeof row.detectedDescription === 'string' ? row.detectedDescription.slice(0, 300) : '',
        quantity: row.quantity ?? null,
        unitCost: 0,
        sourceRow: index + 1,
        reviewNote: typeof row.reviewNote === 'string' ? row.reviewNote.slice(0, 500) : '',
      };
    });
  }
  if (parsed.detectedItems.length > 200) throw Object.assign(new Error('Split this invoice into sections of no more than 200 parts.'), { statusCode: 422 });
  const classified = await classifyDetectedProducts(parsed.detectedItems);

  return {
    invoice: {
      invoiceNumber: parsed.invoiceNumber,
      orderNumber: parsed.orderNumber,
      invoiceDate: parsed.invoiceDate,
      supplierName: parsed.supplierName,
    },
    existingProducts: classified.existingProducts,
    newProducts: classified.newProducts,
    rawText: parsed.rawText,
    ocrEngine: 'device_tesseract',
    summary: {
      detectedCount: parsed.detectedItems.length,
      existingCount: classified.existingProducts.length,
      newCount: classified.newProducts.length,
      totalQuantity: parsed.detectedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    },
  };
}
