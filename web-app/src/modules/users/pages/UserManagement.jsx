import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Search, Plus, Edit2, Shield, User, UserCheck, Trash2, LockKeyhole, RotateCcw, Mail } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Modal from '../../../components/ui/Modal';
import Input from '../../../components/ui/Input';
import Dropdown from '../../../components/ui/Dropdown';
import { RoleBadge } from '../../../components/ui/Badge';
import Table from '../../../components/ui/Table';
import { useToast } from '../../../components/ui/Toast';
import { listMechanics } from '../../../services/mechanicsApi';
import MechanicManagementPanel from '../components/MechanicManagementPanel';
import RecoveryEmailModal from '../components/RecoveryEmailModal';
import { removeMechanicRow, upsertMechanicRow } from '../utils/mechanicVisibilityModel';
import { createUser, deactivateUser, listUsers, permanentlyDeleteUser, restoreUser, updateUser } from '../../../services/usersApi';

const roleOptions = [
    { value: 'admin', label: 'Administrator' },
    { value: 'cashier', label: 'Cashier' },
    { value: 'stock_clerk', label: 'Clerk' },
];

const emptyUserForm = {
    firstName: '',
    lastName: '',
    email: '',
    role: 'cashier',
    password: '',
};

function buildUserForm(user) {
    if (!user) {
        return emptyUserForm;
    }

    return {
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        role: roleOptions.some((option) => option.value === user.role) ? user.role : 'stock_clerk',
        password: '',
    };
}

function UserFormModal({ isOpen, editingUser, isSaving, submitError, onClose, onSubmit }) {
    const [formData, setFormData] = useState(() => buildUserForm(editingUser));

    const guardedClose = () => {
        if (!isSaving) {
            onClose();
        }
    };

    const updateField = (field, value) => {
        setFormData((current) => ({
            ...current,
            [field]: value,
        }));
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        const payload = {
            firstName: formData.firstName,
            lastName: formData.lastName,
            fullName: `${formData.firstName} ${formData.lastName}`.trim(),
            email: formData.email,
            role: formData.role,
            password: formData.password,
        };
        onSubmit(payload);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={guardedClose}
            title={editingUser ? 'Edit User' : 'Add New User'}
            size="md"
            closeOnBackdrop={!isSaving}
            closeOnEscape={!isSaving}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-600">
                    <p className="font-semibold text-primary-950">Admin panel roles</p>
                    <p>Only Administrator, Cashier, and Clerk accounts can be created from this workspace.</p>
                </div>

                {submitError && (
                    <div className="rounded-xl border border-accent-danger/20 bg-accent-danger/5 px-4 py-3 text-sm font-medium text-accent-danger">
                        {submitError}
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input label="First Name" value={formData.firstName} onChange={(e) => updateField('firstName', e.target.value)} required />
                    <Input label="Last Name" value={formData.lastName} onChange={(e) => updateField('lastName', e.target.value)} required />
                </div>

                <Input label="Email Address" type="email" value={formData.email} onChange={(e) => updateField('email', e.target.value)} required />

                <Dropdown label="Role" options={roleOptions} value={formData.role} onChange={(value) => updateField('role', value)} />

                <Input
                    label={editingUser ? 'New Password (leave blank to keep current)' : 'Password'}
                    type="password"
                    value={formData.password}
                    onChange={(e) => updateField('password', e.target.value)}
                    required={!editingUser}
                    helperText={editingUser ? 'Leave this blank unless you want to reset the password.' : 'Use a secure temporary password for the staff account.'}
                />

                <div className="flex flex-col gap-3 pt-4 sm:flex-row">
                    <Button variant="secondary" fullWidth isDisabled={isSaving} onClick={guardedClose}>
                        Cancel
                    </Button>
                    <Button variant="primary" fullWidth type="submit" isLoading={isSaving} isDisabled={isSaving}>
                        {editingUser ? 'Update User' : 'Create User'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

const UserManagement = () => {
    const { success, error: showError } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [users, setUsers] = useState([]);
    const [usersLoading, setUsersLoading] = useState(true);
    const [usersError, setUsersError] = useState('');
    const [isSavingUser, setIsSavingUser] = useState(false);
    const [userFormError, setUserFormError] = useState('');
    const [mechanics, setMechanics] = useState([]);
    const [showInactiveUsers, setShowInactiveUsers] = useState(false);
    const [deactivationTarget, setDeactivationTarget] = useState(null);
    const [restoreTarget, setRestoreTarget] = useState(null);
    const [isChangingAccountStatus, setIsChangingAccountStatus] = useState(false);
    const [recoveryTarget, setRecoveryTarget] = useState(null);
    const [permanentDeleteTarget, setPermanentDeleteTarget] = useState(null);
    const [permanentDeleteConfirmation, setPermanentDeleteConfirmation] = useState('');
    const [permanentDeleteError, setPermanentDeleteError] = useState('');
    const [isPermanentlyDeleting, setIsPermanentlyDeleting] = useState(false);

    const loadMechanics = async () => {
        try {
            const rows = await listMechanics();
            setMechanics(rows);
        } catch {
            setMechanics([]);
        }
    };

    const loadUsers = async () => {
        setUsersLoading(true);
        setUsersError('');
        try {
            const rows = await listUsers();
            setUsers(rows);
        } catch (error) {
            setUsers([]);
            setUsersError(error.message || 'Unable to load users.');
        } finally {
            setUsersLoading(false);
        }
    };

    useEffect(() => {
        void loadUsers();
        void loadMechanics();
    }, []);

    const activeUsers = useMemo(() => users.filter((user) => user.status === 'active'), [users]);
    const inactiveUsers = useMemo(() => users.filter((user) => user.status !== 'active'), [users]);
    const filteredUsers = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const visibleUsers = showInactiveUsers ? inactiveUsers : activeUsers;
        if (!query) return visibleUsers;

        return visibleUsers.filter((user) =>
            String(user.firstName || '').toLowerCase().includes(query)
            || String(user.lastName || '').toLowerCase().includes(query)
            || String(user.email || '').toLowerCase().includes(query)
        );
    }, [activeUsers, inactiveUsers, searchQuery, showInactiveUsers]);

    const closeUserModal = () => {
        if (isSavingUser) {
            return;
        }

        setShowAddModal(false);
        setEditingUser(null);
        setUserFormError('');
    };

    const upsertUserInList = (savedUser) => {
        if (!savedUser?.id) {
            return;
        }

        setUsers((current) => {
            const withoutSaved = current.filter((user) => user.id !== savedUser.id);
            return [...withoutSaved, savedUser].sort((left, right) => String(left.email).localeCompare(String(right.email)));
        });
    };

    const formatUserError = (error, isEditing) => {
        const fallback = isEditing
            ? 'Unable to update user. Please check the details and try again.'
            : 'Unable to add user. Please check the details and try again.';
        return error?.message || fallback;
    };

    const handleSubmit = async (payload) => {
        if (isSavingUser) {
            return;
        }

        setIsSavingUser(true);
        setUserFormError('');
        const isEditing = Boolean(editingUser);
        try {
            const saveResult = editingUser
                ? await updateUser(editingUser.id, payload)
                : await createUser(payload);

            upsertUserInList(saveResult?.user);
            await loadUsers();
            setShowAddModal(false);
            setEditingUser(null);
            setUserFormError('');
            success(isEditing ? 'User updated successfully' : 'User added successfully');
        } catch (error) {
            const message = formatUserError(error, isEditing);
            setUserFormError(message);
            showError(message);
        } finally {
            setIsSavingUser(false);
        }
    };

    const handleMechanicSaved = (mechanic) => {
        setMechanics((current) => upsertMechanicRow(current, mechanic));
    };

    const handleMechanicRemoved = (mechanicId) => {
        setMechanics((current) => removeMechanicRow(current, mechanicId));
    };

    const handleEdit = (user) => {
        setUserFormError('');
        setEditingUser(user);
        setShowAddModal(true);
    };

    const handleAddUser = () => {
        setUserFormError('');
        setEditingUser(null);
        setShowAddModal(true);
    };

    const handleDeactivate = async () => {
        if (!deactivationTarget || isChangingAccountStatus) return;

        setIsChangingAccountStatus(true);
        try {
            const result = await deactivateUser(deactivationTarget.id);
            if (!result?.user) throw new Error('The server did not confirm that staff access was removed.');
            setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
            setDeactivationTarget(null);
            success('Staff access removed. Business history is preserved.');
            void loadUsers();
        } catch (error) {
            showError(error.message || 'Unable to remove this staff account.');
        } finally {
            setIsChangingAccountStatus(false);
        }
    };

    const handleRestore = async () => {
        if (!restoreTarget || isChangingAccountStatus) return;

        setIsChangingAccountStatus(true);
        try {
            const result = await restoreUser(restoreTarget.id);
            if (!result?.user) throw new Error('The server did not confirm account access was restored.');
            setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
            setRestoreTarget(null);
            setShowInactiveUsers(false);
            success('Staff access restored.');
            void loadUsers();
        } catch (error) {
            showError(error.message || 'Unable to restore this staff account.');
        } finally {
            setIsChangingAccountStatus(false);
        }
    };

    const openPermanentDelete = (user) => {
        setPermanentDeleteConfirmation('');
        setPermanentDeleteError('');
        setPermanentDeleteTarget(user);
    };

    const handlePermanentDelete = async () => {
        if (!permanentDeleteTarget || isPermanentlyDeleting || permanentDeleteConfirmation !== 'DELETE') return;
        setIsPermanentlyDeleting(true);
        setPermanentDeleteError('');
        try {
            const result = await permanentlyDeleteUser(permanentDeleteTarget.id);
            if (!result?.deleted || result.userId !== permanentDeleteTarget.id) {
                throw new Error('The server did not confirm this account was deleted.');
            }
            setUsers((current) => current.filter((user) => user.id !== permanentDeleteTarget.id));
            setPermanentDeleteTarget(null);
            setPermanentDeleteConfirmation('');
            success('Inactive user permanently deleted. Business records were kept.');
            void loadUsers();
        } catch (deleteError) {
            setPermanentDeleteError(deleteError.message || 'Unable to permanently delete this account.');
        } finally {
            setIsPermanentlyDeleting(false);
        }
    };

    const renderUserActions = (user) => {
        if (user.status !== 'active') {
            if (user.accountStatus === 'deactivated') {
                return (
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setRestoreTarget(user)}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-primary-200 px-3 text-sm font-semibold text-primary-700 transition hover:border-primary-300 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
                            aria-label={`Restore access for ${user.fullName || user.email}`}
                        >
                            <RotateCcw className="h-4 w-4" aria-hidden="true" />
                            <span>Restore access</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => openPermanentDelete(user)}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                            aria-label={`Permanently delete ${user.fullName || user.email}`}
                        >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            <span>Delete permanently</span>
                        </button>
                    </div>
                );
            }

            return <span className="text-sm text-primary-400">Inactive</span>;
        }

        return (
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => handleEdit(user)}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-primary-200 px-3 text-sm font-semibold text-primary-700 transition hover:border-primary-300 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
                    aria-label={`Edit ${user.fullName || user.email}`}
                >
                    <Edit2 className="h-4 w-4" aria-hidden="true" />
                    <span>Edit</span>
                </button>
                <button
                    type="button"
                    onClick={() => setRecoveryTarget(user)}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-primary-200 px-3 text-sm font-semibold text-primary-700 transition hover:border-primary-300 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
                    aria-label={`Manage recovery email for ${user.fullName || user.email}`}
                >
                    <Mail className="h-4 w-4" aria-hidden="true" />
                    <span>Recovery email</span>
                </button>
                {user.role === 'admin' ? (
                    <span className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary-50 px-3 text-sm font-medium text-primary-500" title="Administrator accounts cannot be deactivated">
                        <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                        <span>Protected account</span>
                    </span>
                ) : (
                    <button
                        type="button"
                        onClick={() => setDeactivationTarget(user)}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                        aria-label={`Deactivate ${user.fullName || user.email}`}
                    >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        <span>Deactivate</span>
                    </button>
                )}
            </div>
        );
    };

    const columns = [
        {
            key: 'name',
            label: 'User',
            render: (_, row) => (
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center border border-primary-200">
                        <span className="text-sm font-bold text-primary-500">{row.firstName?.[0] || row.email?.[0] || 'U'}{row.lastName?.[0] || ''}</span>
                    </div>
                    <div>
                        <p className="font-bold text-primary-950">{row.firstName} {row.lastName}</p>
                        <p className="text-sm font-medium text-primary-500">{row.email}</p>
                    </div>
                </div>
            ),
        },
        {
            key: 'role',
            label: 'Role',
            render: (role) => <RoleBadge role={role} />,
        },
        {
            key: 'status',
            label: 'Status',
            render: (status) => (
                <span className={`inline-flex items-center gap-1 text-sm ${status === 'active' ? 'text-accent-success' : 'text-primary-500'}`}>
                    <span className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-accent-success' : 'bg-primary-500'}`} />
                    {status === 'active' ? 'Active' : 'Inactive'}
                </span>
            ),
        },
        {
            key: 'lastLogin',
            label: 'Last Login',
            render: (date) => date ? new Date(date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never',
        },
        {
            key: 'actions',
            label: 'Actions',
            sortable: false,
            render: (_, row) => renderUserActions(row),
        },
    ];

    const adminCount = activeUsers.filter((user) => user.role === 'admin').length;
    const cashierCount = activeUsers.filter((user) => user.role === 'cashier').length;
    const clerkCount = activeUsers.filter((user) => user.role === 'stock_clerk').length;

    return (
        <div className="space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-xl font-display font-bold text-primary-950 sm:text-2xl">User Management</h1>
                    <p className="mt-0.5 text-sm font-medium text-primary-500 sm:mt-1">Manage staff accounts and mechanic profiles.</p>
                </div>
                <Button variant="primary" className="shrink-0 !min-h-10 !px-3 sm:!px-4" leftIcon={<Plus className="w-4 h-4" />} onClick={handleAddUser}>
                    Add User
                </Button>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-4">
                <Card padding="sm" className="flex min-w-0 items-center gap-2 border-l-2 border-l-accent-danger sm:gap-3 sm:p-5">
                    <div className="shrink-0 rounded-lg bg-accent-danger/10 p-2"><Shield className="h-4 w-4 text-accent-danger sm:h-5 sm:w-5" /></div>
                    <div className="min-w-0">
                        <p className="text-xl font-bold font-display leading-none text-primary-950 sm:text-2xl">{adminCount}</p>
                        <p className="mt-1 text-xs leading-tight text-primary-600 sm:text-sm">Administrators</p>
                    </div>
                </Card>
                <Card padding="sm" className="flex min-w-0 items-center gap-2 border-l-2 border-l-accent-info sm:gap-3 sm:p-5">
                    <div className="shrink-0 rounded-lg bg-accent-info/10 p-2"><UserCheck className="h-4 w-4 text-accent-info sm:h-5 sm:w-5" /></div>
                    <div className="min-w-0">
                        <p className="text-xl font-bold font-display leading-none text-primary-950 sm:text-2xl">{cashierCount}</p>
                        <p className="mt-1 text-xs leading-tight text-primary-600 sm:text-sm">Cashiers</p>
                    </div>
                </Card>
                <Card padding="sm" className="flex min-w-0 items-center gap-2 border-l-2 border-l-accent-success sm:gap-3 sm:p-5">
                    <div className="shrink-0 rounded-lg bg-accent-success/10 p-2"><User className="h-4 w-4 text-accent-success sm:h-5 sm:w-5" /></div>
                    <div className="min-w-0">
                        <p className="text-xl font-bold font-display leading-none text-primary-950 sm:text-2xl">{clerkCount}</p>
                        <p className="mt-1 text-xs leading-tight text-primary-600 sm:text-sm">Clerks</p>
                    </div>
                </Card>
            </div>

            <div className="grid gap-2 min-[500px]:grid-cols-[minmax(0,1fr)_auto] min-[500px]:items-center sm:gap-3">
                <div className="relative min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                    <input
                        type="text"
                        placeholder="Search users..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full rounded-lg border border-primary-200 bg-white py-2.5 pl-10 pr-4 text-primary-950 shadow-sm placeholder:text-primary-400 focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue"
                    />
                </div>
                <div role="tablist" aria-label="Staff account status" className="inline-flex w-full rounded-xl border border-primary-200 bg-primary-50/70 p-1 min-[500px]:w-auto">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={!showInactiveUsers}
                        onClick={() => setShowInactiveUsers(false)}
                        className={`min-h-10 flex-1 rounded-lg px-3 text-sm font-semibold transition sm:flex-none ${!showInactiveUsers ? 'bg-primary-100 text-primary-950' : 'text-primary-600 hover:bg-primary-50'}`}
                    >
                        Active <span className="ml-1 text-xs">{activeUsers.length}</span>
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={showInactiveUsers}
                        onClick={() => setShowInactiveUsers(true)}
                        className={`min-h-10 flex-1 rounded-lg px-3 text-sm font-semibold transition sm:flex-none ${showInactiveUsers ? 'bg-primary-100 text-primary-950' : 'text-primary-600 hover:bg-primary-50'}`}
                    >
                        Inactive <span className="ml-1 text-xs">{inactiveUsers.length}</span>
                    </button>
                </div>
            </div>

            {usersError && (
                <Card className="border border-accent-danger/20 bg-accent-danger/5" padding="sm">
                    <div className="flex items-start gap-3 text-sm text-accent-danger">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                            <p className="font-semibold">Users unavailable</p>
                            <p>{usersError}</p>
                        </div>
                    </div>
                </Card>
            )}

            <div className="grid gap-3 md:hidden">
                {usersLoading ? (
                    <Card padding="sm" className="text-center text-primary-500">Loading users...</Card>
                ) : filteredUsers.length === 0 ? (
                    <Card padding="sm" className="text-center text-primary-500">No users found.</Card>
                ) : filteredUsers.map((user) => (
                    <Card key={user.id} padding="sm">
                        <div className="space-y-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold text-primary-950">{user.firstName} {user.lastName}</p>
                                <p className="text-sm text-primary-500">{user.email}</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <RoleBadge role={user.role} />
                                    <span className="rounded-full border border-primary-200 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-primary-500">
                                        {user.accountStatus === 'deactivated' ? 'Deactivated' : user.status === 'active' ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2 border-t border-primary-100 pt-3">
                                {renderUserActions(user)}
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            <div className="hidden md:block">
                <Table columns={columns} data={filteredUsers} loading={usersLoading} emptyMessage="No users found" />
            </div>

            <MechanicManagementPanel
                mechanics={mechanics}
                onReload={loadMechanics}
                onNotify={success}
                onSaved={handleMechanicSaved}
                onRemoved={handleMechanicRemoved}
            />

            {showAddModal && (
            <UserFormModal
                isOpen={showAddModal}
                editingUser={editingUser}
                isSaving={isSavingUser}
                submitError={userFormError}
                onClose={closeUserModal}
                onSubmit={handleSubmit}
            />
            )}

            {recoveryTarget && (
                <RecoveryEmailModal user={recoveryTarget} onClose={() => setRecoveryTarget(null)} />
            )}

            <Modal
                isOpen={Boolean(deactivationTarget)}
                onClose={() => !isChangingAccountStatus && setDeactivationTarget(null)}
                title="Remove staff access?"
                size="md"
                closeOnBackdrop={!isChangingAccountStatus}
                closeOnEscape={!isChangingAccountStatus}
            >
                {deactivationTarget && (
                    <div className="space-y-5">
                        <p className="text-sm leading-6 text-primary-600">
                            This will disable sign-in and move the account to Inactive Users. Sales, stock movements, service records, and audit history will remain linked to this staff profile. An administrator can restore access later.
                        </p>
                        <dl className="rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm">
                            <div className="grid grid-cols-[5rem_1fr] gap-3 py-1">
                                <dt className="font-semibold text-primary-600">Name</dt>
                                <dd className="break-words font-medium text-primary-950">{deactivationTarget.fullName || `${deactivationTarget.firstName} ${deactivationTarget.lastName}`.trim() || '—'}</dd>
                            </div>
                            <div className="grid grid-cols-[5rem_1fr] gap-3 py-1">
                                <dt className="font-semibold text-primary-600">Email</dt>
                                <dd className="break-all text-primary-800">{deactivationTarget.email}</dd>
                            </div>
                            <div className="grid grid-cols-[5rem_1fr] gap-3 py-1">
                                <dt className="font-semibold text-primary-600">Role</dt>
                                <dd className="text-primary-800">{deactivationTarget.role === 'cashier' ? 'Cashier' : 'Clerk'}</dd>
                            </div>
                        </dl>
                        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setDeactivationTarget(null)}
                                disabled={isChangingAccountStatus}
                                className="min-h-11 rounded-xl border border-red-300 px-5 font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-60"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDeactivate}
                                disabled={isChangingAccountStatus}
                                className="min-h-11 rounded-xl bg-red-600 px-5 font-semibold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
                            >
                                {isChangingAccountStatus ? 'Removing access…' : 'Deactivate account'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal
                isOpen={Boolean(restoreTarget)}
                onClose={() => !isChangingAccountStatus && setRestoreTarget(null)}
                title="Restore staff access?"
                size="sm"
                closeOnBackdrop={!isChangingAccountStatus}
                closeOnEscape={!isChangingAccountStatus}
            >
                {restoreTarget && (
                    <div className="space-y-5">
                        <p className="text-sm leading-6 text-primary-600">
                            {restoreTarget.fullName || restoreTarget.email} will be able to sign in again with the {restoreTarget.role === 'cashier' ? 'Cashier' : 'Clerk'} role.
                        </p>
                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setRestoreTarget(null)}
                                disabled={isChangingAccountStatus}
                                className="min-h-11 rounded-xl border border-primary-200 px-5 font-semibold text-primary-700 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue disabled:opacity-60"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleRestore}
                                disabled={isChangingAccountStatus}
                                className="min-h-11 rounded-xl bg-primary-800 px-5 font-semibold text-white hover:bg-primary-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
                            >
                                {isChangingAccountStatus ? 'Restoring access…' : 'Restore access'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal
                isOpen={Boolean(permanentDeleteTarget)}
                onClose={() => !isPermanentlyDeleting && setPermanentDeleteTarget(null)}
                title="Permanently delete user?"
                size="md"
                closeOnBackdrop={!isPermanentlyDeleting}
                closeOnEscape={!isPermanentlyDeleting}
            >
                {permanentDeleteTarget && (
                    <div className="space-y-5">
                        <p className="text-sm leading-6 text-primary-600">
                            This removes the sign-in account, staff profile, and recovery email for <span className="font-semibold text-primary-950">{permanentDeleteTarget.fullName || permanentDeleteTarget.email}</span>. It cannot be restored. Sales, stock, service, and content records stay in the system, but may no longer show this staff member as the actor.
                        </p>
                        <p className="break-all rounded-xl border border-primary-200 bg-primary-50 p-3 text-sm font-medium text-primary-800">{permanentDeleteTarget.email}</p>
                        <div>
                            <label htmlFor="confirm-permanent-delete" className="mb-2 block text-sm font-semibold text-primary-800">Type DELETE to confirm</label>
                            <input
                                id="confirm-permanent-delete"
                                type="text"
                                autoComplete="off"
                                value={permanentDeleteConfirmation}
                                onChange={(event) => setPermanentDeleteConfirmation(event.target.value)}
                                className="min-h-11 w-full rounded-xl border border-primary-200 bg-white px-3 py-3 text-primary-950 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                            />
                        </div>
                        {permanentDeleteError && (
                            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{permanentDeleteError}</p>
                        )}
                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button type="button" onClick={() => setPermanentDeleteTarget(null)} disabled={isPermanentlyDeleting} className="min-h-11 rounded-xl border border-primary-200 px-5 font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-60">
                                Cancel
                            </button>
                            <button type="button" onClick={handlePermanentDelete} disabled={isPermanentlyDeleting || permanentDeleteConfirmation !== 'DELETE'} className="min-h-11 rounded-xl bg-red-600 px-5 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
                                {isPermanentlyDeleting ? 'Deleting…' : 'Delete permanently'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default UserManagement;
