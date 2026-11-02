const moneyPattern = /\b\d+(?:[,.]\d{3})*[.,]\d{2}\b/g;
const codePattern = /^(?:[A-Z]{1,4}\d[A-Z0-9-]{4,}|\d{3,}[A-Z][A-Z0-9-]{2,})$/;
const cleanCode = (text) => String(text || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').replace(/^-+|-+$/g, '');
const linesOf = (data) => (data.blocks || []).flatMap((block) => (block.paragraphs || []).flatMap((paragraph) => paragraph.lines || []));
const centerY = (word) => (word.bbox.y0 + word.bbox.y1) / 2;
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

// Use printed row positions, not parallel arrays of independently filtered columns.
// If a quantity/part number is obscured, its row must still reach the review screen.
export function findInvoiceTable(data) {
  const lines = linesOf(data);
  const header = lines.find((line) => /description/i.test(line.text) && /q(?:ua)?(?:n)?t(?:ity|y)/i.test(line.text) && /price|amount/i.test(line.text));
  if (!header) return null;
  const description = header.words.find((word) => /description/i.test(word.text));
  const qty = header.words.find((word) => /^qty|^quantity/i.test(word.text));
  const amount = header.words.find((word) => /^amount/i.test(word.text));
  if (!description || !qty || !amount) return null;
  const itemHeader = header.words.find((word) => /^item$/i.test(word.text));
  const stockHeader = header.words.find((word) => /^stock$/i.test(word.text));
  const inferredLeft = header.bbox.x0 + (description.bbox.x0 - header.bbox.x0) * 0.28;
  const stockLeft = stockHeader ? Math.min(stockHeader.bbox.x0 - 12, inferredLeft) : inferredLeft;
  const stockRight = description.bbox.x0 - 8;
  const words = lines.flatMap((line) => line.words || []);
  const rowNumbers = itemHeader ? words.filter((word) => word.bbox.y0 > header.bbox.y1 && Math.abs(word.bbox.x0 - itemHeader.bbox.x0) < 35 && /^\D?\d{1,3}\D?$/.test(word.text)) : [];
  const numberedRows = rowNumbers.filter((word) => Number(word.text.replace(/\D/g, '')) >= 1 && Number(word.text.replace(/\D/g, '')) <= 200);
  // Without a reliable lower boundary, keep the normal parser rather than scan totals as parts.
  if (numberedRows.length < 4) return null;
  const positions = numberedRows.map(centerY).sort((a, b) => a - b);
  const gaps = positions.slice(1).map((position, index) => position - positions[index]).filter((gap) => gap > 10 && gap < 100);
  if (!gaps.length) return null;
  const spacing = median(gaps);
  const bottom = Math.max(...positions) + spacing * 0.6;
  const amountWords = words.filter((word) => word.bbox.y0 > header.bbox.y1 && centerY(word) < bottom && word.bbox.x0 > amount.bbox.x0 - 35 && /^\d[\d,.]*[.,]\d{2}$/.test(word.text));
  const anchors = amountWords.sort((a, b) => centerY(a) - centerY(b)).filter((word, index, all) => index === 0 || centerY(word) - centerY(all[index - 1]) > spacing * 0.45);
  // A damaged amount must not erase an otherwise visible numbered row.
  for (const number of numberedRows) {
    if (!anchors.some((anchor) => Math.abs(centerY(anchor) - centerY(number)) < spacing * 0.45)) anchors.push(number);
  }
  anchors.sort((a, b) => centerY(a) - centerY(b));
  if (!amountWords.length) return null;
  if (anchors.length > 100) throw new Error('This table has more than 100 rows. Scan it in smaller sections.');
  if (anchors.length < 4) return null;
  // Require coverage of the numbered table. Do not silently accept a partial reread.
  if (Math.abs(centerY(anchors.at(-1)) - Math.max(...positions)) > spacing * 0.75) return null;
  const rows = anchors.map((word, index) => {
    const y = centerY(word);
    const previous = index ? centerY(anchors[index - 1]) : y - spacing;
    const next = index + 1 < anchors.length ? centerY(anchors[index + 1]) : y + spacing;
    return {
      left: Math.max(0, Math.floor(stockLeft)),
      top: Math.max(header.bbox.y1, Math.floor((previous + y) / 2)),
      width: Math.ceil(Math.max(...amountWords.map((entry) => entry.bbox.x1)) - stockLeft + 12),
      height: Math.max(1, Math.floor((next + y) / 2) - Math.max(header.bbox.y1, Math.floor((previous + y) / 2))),
      stockWidth: Math.max(1, Math.floor(stockRight - stockLeft)),
      numericLeft: Math.floor(qty.bbox.x0 - 25),
      originalText: lines.find((line) => line.words?.includes(word))?.text || '',
    };
  });
  return { rows };
}

function quantityEvidence(text) {
  const prices = [...text.matchAll(moneyPattern)];
  const beforePrice = prices.length ? text.slice(0, prices[0].index).trim() : '';
  const match = beforePrice.match(/(?:^|\s)(\d{1,4})\s*$/);
  const direct = match ? Number(match[1]) : null;
  if (prices.length !== 2) return { direct, calculated: null };
  const unit = Number(prices[0][0].replace(/[,.]/g, ''));
  const amount = Number(prices[1][0].replace(/[,.]/g, ''));
  const calculated = unit > 0 && amount > 0 && amount % unit === 0 && amount / unit <= 10_000 ? amount / unit : null;
  return { direct, calculated };
}

function readRow(text, stockText, numericText, originalText, index) {
  const tokens = String(stockText || '').toUpperCase().trim().split(/\s+/).map(cleanCode).filter(Boolean);
  // Restrict the second opinion to the stock-number column. Descriptions can
  // contain a different, alternative part number in parentheses.
  const fullPrefix = cleanCode(text.trim().split(/\s{2,}/)[0]);
  const stockCandidate = tokens.find((token) => token.length <= 20 && codePattern.test(token));
  const fullCandidate = fullPrefix.length <= 20 && codePattern.test(fullPrefix) ? fullPrefix : '';
  const partNumber = stockCandidate || fullCandidate || tokens.find((token) => /^[A-Z0-9-]{6,20}$/.test(token)) || '';
  const notes = [];
  if (!stockCandidate || !fullCandidate || stockCandidate !== fullCandidate) notes.push('Check the part number against the photo.');
  // Compare separate views of this same physical row. Do not add quantities
  // from multiple passes or pair filtered columns by array index.
  const evidence = [numericText, text, originalText].filter(Boolean).map(quantityEvidence);
  const calculated = [...new Set(evidence.map((entry) => entry.calculated).filter(Boolean))];
  let quantity = calculated.length === 1 ? calculated[0] : null;
  if (calculated.length > 1) notes.push('The readings disagree. Enter the quantity from the photo.');
  if (!calculated.length) {
    const agreed = evidence.map((entry) => entry.direct).filter((value) => value > 0);
    quantity = agreed.find((value) => agreed.filter((candidate) => candidate === value).length >= 2) || null;
  }
  if (quantity && !evidence.every((entry) => entry.direct === quantity)) notes.push('Quantity cross-checked using the row amounts. Check it against the photo.');
  if (!quantity) notes.push('Enter the quantity from the photo.');
  const firstPrice = [...text.matchAll(moneyPattern)][0];
  const description = (firstPrice ? text.slice(0, firstPrice.index) : text).replace(/^.*?\s{2,}/, '').replace(/\s\d{1,4}\s*$/, '').trim();
  return { sourceRow: index + 1, partNumber, detectedDescription: description.slice(0, 300), quantity, reviewNote: notes.join(' '), rawLine: text.trim().slice(0, 1000) };
}

// One bounded worker; cropImage returns small, padded images so each row pass avoids
// decoding the complete photograph again. Never concatenate competing OCR passes.
export async function recognizeInvoiceTable(worker, image, cropImage) {
  await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '3' });
  const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
  const table = findInvoiceTable(data);
  if (!table) return { ocrText: data.text, ocrRows: undefined };
  const rows = [];
  await worker.setParameters({ tessedit_pageseg_mode: '7' });
  for (const [index, rectangle] of table.rows.entries()) {
    const rowImage = await cropImage(rectangle);
    const { data: row } = await worker.recognize(rowImage);
    const stockImage = await cropImage({ ...rectangle, width: rectangle.stockWidth });
    await worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-' });
    const { data: stock } = await worker.recognize(stockImage);
    await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: '6' });
    const numberImage = await cropImage({ ...rectangle, left: rectangle.numericLeft, width: rectangle.left + rectangle.width - rectangle.numericLeft });
    const { data: numbers } = await worker.recognize(numberImage);
    await worker.setParameters({ tessedit_pageseg_mode: '7' });
    rows.push(readRow(row.text, stock.text, numbers.text, rectangle.originalText, index));
  }
  return { ocrText: data.text, ocrRows: rows };
}
