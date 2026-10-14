export function getCartStockIssues(items, stockRows) {
    const byId = new Map(stockRows.map((row) => [row.productId, row]));
    return items.filter((item) => {
        if (item.lineType === 'service' || item.sku === 'SERVICE') return false;
        const value = byId.get(item.productId || item.id)?.availableStock;
        const stock = value == null ? NaN : Number(value);
        return !Number.isFinite(stock) || !Number.isFinite(Number(item.quantity))
            || Number(item.quantity) <= 0 || Number(item.quantity) > Math.max(0, stock);
    });
}
