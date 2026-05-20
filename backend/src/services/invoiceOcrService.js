import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { supabaseAdmin } from '../config/supabase.js';

let paddleServicePromise = null;

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
  const parsed = Number(String(value || '').replace(/,/g, ''));
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
    detectedDescription: description || '',
    quantity,
    unitCost,
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
      quantity: Number(current.quantity) + Number(item.quantity),
      unitCost: current.unitCost || item.unitCost,
    });
  });

  return [...merged.values()];
}

export function parseSupplierInvoiceOcrText(rawText) {
  const text = String(rawText || '');
  const compactText = text.replace(/\s+/g, ' ');
  const lines = text.split(/\r?\n/).map(cleanOcrLine).filter(Boolean);

  return {
    invoiceNumber: findHeaderValue(compactText, 'No') || findHeaderValue(compactText, 'Invoice') || '',
    orderNumber: findHeaderValue(compactText, 'Order') || '',
    invoiceDate: toIsoDate(compactText.match(/Date\s*[:#-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i)?.[1]),
    supplierName: /Diamond/i.test(compactText) ? 'Diamond Motor Corporation' : 'Supplier',
    detectedItems: mergeDetectedItems(lines.map(parseInvoiceLine).filter(Boolean)),
    rawText: text,
  };
}

async function getPaddleService() {
  if (!paddleServicePromise) {
    paddleServicePromise = import('ppu-paddle-ocr').then(async ({ PaddleOcrService }) => {
      const service = new PaddleOcrService({
        debugging: { debug: false, verbose: false },
        processing: { engine: 'canvas-native' },
        recognition: { strategy: 'per-line' },
        session: {
          executionProviders: ['cpu'],
          executionMode: 'sequential',
          interOpNumThreads: 1,
          intraOpNumThreads: 1,
        },
      });
      await service.initialize();
      return service;
    });
  }

  return paddleServicePromise;
}

async function recognizeImage(filePath) {
  const service = await getPaddleService();
  const result = await service.recognize(filePath, {
    flatten: true,
    strategy: 'per-line',
    noCache: true,
  });

  return result?.text || '';
}

async function withTempImage(file, callback) {
  const uploadDir = path.join(os.tmpdir(), 'limenserve-invoice-ocr');
  await mkdir(uploadDir, { recursive: true });
  const extension = path.extname(file.originalname || '') || '.jpg';
  const filePath = path.join(uploadDir, `${randomUUID()}${extension}`);

  try {
    await writeFile(filePath, file.buffer);
    return await callback(filePath);
  } finally {
    await unlink(filePath).catch(() => {});
  }
}

async function classifyDetectedProducts(detectedItems) {
  const partNumbers = [...new Set(detectedItems.map((item) => item.partNumber).filter(Boolean))];

  if (partNumbers.length === 0) {
    return {
      existingProducts: [],
      newProducts: [],
    };
  }

  const { data, error } = await supabaseAdmin
    .schema('catalog')
    .from('products')
    .select('id, sku, name, brand, uom')
    .in('sku', partNumbers);

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
        unitCost: item.unitCost,
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
      unitCost: item.unitCost,
      requiredAction: 'Create product manually before receiving stock.',
    });
  });

  return {
    existingProducts,
    newProducts,
  };
}

export async function analyzeSupplierInvoiceImage(file) {
  if (!file?.buffer?.length) {
    const error = new Error('Invoice image is required.');
    error.statusCode = 400;
    throw error;
  }

  let rawText = '';

  try {
    rawText = await withTempImage(file, recognizeImage);
  } catch (cause) {
    const error = new Error('The invoice OCR engine could not read this image. Please try a clearer full-page photo or upload the image again.');
    error.statusCode = 503;
    error.cause = cause;
    throw error;
  }

  const parsed = parseSupplierInvoiceOcrText(rawText);
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
    summary: {
      detectedCount: parsed.detectedItems.length,
      existingCount: classified.existingProducts.length,
      newCount: classified.newProducts.length,
      totalQuantity: parsed.detectedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    },
  };
}
