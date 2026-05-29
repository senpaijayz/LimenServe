import { useEffect, useMemo, useState } from 'react';
import { Edit2, Plus, RefreshCw, Save, Search, Trash2, Truck } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Modal from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { createSupplier, deleteSupplier, getSuppliers, updateSupplier } from '../../../services/catalogApi';
import { formatDateTime, formatNumber } from '../../../utils/formatters';

const emptyForm = {
  supplierId: '',
  name: '',
  contactName: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
};

const inputClassName = 'w-full rounded-xl border border-primary-200 bg-white px-4 py-3 text-sm text-primary-950 shadow-sm outline-none transition focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/15';

function SupplierForm({ value, onChange }) {
  const update = (field, nextValue) => onChange({ ...value, [field]: nextValue });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Supplier ID</span>
        <input className={`${inputClassName} mt-2`} value={value.supplierId} onChange={(event) => update('supplierId', event.target.value)} placeholder="Auto-generated if blank" />
      </label>
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Supplier Name</span>
        <input className={`${inputClassName} mt-2`} value={value.name} onChange={(event) => update('name', event.target.value)} required />
      </label>
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Contact Person</span>
        <input className={`${inputClassName} mt-2`} value={value.contactName} onChange={(event) => update('contactName', event.target.value)} />
      </label>
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Phone</span>
        <input className={`${inputClassName} mt-2`} value={value.phone} onChange={(event) => update('phone', event.target.value)} />
      </label>
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Email</span>
        <input className={`${inputClassName} mt-2`} type="email" value={value.email} onChange={(event) => update('email', event.target.value)} />
      </label>
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Address</span>
        <input className={`${inputClassName} mt-2`} value={value.address} onChange={(event) => update('address', event.target.value)} />
      </label>
      <label className="block md:col-span-2">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Notes</span>
        <textarea className={`${inputClassName} mt-2 min-h-28`} value={value.notes} onChange={(event) => update('notes', event.target.value)} />
      </label>
    </div>
  );
}

export default function SupplierManagement() {
  const { success, error: showError } = useToast();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [deletingSupplierId, setDeletingSupplierId] = useState(null);
  const [supplierToRemove, setSupplierToRemove] = useState(null);

  const loadSuppliers = async () => {
    setLoading(true);
    setError('');
    try {
      setSuppliers(await getSuppliers());
    } catch (loadError) {
      setError(loadError.message || 'Unable to load suppliers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSuppliers();
  }, []);

  const filteredSuppliers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return suppliers;
    return suppliers.filter((supplier) => [
      supplier.supplierId,
      supplier.name,
      supplier.contactName,
      supplier.phone,
      supplier.email,
      supplier.address,
    ].some((field) => String(field || '').toLowerCase().includes(needle)));
  }, [query, suppliers]);

  const openCreate = () => {
    setEditingSupplier(null);
    setForm({ ...emptyForm });
    setIsModalOpen(true);
  };

  const openEdit = (supplier) => {
    setEditingSupplier(supplier);
    setForm({
      supplierId: supplier.supplierId || '',
      name: supplier.name || '',
      contactName: supplier.contactName || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      notes: supplier.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, form);
        success('Supplier updated.');
      } else {
        await createSupplier(form);
        success('Supplier created.');
      }
      setEditingSupplier(null);
      setForm({ ...emptyForm });
      setIsModalOpen(false);
      await loadSuppliers();
    } catch (saveError) {
      showError(saveError.message || 'Unable to save supplier.');
    } finally {
      setSaving(false);
    }
  };

  const closeRemoveDialog = () => {
    if (!deletingSupplierId) {
      setSupplierToRemove(null);
    }
  };

  const handleDelete = async () => {
    if (!supplierToRemove?.id || deletingSupplierId) return;

    const supplier = supplierToRemove;
    setDeletingSupplierId(supplier.id);
    try {
      await deleteSupplier(supplier.id);
      setSuppliers((current) => current.filter((item) => item.id !== supplier.id));
      success('Supplier removed successfully.');
      setSupplierToRemove(null);
    } catch (deleteError) {
      showError(deleteError.message || 'Unable to delete supplier.');
    } finally {
      setDeletingSupplierId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-primary-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent-blue">Supplier Management</p>
          <h2 className="mt-2 text-2xl font-display font-bold text-primary-950">Suppliers</h2>
          <p className="mt-1 max-w-3xl text-sm text-primary-500">Maintain vendor records and link them to inventory receiving and product details.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} isLoading={loading} onClick={loadSuppliers}>Refresh</Button>
          <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>New Supplier</Button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-accent-danger/20 bg-accent-danger/5 px-4 py-3 text-sm text-accent-danger">{error}</div>}

      <div className="rounded-2xl border border-primary-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-accent-blue">
            <Truck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-500">Supplier Records</p>
            <p className="mt-1 text-3xl font-bold text-primary-950">{formatNumber(suppliers.length)}</p>
          </div>
        </div>
      </div>

      <Card
        title="Supplier Directory"
        subtitle="Create, update, and remove supplier records."
        headerAction={(
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" />
            <input className="input py-2.5 pl-10 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search suppliers" />
          </div>
        )}
      >
        <div className="overflow-x-auto rounded-2xl border border-primary-200">
          <table className="min-w-full divide-y divide-primary-100 bg-white text-sm">
            <thead className="bg-primary-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Supplier</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Address</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Updated</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100">
              {filteredSuppliers.map((supplier) => (
                <tr key={supplier.id} className="hover:bg-primary-50/60">
                  <td className="px-4 py-3">
                    <p className="font-bold text-primary-950">{supplier.name}</p>
                    <p className="font-mono text-xs text-primary-500">{supplier.supplierId}</p>
                  </td>
                  <td className="px-4 py-3 text-primary-600">
                    <p>{supplier.contactName || 'No contact person'}</p>
                    <p className="text-xs">{[supplier.phone, supplier.email].filter(Boolean).join(' | ') || 'No contact details'}</p>
                  </td>
                  <td className="px-4 py-3 text-primary-600">{supplier.address || '-'}</td>
                  <td className="px-4 py-3 text-primary-600">{supplier.updatedAt ? formatDateTime(supplier.updatedAt) : '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" leftIcon={<Edit2 className="h-4 w-4" />} onClick={() => openEdit(supplier)}>Edit</Button>
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<Trash2 className="h-4 w-4" />}
                        isLoading={deletingSupplierId === supplier.id}
                        disabled={Boolean(deletingSupplierId)}
                        onClick={() => setSupplierToRemove(supplier)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filteredSuppliers.length === 0 && (
                <tr><td colSpan="5" className="px-4 py-8 text-center text-primary-500">No suppliers found.</td></tr>
              )}
              {loading && (
                <tr><td colSpan="5" className="px-4 py-8 text-center text-primary-500">Loading suppliers...</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal isOpen={isModalOpen} onClose={() => { setForm({ ...emptyForm }); setEditingSupplier(null); setIsModalOpen(false); }} title={editingSupplier ? 'Edit Supplier' : 'New Supplier'} size="xl">
        <form onSubmit={handleSave} className="space-y-5">
          <SupplierForm value={form} onChange={setForm} />
          <div className="flex justify-end gap-3 border-t border-primary-200 pt-4">
            <Button variant="secondary" type="button" onClick={() => { setForm({ ...emptyForm }); setEditingSupplier(null); setIsModalOpen(false); }}>Cancel</Button>
            <Button variant="primary" type="submit" isLoading={saving} leftIcon={<Save className="h-4 w-4" />}>Save Supplier</Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(supplierToRemove)}
        onClose={closeRemoveDialog}
        title="Remove Supplier"
        size="sm"
        closeOnBackdrop={!deletingSupplierId}
        closeOnEscape={!deletingSupplierId}
      >
        <div className="space-y-4">
          <p className="text-sm text-primary-600">
            Confirm removing <span className="font-semibold text-primary-950">{supplierToRemove?.name}</span> from the supplier directory.
          </p>
          <div className="flex justify-end gap-3 border-t border-primary-200 pt-4">
            <Button variant="secondary" type="button" disabled={Boolean(deletingSupplierId)} onClick={closeRemoveDialog}>Cancel</Button>
            <Button
              variant="primary"
              type="button"
              leftIcon={<Trash2 className="h-4 w-4" />}
              isLoading={Boolean(deletingSupplierId)}
              onClick={handleDelete}
            >
              Confirm Remove
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
