export function buildLocator3DUrl(product = {}) {
    const params = new URLSearchParams();

    if (product.id) {
        params.set('productId', product.id);
    }

    if (product.sku) {
        params.set('sku', product.sku);
    }

    if (product.name) {
        params.set('name', product.name);
    }

    const query = params.toString();

    return query ? `/locator-3d?${query}` : '/locator-3d';
}
