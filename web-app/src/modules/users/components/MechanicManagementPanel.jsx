import { useState } from 'react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Modal from '../../../components/ui/Modal';
import Input from '../../../components/ui/Input';
import { deleteMechanic, upsertMechanic } from '../../../services/mechanicsApi';

const availabilityOptions = [
    { value: 'available', label: 'Available' },
    { value: 'booked', label: 'Booked' },
    { value: 'off_duty', label: 'Off Duty' },
];

const initialForm = {
    full_name: '',
    specialization: '',
    availability_status: 'available',
    shift_label: '',
    location_name: 'Main Shop',
    bio: '',
    is_public: true,
};

const MechanicManagementPanel = ({ mechanics = [], onReload, onNotify }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [editingMechanic, setEditingMechanic] = useState(null);
    const [form, setForm] = useState(initialForm);

    const openCreate = () => {
        setEditingMechanic(null);
        setForm(initialForm);
        setIsOpen(true);
    };

    const openEdit = (mechanic) => {
        setEditingMechanic(mechanic);
        setForm({
            full_name: mechanic.full_name || '',
            specialization: mechanic.specialization || '',
            availability_status: mechanic.availability_status || 'available',
            shift_label: mechanic.shift_label || '',
            location_name: mechanic.location_name || 'Main Shop',
            bio: mechanic.bio || '',
            is_public: Boolean(mechanic.is_public),
        });
        setIsOpen(true);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        await upsertMechanic({
            ...form,
            id: editingMechanic?.id,
        });
        await onReload();
        onNotify(editingMechanic ? 'Mechanic updated successfully!' : 'Mechanic created successfully!');
        setIsOpen(false);
    };

    const handleDelete = async (mechanicId) => {
        await deleteMechanic(mechanicId);
        await onReload();
        onNotify('Mechanic removed successfully!');
    };

    return (
        <>
            <Card title="Mechanic Visibility" subtitle="Profiles shown on the public About page.">
                <div className="flex items-center justify-between gap-4 mb-4">
                    <p className="text-sm text-primary-500">Manage mechanic availability, specialization, and public visibility.</p>
                    <Button variant="primary" onClick={openCreate}>Add Mechanic</Button>
                </div>
                <div className="space-y-3">
                    {mechanics.length === 0 ? (
                        <div className="rounded-xl border border-primary-200 bg-white p-4 text-sm text-primary-500">No mechanics have been configured yet.</div>
                    ) : mechanics.map((mechanic) => (
                        <div key={mechanic.id} className="rounded-xl border border-primary-200 bg-white p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div>
                                <p className="text-lg font-display font-semibold text-primary-950">{mechanic.full_name}</p>
                                <p className="text-sm font-medium text-accent-blue">{mechanic.specialization}</p>
                                <p className="text-sm text-primary-500 mt-1">{mechanic.location_name} · {mechanic.shift_label || 'No shift set'} · {mechanic.availability_status}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" onClick={() => openEdit(mechanic)}>Edit</Button>
                                <Button variant="secondary" onClick={() => handleDelete(mechanic.id)}>Remove</Button>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={editingMechanic ? 'Edit Mechanic' : 'Add Mechanic'} size="md">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input label="Full Name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
                    <Input label="Specialization" value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} required />
                    <Input label="Shift / Schedule" value={form.shift_label} onChange={(e) => setForm({ ...form, shift_label: e.target.value })} />
                    <Input label="Location" value={form.location_name} onChange={(e) => setForm({ ...form, location_name: e.target.value })} />
                    <label className="block text-sm font-medium text-primary-700">
                        Availability
                        <select value={form.availability_status} onChange={(e) => setForm({ ...form, availability_status: e.target.value })} className="input mt-2 py-2.5 text-sm">
                            {availabilityOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-primary-600">
                        <input type="checkbox" checked={form.is_public} onChange={(e) => setForm({ ...form, is_public: e.target.checked })} />
                        Show on public website
                    </label>
                    <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Mechanic bio" rows={3} className="w-full px-4 py-3 bg-white border border-primary-200 rounded-lg text-primary-950 placeholder-primary-400 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue shadow-sm resize-none" />
                    <div className="flex gap-3 pt-2">
                        <Button variant="secondary" fullWidth onClick={() => setIsOpen(false)}>Cancel</Button>
                        <Button variant="primary" fullWidth type="submit">{editingMechanic ? 'Update Mechanic' : 'Create Mechanic'}</Button>
                    </div>
                </form>
            </Modal>
        </>
    );
};

export default MechanicManagementPanel;
