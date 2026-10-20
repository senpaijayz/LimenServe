export default function formatReportProductName(product) {
    const partNumber = String(product?.sku || product?.partNumber || product?.part_number || '').trim();
    const name = String(product?.product_name || product?.productName || product?.name || '').trim();

    if (partNumber && name) return `${partNumber} (${name})`;
    return partNumber || name || 'Unknown product';
}
