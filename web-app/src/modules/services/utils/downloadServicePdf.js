import { jsPDF } from 'jspdf';

const money = (value) => `PHP ${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const safeFilename = (value) => String(value || 'service')
  .replace(/[^a-z0-9-_]+/gi, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60) || 'service';

const dateLabel = (value) => {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));
};

function createServicePdf({ title, reference, order, lines, total, paymentStatus, paymentMethod, paidAt, cashReceived, changeDue, mechanicName }) {
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 16;
  let y = 20;

  const ensureSpace = (needed) => {
    if (y + needed > height - margin) {
      doc.addPage();
      y = margin;
    }
  };
  const write = (value, x, maxWidth, { size = 9, bold = false, color = [25, 35, 53] } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const rows = doc.splitTextToSize(String(value ?? ''), maxWidth);
    ensureSpace(rows.length * 4.5 + 2);
    doc.text(rows, x, y);
    y += rows.length * 4.5 + 2;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(24, 61, 145);
  doc.text('LIMEN AUTO PARTS CENTER', margin, y);
  doc.setFontSize(12);
  doc.setTextColor(25, 35, 53);
  doc.text(title.toUpperCase(), width - margin, y, { align: 'right' });
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Reference: ${reference}`, width - margin, y, { align: 'right' });
  y += 7;
  doc.setDrawColor(24, 61, 145);
  doc.line(margin, y, width - margin, y);
  y += 9;

  write(`Customer: ${order.customerName || 'Walk-in customer'}`, margin, width - margin * 2, { bold: true });
  const vehicle = [order.vehicle?.year, order.vehicle?.make, order.vehicle?.model, order.vehicle?.plate].filter(Boolean).join(' ');
  write(`Vehicle: ${vehicle || 'Not recorded'}`, margin, width - margin * 2);
  if (mechanicName) write(`Mechanic: ${mechanicName}`, margin, width - margin * 2);
  write(`Service order: ${order.orderNumber || order.order_number || order.id || 'Not recorded'}`, margin, width - margin * 2);
  write(`Date: ${dateLabel(paidAt || order.createdAt || order.created_at)}`, margin, width - margin * 2);
  write(`Payment: ${paymentStatus}${paymentMethod ? ` (${String(paymentMethod).replaceAll('_', ' ')})` : ''}`, margin, width - margin * 2);

  const note = order.description || order.note;
  if (note) {
    y += 2;
    write('JOB NOTES', margin, width - margin * 2, { bold: true, size: 9 });
    write(note, margin, width - margin * 2);
  }

  y += 4;
  write('WORK AND PARTS', margin, width - margin * 2, { bold: true, size: 10 });
  if (!lines.length) write('No itemized work or parts recorded.', margin, width - margin * 2);
  lines.forEach((line) => {
    const description = [line.code, line.name].filter(Boolean).join(' - ') || 'Item';
    const detailLines = doc.splitTextToSize(description, 112);
    ensureSpace(detailLines.length * 4.5 + 10);
    doc.setDrawColor(220, 226, 233);
    doc.line(margin, y - 2, width - margin, y - 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(25, 35, 53);
    doc.text(detailLines, margin, y + 2);
    doc.text(money(line.total), width - margin, y + 2, { align: 'right' });
    y += detailLines.length * 4.5 + 3;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(85, 98, 116);
    doc.text(`${line.quantity} x ${money(line.unitPrice)}`, margin, y);
    y += 8;
  });

  ensureSpace(paymentMethod === 'cash' ? 32 : 22);
  doc.setDrawColor(24, 61, 145);
  doc.line(margin, y, width - margin, y);
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(24, 61, 145);
  doc.text(`TOTAL: ${money(total)}`, width - margin, y, { align: 'right' });
  y += 7;
  if (paymentMethod === 'cash') {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(25, 35, 53);
    doc.text(`Cash received: ${money(cashReceived)}    Change: ${money(changeDue)}`, width - margin, y, { align: 'right' });
  }
  return doc;
}

export function downloadServiceOrderPdf({ order, serviceItems = [], partItems = [], orderTotal, mechanicName }) {
  const reference = order.orderNumber || order.order_number || order.id || 'service';
  const lines = [...serviceItems, ...partItems].map((item) => {
    const quantity = Number(item.quantity ?? 1);
    const unitPrice = Number(item.unitPrice ?? item.unit_price ?? item.price ?? 0);
    return {
      code: item.itemSku ?? item.item_sku ?? item.sku ?? item.code ?? '',
      name: item.itemName ?? item.item_name ?? item.displayName ?? item.display_name ?? item.name ?? '',
      quantity,
      unitPrice,
      total: Number(item.lineTotal ?? item.line_total ?? quantity * unitPrice),
    };
  });
  const doc = createServicePdf({
    title: 'Service order', reference, order, lines, total: orderTotal,
    paymentStatus: order.paymentStatus || order.payment_status || 'Unpaid', mechanicName,
  });
  doc.save(`LimenServe_Service_Order_${safeFilename(reference)}.pdf`);
}

export function downloadServiceReceiptPdf(order, sale) {
  if (!sale) throw new Error('No paid receipt is available yet.');
  const reference = sale.transaction_number || order.orderNumber || order.id || 'receipt';
  const lines = (sale.lines || []).map((line) => ({
    code: line.item_sku_snapshot || '',
    name: line.item_name_snapshot || '',
    quantity: Number(line.quantity ?? 1),
    unitPrice: Number(line.unit_price ?? 0),
    total: Number(line.line_total ?? 0),
  }));
  const doc = createServicePdf({
    title: 'Service receipt', reference, order, lines,
    total: sale.total_amount, paymentStatus: 'Paid', paymentMethod: sale.payment_method,
    paidAt: sale.created_at, cashReceived: sale.cash_received, changeDue: sale.change_due,
  });
  doc.save(`LimenServe_Service_Receipt_${safeFilename(reference)}.pdf`);
}
