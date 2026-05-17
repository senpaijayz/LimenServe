import { useEffect, useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Edit2, FolderTree, Plus, RefreshCw, Save, Search, Trash2 } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card, { KPICard } from '../../../components/ui/Card';
import Modal from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { createManagedCategory, deleteManagedCategory, getManagedCategories, updateManagedCategory } from '../../../services/catalogApi';
import { formatDateTime, formatNumber } from '../../../utils/formatters';

const emptyForm = { name: '', description: '', color: '#1d4ed8' };
const inputClassName = 'w-full rounded-xl border border-primary-200 bg-white px-4 py-3 text-sm text-primary-950 shadow-sm outline-none transition focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/15';

export default function CategoryManagement() {
  const { success, error: showError } = useToast();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [error, setError] = useState('');

  const loadCategories = async () => {
    setLoading(true);
    setError('');
    try {
      setCategories(await getManagedCategories());
    } catch (loadError) {
      setError(loadError.message || 'Unable to load categories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCategories();
  }, []);

  const filteredCategories = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return categories;
    return categories.filter((category) => [
      category.name,
      category.description,
    ].some((field) => String(field || '').toLowerCase().includes(needle)));
  }, [categories, query]);

  const totalProducts = useMemo(() => categories.reduce((sum, category) => sum + Number(category.count ?? 0), 0), [categories]);
  const chartData = useMemo(() => categories.filter((category) => Number(category.count ?? 0) > 0), [categories]);

  const openCreate = () => {
    setEditingCategory(null);
    setForm({ ...emptyForm });
    setIsModalOpen(true);
  };

  const openEdit = (category) => {
    setEditingCategory(category);
    setForm({
      name: category.name || '',
      description: category.description || '',
      color: category.color || '#1d4ed8',
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCategory(null);
    setForm({ ...emptyForm });
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingCategory) {
        await updateManagedCategory(editingCategory.id, form);
        success('Category updated.');
      } else {
        await createManagedCategory(form);
        success('Category created.');
      }
      closeModal();
      await loadCategories();
    } catch (saveError) {
      showError(saveError.message || 'Unable to save category.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (category) => {
    if (!window.confirm(`Delete category "${category.name}"? Existing products keep their current category label.`)) return;
    try {
      await deleteManagedCategory(category.id);
      success('Category deleted.');
      await loadCategories();
    } catch (deleteError) {
      showError(deleteError.message || 'Unable to delete category.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-primary-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent-blue">Category Management</p>
          <h2 className="mt-2 text-2xl font-display font-bold text-primary-950">Inventory Categories</h2>
          <p className="mt-1 max-w-3xl text-sm text-primary-500">Maintain category records used by product filters, inventory breakdowns, and reports charts.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} isLoading={loading} onClick={loadCategories}>Refresh</Button>
          <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>New Category</Button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-accent-danger/20 bg-accent-danger/5 px-4 py-3 text-sm text-accent-danger">{error}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <KPICard title="Categories" value={formatNumber(categories.length)} icon={<FolderTree className="h-6 w-6" />} />
        <KPICard title="Mapped Products" value={formatNumber(totalProducts)} icon={<FolderTree className="h-6 w-6" />} accentColor="border-emerald-500" iconBg="bg-emerald-50 text-emerald-600" />
        <KPICard title="Empty Categories" value={formatNumber(categories.filter((category) => Number(category.count ?? 0) === 0).length)} icon={<FolderTree className="h-6 w-6" />} accentColor="border-amber-500" iconBg="bg-amber-50 text-amber-600" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card
          title="Category Directory"
          subtitle="Create, update, and remove category records."
          headerAction={(
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" />
              <input className="input py-2.5 pl-10 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search categories" />
            </div>
          )}
        >
          <div className="overflow-x-auto rounded-2xl border border-primary-200">
            <table className="min-w-full divide-y divide-primary-100 bg-white text-sm">
              <thead className="bg-primary-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Category</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Products</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Updated</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-100">
                {filteredCategories.map((category) => (
                  <tr key={category.id} className="hover:bg-primary-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span className="mt-1 h-3 w-3 rounded-full" style={{ backgroundColor: category.color || '#1d4ed8' }} />
                        <div>
                          <p className="font-bold text-primary-950">{category.name}</p>
                          <p className="text-xs text-primary-500">{category.description || 'No description'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-primary-950">{formatNumber(category.count ?? 0)}</td>
                    <td className="px-4 py-3 text-primary-600">{category.updatedAt ? formatDateTime(category.updatedAt) : '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" leftIcon={<Edit2 className="h-4 w-4" />} onClick={() => openEdit(category)}>Edit</Button>
                        <Button variant="outline" size="sm" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => handleDelete(category)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && filteredCategories.length === 0 && (
                  <tr><td colSpan="4" className="px-4 py-8 text-center text-primary-500">No categories found.</td></tr>
                )}
                {loading && (
                  <tr><td colSpan="4" className="px-4 py-8 text-center text-primary-500">Loading categories...</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Category Breakdown" subtitle="Inventory products grouped by managed category.">
          <div className="h-80">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} dataKey="count" nameKey="name" innerRadius={70} outerRadius={115} paddingAngle={2}>
                    {chartData.map((category) => <Cell key={category.id} fill={category.color || '#1d4ed8'} />)}
                  </Pie>
                  <Tooltip formatter={(value, name) => [formatNumber(value), name]} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-primary-200 bg-primary-50 text-sm text-primary-500">No category counts yet.</div>
            )}
          </div>
        </Card>
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingCategory ? 'Edit Category' : 'New Category'} size="lg">
        <form onSubmit={handleSave} className="space-y-5">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Category Name</span>
            <input className={`${inputClassName} mt-2`} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Description</span>
            <textarea className={`${inputClassName} mt-2 min-h-28`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Chart Color</span>
            <input className={`${inputClassName} mt-2 h-12`} type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} />
          </label>
          <div className="flex justify-end gap-3 border-t border-primary-200 pt-4">
            <Button variant="secondary" type="button" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" type="submit" isLoading={saving} leftIcon={<Save className="h-4 w-4" />}>Save Category</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
