import { jsPDF } from 'jspdf';

const COLORS = {
    navy: [23, 37, 84],
    blue: [29, 78, 216],
    text: [16, 24, 40],
    muted: [100, 116, 139],
    border: [203, 213, 225],
    pale: [234, 240, 248],
    alternate: [248, 250, 252],
    white: [255, 255, 255],
};

function pdfText(value) {
    return String(value ?? '')
        .replace(/₱/g, 'PHP ')
        .replace(/[—–]/g, '-')
        .replace(/·/g, '|')
        .replace(/…/g, '...');
}

function safeFilename(value) {
    return String(value || 'LimenServe_Report')
        .replace(/[<>:"\\|?*]/g, '_')
        .replaceAll('/', '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^[_-]+|[_-]+$/g, '');
}

function drawWrappedText(doc, value, x, y, width, options = {}) {
    const text = pdfText(value);
    const lines = doc.splitTextToSize(text, width);
    doc.text(lines, x, y, options);
    return lines.length;
}

/** Build a selectable-text, paginated A4 PDF from report data. */
export function createReportPdf({
    title,
    dateRange,
    generatedAt,
    generatedBy,
    filename,
    filters = [],
    summaryCards = [],
    summaryColumns = 4,
    introText = '',
    sections = [],
    signatureLabels = [],
    verificationNote = '',
    reportId = 'LimenServe Report',
}) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    doc.setProperties({ title: pdfText(title), subject: pdfText(dateRange), author: pdfText(generatedBy || 'LimenServe') });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 10;
    const contentWidth = pageWidth - marginX * 2;
    const contentBottom = pageHeight - 15;
    const lineHeight = 3.45;
    let y = 0;

    const drawPageHeader = (continued = false) => {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.blue);
        doc.setFontSize(8);
        doc.text('LIMENSERVE', marginX, 11);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.muted);
        doc.setFontSize(8);
        doc.text('Limen Auto Supply and Services', marginX, 15);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.navy);
        doc.setFontSize(16);
        doc.text(pdfText(title) + (continued ? ' - continued' : ''), marginX, 23);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.text);
        doc.setFontSize(8);
        doc.text(`Period: ${pdfText(dateRange || 'All dates')}`, pageWidth - marginX, 12, { align: 'right' });
        doc.setTextColor(...COLORS.muted);
        doc.text(`Generated: ${pdfText(generatedAt || '')}`, pageWidth - marginX, 16, { align: 'right' });
        doc.text(`Prepared by: ${pdfText(generatedBy || 'LimenServe user')}`, pageWidth - marginX, 20, { align: 'right' });

        doc.setDrawColor(...COLORS.navy);
        doc.setLineWidth(0.7);
        doc.line(marginX, 28, pageWidth - marginX, 28);
        return 33;
    };

    const addPage = () => {
        doc.addPage();
        y = drawPageHeader(true);
    };

    const drawFilters = () => {
        if (!filters.length) return;
        const text = filters.map(({ label, value }) => `${label}: ${value || 'All'}`).join('   |   ');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...COLORS.muted);
        const lineCount = drawWrappedText(doc, text, marginX, y, contentWidth);
        y += Math.max(lineHeight, lineCount * lineHeight) + 2;
    };

    const drawSummary = () => {
        if (!summaryCards.length) return;
        const columns = Math.max(1, Math.min(summaryColumns, summaryCards.length));
        const gap = 3;
        const cardWidth = (contentWidth - gap * (columns - 1)) / columns;
        const cardHeight = 14;
        summaryCards.forEach((card, index) => {
            const row = Math.floor(index / columns);
            const col = index % columns;
            const x = marginX + col * (cardWidth + gap);
            const top = y + row * (cardHeight + gap);
            doc.setFillColor(...COLORS.white);
            doc.setDrawColor(...COLORS.border);
            doc.roundedRect(x, top, cardWidth, cardHeight, 1.5, 1.5, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...COLORS.muted);
            doc.setFontSize(6.5);
            drawWrappedText(doc, card.label, x + 2, top + 4, cardWidth - 4);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...(card.tone === 'green' ? [5, 150, 105] : card.tone === 'red' ? [220, 38, 38] : COLORS.text));
            doc.setFontSize(10);
            drawWrappedText(doc, card.value, x + 2, top + 10.5, cardWidth - 4);
        });
        const rows = Math.ceil(summaryCards.length / columns);
        y += rows * cardHeight + Math.max(0, rows - 1) * gap + 4;
    };

    const drawSectionTitle = (section, continued = false) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.navy);
        doc.text(pdfText(section.title) + (continued ? ' (continued)' : ''), marginX, y + 3.5);
        y += 5.5;
        if (!continued && section.subtitle) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...COLORS.muted);
            const lineCount = drawWrappedText(doc, section.subtitle, marginX, y + 2.5, contentWidth);
            y += Math.max(4.5, lineCount * 3.2 + 1);
        }
    };

    const drawTableHeader = (columns, widths) => {
        const headerHeight = 8;
        let x = marginX;
        columns.forEach((column, index) => {
            const width = widths[index];
            doc.setFillColor(...COLORS.pale);
            doc.setDrawColor(...COLORS.border);
            doc.rect(x, y, width, headerHeight, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.5);
            doc.setTextColor(...COLORS.navy);
            const lines = doc.splitTextToSize(pdfText(column.label).toUpperCase(), width - 3).slice(0, 2);
            doc.text(lines, x + 1.5, y + 3.1);
            x += width;
        });
        y += headerHeight;
    };

    const drawSectionTable = (section) => {
        const columns = section.columns || [];
        const weights = columns.map((column) => Number(column.width) || 1);
        const totalWeight = weights.reduce((sum, width) => sum + width, 0) || 1;
        const widths = weights.map((weight) => contentWidth * weight / totalWeight);
        const sectionHeaderHeight = 15;
        if (y + sectionHeaderHeight > contentBottom) addPage();
        drawSectionTitle(section);
        drawTableHeader(columns, widths);

        const rows = section.rows || [];
        if (!rows.length) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...COLORS.muted);
            const messageLines = doc.splitTextToSize(pdfText(section.emptyMessage || 'No records'), contentWidth - 4);
            const messageHeight = messageLines.length * lineHeight + 3;
            if (y + messageHeight > contentBottom) {
                addPage();
                drawSectionTitle(section, true);
                drawTableHeader(columns, widths);
            }
            doc.setFillColor(...COLORS.alternate);
            doc.setDrawColor(...COLORS.border);
            doc.rect(marginX, y, contentWidth, messageHeight, 'FD');
            doc.text(messageLines, marginX + 2, y + 2);
            y += messageHeight + 4;
            return;
        }
        rows.forEach((row, rowIndex) => {
            const lineSets = columns.map((column, columnIndex) => (
                doc.splitTextToSize(pdfText(row[columnIndex] ?? ''), Math.max(widths[columnIndex] - 3, 4))
            ));
            const maxLines = Math.max(1, ...lineSets.map((lines) => lines.length));
            let offset = 0;

            while (offset < maxLines) {
                const availableHeight = contentBottom - y;
                const maxChunkLines = Math.floor((availableHeight - 2) / lineHeight);
                if (maxChunkLines < 1) {
                    addPage();
                    drawSectionTitle(section, true);
                    drawTableHeader(columns, widths);
                    continue;
                }
                const chunkLines = Math.min(maxChunkLines, maxLines - offset);
                const rowHeight = chunkLines * lineHeight + 2;
                let x = marginX;
                columns.forEach((column, columnIndex) => {
                    const width = widths[columnIndex];
                    doc.setFillColor(...(rowIndex % 2 ? COLORS.alternate : COLORS.white));
                    doc.setDrawColor(...COLORS.border);
                    doc.rect(x, y, width, rowHeight, 'FD');
                    const textLines = lineSets[columnIndex].slice(offset, offset + chunkLines);
                    if (textLines.length) {
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(7);
                        doc.setTextColor(...COLORS.text);
                        if (column.align === 'right') {
                            doc.text(textLines, x + width - 1.5, y + 1.5, { align: 'right' });
                        } else {
                            doc.text(textLines, x + 1.5, y + 1.5);
                        }
                    }
                    x += width;
                });
                y += rowHeight;
                offset += chunkLines;
                if (offset < maxLines) {
                    addPage();
                    drawSectionTitle(section, true);
                    drawTableHeader(columns, widths);
                }
            }
        });
        y += 4;
    };

    const drawSignatures = () => {
        if (!signatureLabels.length) return;
        const needed = 20;
        if (y + needed > contentBottom) addPage();
        const gap = 10;
        const width = (contentWidth - gap * (signatureLabels.length - 1)) / signatureLabels.length;
        signatureLabels.forEach((label, index) => {
            const x = marginX + index * (width + gap);
            const lineY = y + 9;
            doc.setDrawColor(71, 85, 105);
            doc.setLineWidth(0.35);
            doc.line(x + 5, lineY, x + width - 5, lineY);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(...COLORS.text);
            doc.text(pdfText(label), x + width / 2, lineY + 4, { align: 'center' });
        });
        y += needed;
    };

    y = drawPageHeader();
    drawFilters();
    drawSummary();

    if (introText) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...COLORS.muted);
        const lines = drawWrappedText(doc, introText, marginX, y, contentWidth);
        y += lines * lineHeight + 3;
    }

    sections.forEach(drawSectionTable);

    const noteLines = verificationNote ? doc.splitTextToSize(pdfText(verificationNote), contentWidth) : [];
    const noteHeight = noteLines.length ? noteLines.length * lineHeight + 3 : 0;
    if (signatureLabels.length && y + 20 + noteHeight > contentBottom) addPage();
    drawSignatures();

    if (noteLines.length) {
        if (y + noteHeight > contentBottom) addPage();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...COLORS.muted);
        doc.text(noteLines, marginX, y + 2);
    }

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setDrawColor(...COLORS.border);
        doc.setLineWidth(0.25);
        doc.line(marginX, pageHeight - 10, pageWidth - marginX, pageHeight - 10);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...COLORS.muted);
        doc.text(pdfText(reportId), marginX, pageHeight - 6);
        doc.text(`Page ${page} of ${pageCount}`, pageWidth - marginX, pageHeight - 6, { align: 'right' });
    }

    return { doc, filename: `${safeFilename(filename || title)}.pdf` };
}

export function downloadReportPdf(options) {
    const { doc, filename } = createReportPdf(options);
    doc.save(filename);
}

export { safeFilename as safeReportFilename };
