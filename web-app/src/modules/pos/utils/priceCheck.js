export function checkCartPrices(items, prices) {
    const byId = new Map(prices.map((row) => [row.productId, row]));
    const products = items.filter((item) => item.lineType !== 'service' && item.sku !== 'SERVICE');
    return {
        unavailable: products.filter((item) => {
            const row = byId.get(item.productId || item.id);
            return !row?.available || row.price == null || !Number.isFinite(Number(row.price));
        }),
        changed: products.filter((item) => {
            const row = byId.get(item.productId || item.id);
            return row?.available && row.price != null && Math.round(Number(row.price) * 100) !== Math.round(Number(item.price) * 100);
        }),
    };
}
