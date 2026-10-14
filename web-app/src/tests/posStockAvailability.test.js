import { expect, it } from 'vitest';
import { getCartStockIssues } from '../modules/pos/utils/stockAvailability';
const item = { id: 'p', lineType: 'product', quantity: 2 };
it('blocks zero, insufficient, missing and invalid stock but not valid availability', () => {
    for (const availableStock of [0,1,null,undefined,'invalid']) expect(getCartStockIssues([item],[{productId:'p',availableStock}])).toEqual([item]);
    expect(getCartStockIssues([item],[{productId:'p',availableStock:2}])).toEqual([]);
    expect(getCartStockIssues([item],[])).toEqual([item]);
});
it('does not block labor services on inventory balances', () => {
    expect(getCartStockIssues([{id:'s',lineType:'service',quantity:1}],[])).toEqual([]);
});
