import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, ListPlus, MapPinned, PackageCheck, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { formatNumber } from '../../../utils/formatters';
import {
  DIAMOND_MOTOR_INVOICE_SAMPLE,
  getSupplierInvoiceTotals,
  supplierInvoiceStockReceiptSchema,
  type SupplierInvoiceStockReceiptFormValues,
} from '../schemas';
import { receiveStockFromSupplierInvoice, StockReceiptProcessingError } from '../services/receiveStock';
import type { StockReceiptPostResult } from '../types';
import { useLocator3DStore } from '../../locator3d/store/useLocator3DStore';

const emptyLineItem = () => ({
  brand: 'Mitsubishi',
  description: '',
  lineId: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
  partNumber: '',
  quantity: 1,
  unitCost: 0,
  uom: 'PC',
});

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-semibold text-rose-600">{message}</p>;
}

function inputClass(hasError = false) {
  return [
    'min-h-11 w-full rounded-xl border bg-white px-3 text-sm font-bold text-primary-950 outline-none transition',
    hasError ? 'border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-100' : 'border-primary-200 focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/10',
  ].join(' ');
}

export default function ReceiveStockFromInvoice() {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const setRecentlyReceivedStock = useLocator3DStore((state) => state.setRecentlyReceivedStock);
  const [postedReceipt, setPostedReceipt] = useState<StockReceiptPostResult | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const form = useForm<SupplierInvoiceStockReceiptFormValues>({
    defaultValues: {
      invoiceDate: new Date().toISOString().slice(0, 10),
      invoiceNumber: '',
      items: [emptyLineItem()],
      ocrReady: false,
      source: 'manual_invoice',
      supplierName: 'Diamond Motor Corporation',
    },
    mode: 'onBlur',
    resolver: zodResolver(supplierInvoiceStockReceiptSchema),
  });

  const { append, fields, remove, replace } = useFieldArray({
    control: form.control,
    name: 'items',
  });
  const watchedItems = form.watch('items');
  const totals = useMemo(() => getSupplierInvoiceTotals({ items: watchedItems as never }), [watchedItems]);
  const isPosting = form.formState.isSubmitting;
  const hasUnsavedInput = form.formState.isDirty && !postedReceipt;

  const handleUseSample = () => {
    form.reset({
      ...DIAMOND_MOTOR_INVOICE_SAMPLE,
      items: DIAMOND_MOTOR_INVOICE_SAMPLE.items.map((item) => ({ ...item, lineId: crypto.randomUUID?.() ?? item.lineId })),
    });
  };

  const handleCancel = () => {
    if (hasUnsavedInput) {
      setShowDiscardConfirm(true);
      return;
    }

    navigate('/inventory');
  };

  const handlePost = form.handleSubmit(async (values) => {
    setPostedReceipt(null);
    try {
      const receipt = await receiveStockFromSupplierInvoice(values);
      setPostedReceipt(receipt);
      success('Stock receipt posted.');
    } catch (postError) {
      if (postError instanceof StockReceiptProcessingError && postError.issues.length > 0) {
        showError(`${postError.message} ${postError.issues[0].message}`);
        return;
      }

      showError(postError instanceof Error ? postError.message : 'Unable to post stock receipt.');
    }
  });

  const handleAssignLocations = () => {
    if (!postedReceipt) return;

    setRecentlyReceivedStock({
      receiptId: postedReceipt.receiptId,
      returnTo: '/inventory/receive-stock',
      source: 'stock_receipt',
      items: postedReceipt.items.map((item) => ({
        description: item.description,
        partNumber: item.partNumber,
        productId: item.productId,
        quantity: item.quantity,
      })),
    });

    navigate('/locator-3d?mode=stock-receipt', {
      state: {
        receiptId: postedReceipt.receiptId,
        receivedItems: postedReceipt.items,
      },
    });
  };

  if (postedReceipt) {
    return (
      <Motion.main
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
        initial={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      >
        <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
          <div className="border-b border-emerald-100 bg-emerald-50 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <Motion.span
                  animate={{ scale: 1, rotate: 0 }}
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm"
                  initial={{ scale: 0.82, rotate: -6 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                >
                  <CheckCircle2 className="h-7 w-7" />
                </Motion.span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Stock posted</p>
                  <h1 className="mt-1 text-2xl font-black text-primary-950">Invoice stock received</h1>
                  <p className="mt-2 text-sm font-semibold text-primary-600">
                    {postedReceipt.supplierName} / Invoice {postedReceipt.invoiceNumber}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => navigate('/inventory')} leftIcon={<ArrowLeft className="h-4 w-4" />}>
                  Back to Inventory
                </Button>
                <Button variant="primary" onClick={handleAssignLocations} leftIcon={<MapPinned className="h-4 w-4" />}>
                  Assign Locations in 3D Stockroom
                </Button>
              </div>
            </div>
          </div>
          <div className="grid gap-4 p-6 md:grid-cols-3">
            <div className="rounded-xl border border-primary-100 bg-primary-50/70 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Items</p>
              <p className="mt-2 text-3xl font-black text-primary-950">{formatNumber(postedReceipt.totalLines)}</p>
            </div>
            <div className="rounded-xl border border-primary-100 bg-primary-50/70 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Quantity</p>
              <p className="mt-2 text-3xl font-black text-primary-950">{formatNumber(postedReceipt.totalQuantity)}</p>
            </div>
            <div className="rounded-xl border border-primary-100 bg-primary-50/70 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Next Step</p>
              <p className="mt-2 text-sm font-bold leading-6 text-primary-700">Assign or confirm aisle, shelf, and bin locations for the received items.</p>
            </div>
          </div>
          <div className="border-t border-primary-100 p-6">
            <div className="overflow-hidden rounded-xl border border-primary-100">
              {postedReceipt.items.map((item) => (
                <div className="grid gap-3 border-b border-primary-100 px-4 py-3 text-sm last:border-b-0 md:grid-cols-[1fr_auto_auto]" key={`${item.productId}-${item.lineNumber}`}>
                  <div className="min-w-0">
                    <p className="truncate font-black text-primary-950">{item.description}</p>
                    <p className="font-mono text-xs font-bold text-primary-500">{item.partNumber}</p>
                  </div>
                  <span className="font-bold text-primary-600">+{formatNumber(item.quantity)} units</span>
                  <span className="font-bold text-emerald-700">{formatNumber(item.previousStock)} to {formatNumber(item.updatedStock)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Motion.main>
    );
  }

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border border-primary-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-primary-500">Stock In from Invoice</p>
            <h1 className="mt-1 text-2xl font-black text-primary-950">Receive Stock from Supplier Invoice</h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={handleUseSample} leftIcon={<ClipboardList className="h-4 w-4" />}>
              Use Sample
            </Button>
            <Button variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      </section>

      <form className="space-y-6" onSubmit={handlePost}>
        <section className="rounded-2xl border border-primary-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label>
              <span className="mb-2 block text-xs font-bold text-primary-600">Invoice No.</span>
              <input className={inputClass(Boolean(form.formState.errors.invoiceNumber))} {...form.register('invoiceNumber')} />
              <FieldError message={form.formState.errors.invoiceNumber?.message} />
            </label>
            <label>
              <span className="mb-2 block text-xs font-bold text-primary-600">Invoice Date</span>
              <input className={inputClass(Boolean(form.formState.errors.invoiceDate))} type="date" {...form.register('invoiceDate')} />
              <FieldError message={form.formState.errors.invoiceDate?.message} />
            </label>
            <label className="xl:col-span-2">
              <span className="mb-2 block text-xs font-bold text-primary-600">Supplier</span>
              <input className={inputClass(Boolean(form.formState.errors.supplierName))} {...form.register('supplierName')} />
              <FieldError message={form.formState.errors.supplierName?.message} />
            </label>
            <label className="md:col-span-2">
              <span className="mb-2 block text-xs font-bold text-primary-600">PO / Order Ref.</span>
              <input className={inputClass()} {...form.register('poReference')} />
            </label>
            <label className="md:col-span-2">
              <span className="mb-2 block text-xs font-bold text-primary-600">Notes</span>
              <input className={inputClass()} {...form.register('notes')} />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-primary-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-primary-100 p-5">
            <div>
              <h2 className="text-lg font-black text-primary-950">Line Items</h2>
              <p className="mt-1 text-sm font-semibold text-primary-500">{fields.length} rows / {formatNumber(totals.totalQuantity)} units</p>
            </div>
            <Button variant="secondary" onClick={() => append(emptyLineItem())} leftIcon={<ListPlus className="h-4 w-4" />}>
              Add Row
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-left">
              <thead className="bg-primary-50 text-xs font-black uppercase tracking-[0.12em] text-primary-500">
                <tr>
                  <th className="px-4 py-3">Part Number</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Unit Cost</th>
                  <th className="px-4 py-3 text-right">Line Total</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {fields.map((field, index) => {
                    const row = watchedItems?.[index] ?? {};
                    const lineTotal = Number(row.quantity || 0) * Number(row.unitCost || 0);
                    return (
                      <Motion.tr
                        animate={{ opacity: 1 }}
                        className="border-t border-primary-100"
                        exit={{ opacity: 0 }}
                        initial={{ opacity: 0 }}
                        key={field.id}
                      >
                        <td className="px-4 py-3 align-top">
                          <input className={inputClass(Boolean(form.formState.errors.items?.[index]?.partNumber))} {...form.register(`items.${index}.partNumber`)} />
                          <FieldError message={form.formState.errors.items?.[index]?.partNumber?.message} />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <input className={inputClass(Boolean(form.formState.errors.items?.[index]?.description))} {...form.register(`items.${index}.description`)} />
                          <FieldError message={form.formState.errors.items?.[index]?.description?.message} />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <input className={inputClass(Boolean(form.formState.errors.items?.[index]?.quantity))} min="0.01" step="0.01" type="number" {...form.register(`items.${index}.quantity`)} />
                          <FieldError message={form.formState.errors.items?.[index]?.quantity?.message} />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <input className={inputClass(Boolean(form.formState.errors.items?.[index]?.unitCost))} min="0" step="0.01" type="number" {...form.register(`items.${index}.unitCost`)} />
                          <FieldError message={form.formState.errors.items?.[index]?.unitCost?.message} />
                        </td>
                        <td className="px-4 py-3 text-right align-top text-sm font-black text-primary-950">{formatNumber(lineTotal)}</td>
                        <td className="px-4 py-3 align-top">
                          <button
                            aria-label={`Remove line ${index + 1}`}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-primary-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                            disabled={fields.length <= 1}
                            onClick={() => remove(index)}
                            type="button"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </Motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </section>

        <section className="sticky bottom-4 z-10 rounded-2xl border border-primary-200 bg-white/95 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.14)] backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-950 text-white"><PackageCheck className="h-5 w-5" /></span>
              <div>
                <p className="text-sm font-black text-primary-950">{formatNumber(totals.totalLines)} items / {formatNumber(totals.totalQuantity)} units ready</p>
                <p className="text-xs font-semibold text-primary-500">Review the invoice rows before posting stock.</p>
              </div>
            </div>
            <Button
              disabled={isPosting}
              isLoading={isPosting}
              type="submit"
              leftIcon={<CheckCircle2 className="h-4 w-4" />}
            >
              Review & Post Stock
            </Button>
          </div>
        </section>
      </form>

      {showDiscardConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><AlertTriangle className="h-5 w-5" /></span>
              <div>
                <h2 className="text-lg font-black text-primary-950">Discard invoice draft?</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-primary-600">The rows you entered have not been posted yet.</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowDiscardConfirm(false)}>Keep Editing</Button>
              <Button variant="danger" onClick={() => navigate('/inventory')}>Discard</Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
