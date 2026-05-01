import { useState } from 'react';
import { CalendarDays, Camera, Phone, UserRound } from 'lucide-react';
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

const shiftOptions = [
    { value: 'full_day', label: 'Full Day (8:00 AM - 5:00 PM)' },
    { value: 'morning', label: 'Morning (8:00 AM - 12:00 PM)' },
    { value: 'afternoon', label: 'Afternoon (1:00 PM - 5:00 PM)' },
    { value: 'on_call', label: 'On Call / By Appointment' },
];

const initialForm = {
    full_name: '',
    specialization: '',
    availability_status: 'available',
    shift_type: 'full_day',
    available_date: '',
    contact_number: '',
    photo_url: '',
    photoDataUrl: '',
    bio: '',
    is_public: true,
};

function getShiftLabel(value) {
    return shiftOptions.find((option) => option.value === value)?.label || 'Schedule to be assigned';
}

function formatStatus(value) {
    return String(value || 'available').replace('_', ' ');
}

function isValidContactNumber(value) {
    return !value || /^(?:\+?63|0)?[0-9\s().-]{7,18}$/.test(value.trim());
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Unable to read the selected image.'));
        reader.readAsDataURL(file);
    });
}

function MechanicAvatar({ mechanic, size = 'md' }) {
    const sizeClass = size === 'lg' ? 'h-20 w-20' : 'h-14 w-14';
    const imageUrl = mechanic?.photo_url || mechanic?.photoUrl;

    if (imageUrl) {
        return (
            <img
                src={imageUrl}
                alt={mechanic?.full_name || 'Mechanic profile'}
                className={`${sizeClass} shrink-0 rounded-2xl border border-primary-200 object-cover shadow-sm`}
                loading="lazy"
            />
        );
    }

    return (
        <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-2xl border border-primary-200 bg-primary-50 text-primary-400 shadow-sm`}>
            <UserRound className={size === 'lg' ? 'h-9 w-9' : 'h-6 w-6'} />
        </div>
    );
}

const MechanicManagementPanel = ({ mechanics = [], onReload, onNotify }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [editingMechanic, setEditingMechanic] = useState(null);
    const [form, setForm] = useState(initialForm);
    const [formError, setFormError] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const openCreate = () => {
        setEditingMechanic(null);
        setForm(initialForm);
        setFormError('');
        setIsOpen(true);
    };

    const openEdit = (mechanic) => {
        setEditingMechanic(mechanic);
        setForm({
            full_name: mechanic.full_name || '',
            specialization: mechanic.specialization || '',
            availability_status: mechanic.availability_status || 'available',
            shift_type: mechanic.shift_type || mechanic.schedule_type || 'full_day',
            available_date: mechanic.available_date || '',
            contact_number: mechanic.contact_number || mechanic.contactNumber || '',
            photo_url: mechanic.photo_url || mechanic.photoUrl || '',
            photoDataUrl: '',
            bio: mechanic.bio || '',
            is_public: Boolean(mechanic.is_public),
        });
        setFormError('');
        setIsOpen(true);
    };

    const handlePhotoChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            setFormError('Use a JPG, PNG, or WebP mechanic photo.');
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            setFormError('Mechanic photo must be 2MB or smaller.');
            return;
        }

        try {
            const dataUrl = await readFileAsDataUrl(file);
            setForm((current) => ({
                ...current,
                photoDataUrl: dataUrl,
                photo_url: dataUrl,
            }));
            setFormError('');
        } catch (error) {
            setFormError(error.message || 'Unable to use the selected photo.');
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setFormError('');

        if (!isValidContactNumber(form.contact_number)) {
            setFormError('Enter a valid contact number, for example 0917 123 4567.');
            return;
        }

        setIsSaving(true);
        try {
            await upsertMechanic({
                ...form,
                shift_label: getShiftLabel(form.shift_type),
                location_name: 'Limen',
                id: editingMechanic?.id,
            });
            await onReload();
            onNotify(editingMechanic ? 'Mechanic updated successfully!' : 'Mechanic created successfully!');
            setIsOpen(false);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (mechanicId) => {
        await deleteMechanic(mechanicId);
        await onReload();
        onNotify('Mechanic removed successfully!');
    };

    return (
        <>
            <Card title="Mechanic Visibility" subtitle="Profiles shown on the public About page.">
                <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-primary-500">Manage mechanic availability, contact details, profile photos, and public visibility.</p>
                    <Button variant="primary" onClick={openCreate}>Add Mechanic</Button>
                </div>
                <div className="space-y-3">
                    {mechanics.length === 0 ? (
                        <div className="rounded-xl border border-primary-200 bg-white p-4 text-sm text-primary-500">No mechanics have been configured yet.</div>
                    ) : mechanics.map((mechanic) => (
                        <div key={mechanic.id} className="flex flex-col gap-4 rounded-xl border border-primary-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
                            <div className="flex min-w-0 gap-4">
                                <MechanicAvatar mechanic={mechanic} />
                                <div className="min-w-0">
                                    <p className="text-lg font-display font-semibold text-primary-950">{mechanic.full_name}</p>
                                    <p className="text-sm font-medium text-accent-blue">{mechanic.specialization}</p>
                                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-primary-500">
                                        <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1">{getShiftLabel(mechanic.shift_type || mechanic.schedule_type || 'full_day')}</span>
                                        <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1">{mechanic.available_date || 'Date open'}</span>
                                        <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1">{mechanic.contact_number || 'No contact set'}</span>
                                        <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 capitalize">{formatStatus(mechanic.availability_status)}</span>
                                    </div>
                                </div>
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
                    <div className="flex items-center gap-4 rounded-xl border border-primary-200 bg-primary-50 p-4">
                        <MechanicAvatar mechanic={{ full_name: form.full_name, photo_url: form.photo_url }} size="lg" />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-primary-950">Profile photo</p>
                            <p className="text-xs text-primary-500">JPG, PNG, or WebP up to 2MB. This appears on the public About page.</p>
                            <label className="mt-3 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-primary-200 bg-white px-3 text-xs font-semibold uppercase tracking-wide text-primary-600">
                                <Camera className="h-4 w-4" />
                                Select photo
                                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handlePhotoChange} />
                            </label>
                        </div>
                    </div>

                    {formError && (
                        <div className="rounded-xl border border-accent-danger/20 bg-accent-danger/5 px-4 py-3 text-sm text-accent-danger">
                            {formError}
                        </div>
                    )}

                    <Input label="Full Name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
                    <Input label="Specialization" value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} required />
                    <Input
                        label="Contact Number"
                        value={form.contact_number}
                        onChange={(e) => setForm({ ...form, contact_number: e.target.value })}
                        leftIcon={<Phone className="h-4 w-4" />}
                        placeholder="0917 123 4567"
                        helperText="Shown publicly so customers can contact the mechanic/shop."
                    />
                    <label className="block text-sm font-medium text-primary-700">
                        Shift / Schedule
                        <select value={form.shift_type} onChange={(e) => setForm({ ...form, shift_type: e.target.value })} className="input mt-2 py-2.5 text-sm">
                            {shiftOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                    <Input
                        label="Available Date"
                        type="date"
                        value={form.available_date}
                        onChange={(e) => setForm({ ...form, available_date: e.target.value })}
                        leftIcon={<CalendarDays className="h-4 w-4" />}
                        helperText="Leave blank if the mechanic is generally available on this schedule."
                    />
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
                    <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Mechanic bio" rows={3} className="w-full resize-none rounded-lg border border-primary-200 bg-white px-4 py-3 text-primary-950 shadow-sm placeholder-primary-400 focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue" />
                    <div className="flex gap-3 pt-2">
                        <Button variant="secondary" fullWidth isDisabled={isSaving} onClick={() => setIsOpen(false)}>Cancel</Button>
                        <Button variant="primary" fullWidth type="submit" isLoading={isSaving}>{editingMechanic ? 'Update Mechanic' : 'Create Mechanic'}</Button>
                    </div>
                </form>
            </Modal>
        </>
    );
};

export default MechanicManagementPanel;
