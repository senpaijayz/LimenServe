import { useEffect, useRef, useState } from 'react';
import { getServiceIntakeResult, sendPosWorkshopOrder } from '../../../services/serviceOrdersApi';
import { STORAGE_KEYS } from '../../../utils/constants';

export const isWorkshopLabor = (item) => item.lineType === 'service' || Boolean(item.serviceId) || item.sku === 'SERVICE';

export default function usePosWorkshopIntake(owner, clearCart, openOrder) {
  const key = `limen-pos-workshop-intake:v1:${owner}`;
  const cartKey = `${STORAGE_KEYS.CART}:staff:${owner}`;
  const read = () => JSON.parse(localStorage.getItem(key) || 'null');
  const [pending, setPending] = useState(() => {
    try { return read(); } catch { return { blocked: true }; }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const active = useRef(true);
  const withCartLock = (action) => navigator.locks ? navigator.locks.request(key, action) : action();
  useEffect(() => {
    active.current = true;
    const sync = (event) => {
      if (event.key !== key) return;
      try { setPending(JSON.parse(event.newValue || 'null')); }
      catch { setPending({ blocked: true }); }
    };
    window.addEventListener('storage', sync);
    return () => { active.current = false; window.removeEventListener('storage', sync); };
  }, [key]);

  const run = async (cart, extraLabor) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError('');
    const send = async () => {
      let op = read();
      const rawCart = localStorage.getItem(cartKey);
      if (!op) {
        if (!cart) throw new Error('No unfinished workshop request is saved on this device.');
        if (JSON.stringify(JSON.parse(rawCart || '[]')) !== JSON.stringify(cart)) {
          throw new Error('The POS cart changed in another tab. Reload POS before sending it.');
        }
        const items = [...cart, ...(extraLabor ? [extraLabor] : [])].map((item) => ({
          lineType: isWorkshopLabor(item) ? 'service' : 'product',
          ...(isWorkshopLabor(item) ? { itemName: item.name } : { productId: item.productId || item.id }),
          quantity: item === extraLabor ? 1 : item.quantity,
          unitPrice: item.price,
        }));
        op = { intakeRequestId: crypto.randomUUID(), items, cart: JSON.stringify(cart) };
        localStorage.setItem(key, JSON.stringify(op));
        setPending(op);
      }
      if (!op.intakeRequestId || !Array.isArray(op.items)) throw new Error('The saved workshop reference is unreadable. Check Service Orders before attempting another checkout.');
      let orderId;
      try {
        const order = await sendPosWorkshopOrder({ intakeRequestId: op.intakeRequestId, items: op.items });
        orderId = order?.id;
      } catch (failure) {
        const recovered = await getServiceIntakeResult(op.intakeRequestId);
        orderId = recovered?.orderId;
        if (!orderId && failure.definitive) {
          localStorage.removeItem(key);
          if (active.current) setPending(null);
        }
        if (!orderId) throw failure;
      }
      if (!orderId) throw new Error('The service order could not be confirmed. Retry this same request before charging or releasing anything.');
      if (!active.current) return false;
      const current = JSON.stringify(JSON.parse(localStorage.getItem(cartKey) || '[]'));
      if (current !== op.cart && current !== '[]') {
        throw new Error(`Service order ${orderId} was saved, but this cart changed in another tab. Do not check out these items. Reopen the original cart or contact an administrator.`);
      }
      clearCart();
      localStorage.removeItem(key);
      setPending(null);
      openOrder(orderId);
      return true;
    };
    try {
      return await withCartLock(send);
    } catch (failure) {
      if (active.current) setError(failure.message || 'Could not confirm the service order. No payment should be taken.');
      return false;
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  };
  const canCheckOut = (cart) => {
    try { return !read() && JSON.stringify(JSON.parse(localStorage.getItem(cartKey) || '[]')) === JSON.stringify(cart); }
    catch { return false; }
  };
  return { pending, busy, error, send: run, retry: () => run(), canCheckOut, withCartLock };
}
