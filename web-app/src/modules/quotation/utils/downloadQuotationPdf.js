import { jsPDF } from 'jspdf';

const formatPdfMoney = (value) => `PHP ${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const cleanFilename = (value) => String(value || 'quotation')
  .replace(/[^a-z0-9-_]+/gi, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60) || 'quotation';

async function loadLogoData(logoUrl) {
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const objectUrl = URL.createObjectURL(await response.blob());
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      const scale = Math.min(2, 640 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      return { data: canvas.toDataURL('image/jpeg', 0.9), width: canvas.width, height: canvas.height };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

export async function downloadQuotationPdf(quote = {}) {
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = 18;
  const logo = await loadLogoData(quote.brandLogoUrl || '/LogoLimen.jpg');

  const ensureSpace = (height) => {
    if (y + height > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };
  const writeWrapped = (value, x, startY, width, options = {}) => {
    const lines = doc.splitTextToSize(String(value || ''), width);
    doc.text(lines, x, startY, options);
    return lines.length;
  };

  doc.setTextColor(24, 61, 145);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  const logoBox = 15;
  if (logo) {
    const ratio = logo.width / logo.height;
    const width = ratio >= 1 ? logoBox : logoBox * ratio;
    const height = ratio >= 1 ? logoBox / ratio : logoBox;
    doc.addImage(logo.data, 'JPEG', margin, y - 5, width, height);
  }
  const headerX = margin + (logo ? 19 : 0);
  doc.text('LIMEN AUTO PARTS CENTER', headerX, y);
  doc.setTextColor(70, 80, 100);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('1308, 264 Epifanio de los Santos Ave, Pasay City, Metro Manila', headerX, y + 6);
  doc.setTextColor(20, 28, 45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('QUOTATION', pageWidth - margin, y, { align: 'right' });
  doc.setFontSize(9);
  doc.text(String(quote.referenceValue || 'Draft'), pageWidth - margin, y + 6, { align: 'right' });
  y += 13;
  doc.setDrawColor(24, 61, 145);
  doc.setLineWidth(0.7);
  doc.line(margin, y, pageWidth - margin, y);
  y += 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(80, 90, 108);
  doc.text('CUSTOMER', margin, y);
  doc.text('QUOTE DETAILS', margin + contentWidth / 2, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20, 28, 45);
  doc.setFontSize(9.5);
  let leftLines = 0;
  leftLines += writeWrapped(quote.customerName || 'Walk-in Customer', margin, y, contentWidth / 2 - 5);
  if (quote.customerPhone) leftLines += writeWrapped(quote.customerPhone, margin, y + leftLines * 4.5, contentWidth / 2 - 5);
  if (quote.vehicleInfo) leftLines += writeWrapped(quote.vehicleInfo, margin, y + leftLines * 4.5, contentWidth / 2 - 5);
  const rightX = margin + contentWidth / 2;
  let rightLines = 0;
  rightLines += writeWrapped(`Issued: ${quote.issuedAt || new Date().toLocaleDateString('en-PH')}`, rightX, y, contentWidth / 2);
  if (quote.validUntil) rightLines += writeWrapped(`Valid until: ${quote.validUntil}`, rightX, y + rightLines * 4.5, contentWidth / 2);
  y += Math.max(leftLines, rightLines, 1) * 4.5 + 8;

  if (quote.note) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('NOTES', margin, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    const notesLines = writeWrapped(quote.note, margin, y, contentWidth);
    y += notesLines * 4.2 + 6;
  }

  const columns = {
    qty: margin,
    details: margin + 14,
    unit: pageWidth - margin - 70,
    total: pageWidth - margin,
  };
  const drawTableHeader = () => {
    ensureSpace(12);
    doc.setFillColor(24, 61, 145);
    doc.rect(margin, y - 4, contentWidth, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('QTY', columns.qty + 2, y + 1.5);
    doc.text('PART / SERVICE', columns.details, y + 1.5);
    doc.text('UNIT PRICE', columns.unit, y + 1.5, { align: 'right' });
    doc.text('LINE TOTAL', columns.total - 2, y + 1.5, { align: 'right' });
    y += 11;
  };
  drawTableHeader();

  (quote.items || []).forEach((item, index) => {
    const details = [item.partNumber, item.name, item.subtitle].filter(Boolean);
    const detailLines = details.flatMap((value) => doc.splitTextToSize(String(value), columns.unit - columns.details - 7));
    const catalogPrice = Number(item.catalogUnitPrice ?? item.unitPrice ?? 0);
    const unitPrice = Number(item.unitPrice ?? 0);
    if (catalogPrice > unitPrice) detailLines.push(...doc.splitTextToSize(`Package price (listed ${formatPdfMoney(catalogPrice)})`, columns.unit - columns.details - 7));
    const rowHeight = Math.max(10, detailLines.length * 4 + 5);
    if (y + rowHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
      drawTableHeader();
    }

    doc.setTextColor(30, 40, 56);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(String(item.quantity ?? 1), columns.qty + 2, y + 2);
    doc.setFont('helvetica', 'bold');
    doc.text(`${index + 1}.`, columns.details, y + 2);
    doc.setFont('helvetica', 'normal');
    doc.text(detailLines, columns.details + 7, y + 2);
    doc.text(formatPdfMoney(unitPrice), columns.unit, y + 2, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(formatPdfMoney(item.lineTotal), columns.total - 2, y + 2, { align: 'right' });
    y += rowHeight;
    doc.setDrawColor(223, 228, 236);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += 2;
  });

  const totalsRows = [
    ['Subtotal before discount', quote.subtotalBeforeDiscount ?? quote.subtotal],
    ...(Number(quote.discountTotal || 0) > 0 ? [['Package savings', -Math.abs(Number(quote.discountTotal))]] : []),
    ['Subtotal after savings', quote.subtotalAfterDiscount ?? (Number(quote.subtotal ?? 0) - Number(quote.discountTotal ?? 0))],
    ['VAT (12%)', quote.vat],
  ];
  ensureSpace(42);
  y += 5;
  const summaryX = pageWidth - margin - 82;
  totalsRows.forEach(([label, amount]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(70, 80, 100);
    doc.text(label, summaryX, y);
    doc.setTextColor(30, 40, 56);
    doc.text(formatPdfMoney(amount), pageWidth - margin, y, { align: 'right' });
    y += 5;
  });
  doc.setFillColor(24, 61, 145);
  doc.roundedRect(summaryX - 2, y - 1, 84, 12, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL', summaryX + 2, y + 7);
  doc.text(formatPdfMoney(quote.total), pageWidth - margin - 2, y + 7, { align: 'right' });

  const reference = cleanFilename(quote.referenceValue);
  doc.save(`LimenServe_Quotation_${reference}.pdf`);
}
