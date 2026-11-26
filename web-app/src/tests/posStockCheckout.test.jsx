import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import POSTerminal from '../modules/pos/pages/POSTerminal';
import { CartProvider } from '../context/CartContext';
import { STORAGE_KEYS } from '../utils/constants';
const api = vi.hoisted(() => ({ error:vi.fn(),success:vi.fn(),prices:vi.fn(),sale:vi.fn(),products:[],totalPages:1,fetchingPages:new Set() }));
vi.mock('../hooks/useProductCatalog', () => ({ default:({page=1}={}) => ({products:api.products,pagination:{page:api.responsePage ?? page,totalPages:api.totalPages,totalCount:api.totalPages*14,pageSize:14},loading:false,isFetching:api.fetchingPages.has(page)}) }));
vi.mock('../context/useAuth', () => ({ useAuth:() => ({user:{id:'staff-test',role:'cashier'}}) }));
vi.mock('../hooks/useBarcodeScanner', () => ({default:vi.fn()}));
vi.mock('../store/useDataStore', () => ({default:() => ({findProduct:vi.fn()})}));
vi.mock('../components/ui/Toast', () => ({useToast:() => ({error:api.error,success:api.success})}));
vi.mock('../services/catalogApi', () => ({getCurrentRetailPrices:api.prices}));
vi.mock('../services/posApi', () => ({createPosSale:api.sale}));
vi.mock('../components/ui/BarcodeDisplay', () => ({default:() => null}));
vi.mock('../components/ui/LargeBarcodeModal', () => ({default:() => null}));
vi.mock('../components/ui/CameraScannerModal', () => ({default:() => null}));
vi.mock('../modules/inventory/components/ProductPriceHistory', () => ({default:() => null}));
vi.mock('../modules/pos/components/SaleReceiptPreview.jsx', () => ({default:() => null}));
const part = {id:'p',name:'Thermostat',sku:'PART',price:100,stock:0,availableStock:0};
function CurrentLocation() {
 const { pathname, state } = useLocation();
 return <output aria-label="Test route">{pathname} {state?.posService?.name}</output>;
}
const mount = () => render(<MemoryRouter><CartProvider><POSTerminal /><CurrentLocation /></CartProvider></MemoryRouter>);
beforeEach(() => {vi.clearAllMocks();window.localStorage.clear();api.products=[part];api.totalPages=1;api.responsePage=undefined;api.fetchingPages=new Set();api.prices.mockResolvedValue([{productId:'p',price:100,available:true,availableStock:0}]);});
afterEach(cleanup);
it.each([
 ['Add to service order', '/services/new Brake cleaning', false],
 ['Add to sale', '/', true],
])('routes custom labor correctly when choosing %s', (action, path, goesToCart) => {
 mount();
 fireEvent.click(screen.getByRole('button', { name: 'Add service' }));
 fireEvent.change(screen.getByPlaceholderText('e.g., Change Oil Labor, Installation'), { target: { value: 'Brake cleaning' } });
 fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '420.25' } });
 fireEvent.click(screen.getByRole('button', { name: action }));
 expect(screen.getByLabelText('Test route').textContent.trim()).toBe(path);
 expect(Boolean(screen.queryByRole('list', { name: 'Items in current sale' }))).toBe(goesToCart);
 expect(api.sale).not.toHaveBeenCalled();
});
it('always shows the compact product layout without a size selector', () => {
 mount();
 expect(screen.queryByRole('combobox',{name:'Product display size'})).toBeNull();
 expect(screen.getByRole('region',{name:'Product browsing'}).querySelector('.pos-products-grid.pos-products-compact')).toBeTruthy();
});
it('hides the previous page and centers a loader while moving to the next page', () => {
 api.totalPages=3;api.fetchingPages=new Set([2]);mount();
 fireEvent.click(screen.getByRole('button',{name:'Next product page'}));
 const catalog = screen.getByRole('region',{name:'Parts and services'});
 expect(within(catalog).getByText('Updating the parts list. Please wait.')).toBeTruthy();
 expect(catalog.textContent).toContain('Loading page 2 of 3…');
 expect(screen.queryByRole('button',{name:/PART.*Thermostat/})).toBeNull();
 expect(screen.getByRole('button',{name:'Previous product page'}).disabled).toBe(true);
 expect(screen.getByRole('button',{name:'Next product page'}).disabled).toBe(true);
});
it('warns immediately and does not add a zero-stock product', () => {
 mount();fireEvent.click(screen.getByRole('button',{name:/PART.*Thermostat/}));
 expect(api.error).toHaveBeenCalledWith(expect.stringContaining('out of stock'));
 expect(screen.getByText('Your sale starts here')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Review payment'}).disabled).toBe(true);
});
it('caps the cart at unreserved availability instead of physical stock', () => {
 api.products=[{...part,stock:8,availableStock:2}];mount();
 const button=screen.getByRole('button',{name:/PART.*Thermostat/});
 fireEvent.click(button);fireEvent.click(button);fireEvent.click(button);
 expect(api.error).toHaveBeenCalledWith(expect.stringContaining('available quantity is already in the cart'));
 expect(screen.getByRole('button',{name:'Increase Thermostat quantity'}).disabled).toBe(true);
});
it('blocks restored/stale carts before opening checkout and submits no sale', async () => {
 window.localStorage.setItem(`${STORAGE_KEYS.CART}:staff:staff-test`,JSON.stringify([{id:'p',productId:'p',name:'Thermostat',sku:'PART',lineType:'product',quantity:1,maxQuantity:999,price:100}]));
 mount();fireEvent.click(screen.getByRole('button',{name:'Review payment'}));
 await waitFor(() => expect(api.error).toHaveBeenCalledWith(expect.stringContaining('Insufficient or unconfirmed available stock')));
 expect(screen.queryByText('Cash Checkout')).toBeNull();
 expect(api.sale).not.toHaveBeenCalled();
});
