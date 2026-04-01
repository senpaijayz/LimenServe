import { formatCurrency, formatDateTime } from '../../../utils/formatters';

const ReceiptRow = ({ label, value, strong = false, danger = false }) => (
    <div
        style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '3px 0',
            borderBottom: strong ? 'none' : '1px solid #ddd',
            color: danger ? '#b91c1c' : '#111827',
            fontWeight: strong ? '800' : danger ? '600' : '500',
            fontSize: strong ? '14px' : '12px',
        }}
    >
        <span>{label}</span>
        <span>{value}</span>
    </div>
);

const SaleReceiptPreview = ({ receipt, printId = 'pos-receipt' }) => {
    if (!receipt) {
        return null;
    }

    const items = receipt.items ?? [];
    const customerName = receipt.customerName || 'Walk-in Customer';

    return (
        <div className="receipt-preview" id={printId} style={{ fontFamily: 'Inter, Arial, sans-serif' }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid black', paddingBottom: '12px', marginBottom: '12px' }}>
                <img src="/LogoLimen.jpg" alt="Limen Logo" style={{ height: '48px', margin: '0 auto 6px', display: 'block', filter: 'grayscale(1) contrast(1.3)' }} />
                <h2 style={{ fontSize: '16px', fontWeight: '800', margin: 0, letterSpacing: '-0.5px' }}>LIMEN AUTO PARTS CENTER</h2>
                <p style={{ fontSize: '11px', margin: '2px 0 0', color: '#555' }}>1308, 264 Epifanio de los Santos Ave, Pasay City, 1308 Metro Manila</p>
                <p style={{ fontSize: '11px', margin: '1px 0 0', color: '#555' }}>Tel: +63 917 123 4567 | TIN: 000-123-456-000</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', gap: '12px' }}>
                <div>
                    <div>
                        <span style={{ fontWeight: '600' }}>Sold to: </span>
                        <span style={{ borderBottom: '1px solid #aaa', display: 'inline-block', minWidth: '180px', paddingBottom: '1px' }}>
                            {customerName}
                        </span>
                    </div>
                    <div style={{ marginTop: '4px' }}>
                        <span style={{ fontWeight: '600' }}>Payment: </span>
                        <span style={{ textTransform: 'capitalize' }}>{receipt.paymentMethod || 'cash'}</span>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div><span style={{ fontWeight: '600' }}>Date: </span><span>{formatDateTime(receipt.createdAt || receipt.businessDate)}</span></div>
                    <div><span style={{ fontWeight: '600' }}>Receipt No: </span><span>{receipt.transactionNumber}</span></div>
                    <div><span style={{ fontWeight: '600' }}>Sold by: </span><span>{receipt.cashierName || 'Cashier'}</span></div>
                </div>
            </div>

            <h3 style={{ textAlign: 'center', fontSize: '20px', fontWeight: '800', margin: '12px 0 14px', letterSpacing: '2px' }}>SALES INVOICE</h3>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr>
                        <th style={{ background: '#111', color: 'white', padding: '7px 10px', fontSize: '11px', fontWeight: '700', textAlign: 'left', textTransform: 'uppercase' }}>Qty</th>
                        <th style={{ background: '#111', color: 'white', padding: '7px 10px', fontSize: '11px', fontWeight: '700', textAlign: 'left', textTransform: 'uppercase' }}>Item</th>
                        <th style={{ background: '#111', color: 'white', padding: '7px 10px', fontSize: '11px', fontWeight: '700', textAlign: 'right', textTransform: 'uppercase' }}>Price/Unit</th>
                        <th style={{ background: '#111', color: 'white', padding: '7px 10px', fontSize: '11px', fontWeight: '700', textAlign: 'right', textTransform: 'uppercase' }}>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => (
                        <tr key={item.id}>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}>{item.quantity}</td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}>
                                <div style={{ fontWeight: '600' }}>{item.itemName}</div>
                                {item.itemSku && <div style={{ fontSize: '10px', color: '#6b7280' }}>{item.itemSku}</div>}
                            </td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px', textAlign: 'right' }}>{formatCurrency(item.unitPrice)}</td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(item.lineTotal)}</td>
                        </tr>
                    ))}
                    {items.length < 8 && Array.from({ length: 8 - items.length }).map((_, index) => (
                        <tr key={`empty-${index}`}>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}>&nbsp;</td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}></td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}></td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}></td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                <div style={{ width: '220px' }}>
                    <ReceiptRow label="Subtotal" value={formatCurrency(receipt.subtotal)} />

                    {Number(receipt.discountTotal ?? 0) > 0 && (
                        <ReceiptRow label="Discount" value={`-${formatCurrency(receipt.discountTotal)}`} danger />
                    )}

                    <ReceiptRow label="VAT (12%)" value={formatCurrency(receipt.taxTotal)} />

                    <div style={{ borderTop: '2px solid black', marginTop: '4px', paddingTop: '4px' }}>
                        <ReceiptRow label="Total" value={formatCurrency(receipt.totalAmount)} strong />
                    </div>

                    <ReceiptRow label="Cash Received" value={formatCurrency(receipt.cashReceived ?? 0)} />
                    <div style={{ borderTop: '1px solid #ddd', marginTop: '4px', paddingTop: '4px' }}>
                        <ReceiptRow label="Change Due" value={formatCurrency(receipt.changeDue ?? 0)} strong />
                    </div>
                </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: '28px', paddingTop: '12px', borderTop: '1px solid #ccc' }}>
                <p style={{ fontSize: '10px', color: '#666', fontWeight: '500' }}>Thank you for shopping at Limen Auto Parts Center!</p>
                <p style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>"Your Trusted Partner on the Road"</p>
            </div>
        </div>
    );
};

export default SaleReceiptPreview;
