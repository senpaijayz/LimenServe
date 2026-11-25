import { describe, expect, it } from 'vitest';
import { createReportPdf, safeReportFilename } from './reportPdf.js';

describe('report PDF generation', () => {
    it('creates a readable A4 PDF and sanitizes its download name', () => {
        const { doc, filename } = createReportPdf({
            title: 'Inventory Audit Report',
            dateRange: '2026-11-01 to 2026-11-25',
            generatedAt: 'Nov 25, 2026, 8:00 AM',
            generatedBy: 'LimenServe Staff',
            filename: 'Inventory Audit Report: 2026-11-01/2026-11-25',
            summaryCards: [{ label: 'Active Prices', value: '1,234' }],
            sections: [{
                title: 'Stock Changes',
                columns: [{ label: 'Part Number', width: 60 }, { label: 'Quantity', width: 20, align: 'right' }, { label: 'Amount', width: 20 }],
                rows: [['PA0012', '2', 'PHP 350.00']],
            }],
            signatureLabels: ['Prepared By', 'Approved By'],
        });

        expect(filename).toBe('Inventory_Audit_Report_2026-11-01_2026-11-25.pdf');
        expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(doc.internal.pageSize.getHeight());
        expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(1000);
        expect(doc.getNumberOfPages()).toBe(1);
    });

    it('flows long tables across pages instead of clipping the rows', () => {
        const { doc } = createReportPdf({
            title: 'Sales Analytics Report',
            dateRange: '2026-01-01 to 2026-11-25',
            generatedAt: 'Nov 25, 2026',
            generatedBy: 'LimenServe Staff',
            filename: 'sales',
            sections: [{
                title: 'Sales History',
                columns: [{ label: 'Receipt', width: 25 }, { label: 'Customer', width: 45 }, { label: 'Notes', width: 30 }],
                rows: Array.from({ length: 100 }, (_, index) => [`R-${index + 1}`, `Customer ${index + 1}`, 'Completed sale with a longer note for printing.']),
            }],
        });

        expect(doc.getNumberOfPages()).toBeGreaterThan(1);
        expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(1000);
    });

    it('returns safe names for the report download', () => {
        expect(safeReportFilename('Sales: report/2026*11?25')).toBe('Sales_report_2026_11_25');
    });
});
