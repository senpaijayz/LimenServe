import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Search, Plus, Edit2, Shield, User, UserCheck } from 'lucide-react';
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
import { createUser, listUsers, updateUser } from '../../../services/usersApi';

const roleOptions = [
    { value: 'admin', label: 'Administrator' },
    { value: 'cashier', label: 'Cashier' },
    { value: 'stock_clerk', label: 'Stock Clerk' },
];

const UserManagement = () => {
    const { success, error: showError } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [users, setUsers] = useState([]);
    const [usersLoading, setUsersLoading] = useState(true);
    const [usersError, setUsersError] = useState('');
    const [mechanics, setMechanics] = useState([]);
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        role: 'cashier',
        password: '',
    });

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

    const filteredUsers = useMemo(() => users.filter((user) =>
        String(user.firstName || '').toLowerCase().includes(searchQuery.toLowerCase())
        || String(user.lastName || '').toLowerCase().includes(searchQuery.toLowerCase())
        || String(user.email || '').toLowerCase().includes(searchQuery.toLowerCase())
    ), [searchQuery, users]);

    const resetForm = () => {
        setFormData({
            firstName: '',
            lastName: '',
            email: '',
            role: 'cashier',
            password: '',
        });
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        try {
            const payload = {
                firstName: formData.firstName,
                lastName: formData.lastName,
                fullName: `${formData.firstName} ${formData.lastName}`.trim(),
                email: formData.email,
                role: formData.role,
                password: formData.password,
            };
            const savedUser = editingUser
                ? await updateUser(editingUser.id, payload)
                : await createUser(payload);

            setUsers((current) => {
                if (editingUser) {
                    return current.map((user) => (user.id === savedUser.id ? savedUser : user));
                }
                return [savedUser, ...current];
            });
            success(editingUser ? 'User updated successfully!' : 'User created successfully!');
            setShowAddModal(false);
            setEditingUser(null);
            resetForm();
        } catch (error) {
            showError(error.message || 'Unable to save user.');
        }
    };

    const handleEdit = (user) => {
        setEditingUser(user);
        setFormData({
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            password: '',
        });
        setShowAddModal(true);
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
            render: (_, row) => (
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => handleEdit(row)}
                        className="p-1.5 rounded-lg hover:bg-primary-50 text-primary-400 hover:text-accent-blue transition-colors border border-transparent hover:border-primary-200"
                    >
                        <Edit2 className="w-4 h-4" />
                    </button>
                </div>
            ),
        },
    ];

    const adminCount = users.filter((user) => user.role === 'admin').length;
    const cashierCount = users.filter((user) => user.role === 'cashier').length;
    const clerkCount = users.filter((user) => user.role === 'stock_clerk').length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div>
                    <h1 className="text-2xl font-display font-bold text-primary-950">User Management</h1>
                    <p className="text-primary-500 font-medium mt-1">Manage system users, roles, and public mechanic profiles.</p>
                </div>
                <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />} onClick={() => { resetForm(); setShowAddModal(true); }}>
                    Add User
                </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card padding="default" className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-accent-danger/20"><Shield className="w-6 h-6 text-accent-danger" /></div>
                    <div>
                        <p className="text-2xl font-bold font-display text-primary-950">{adminCount}</p>
                        <p className="text-sm text-primary-500">Administrators</p>
                    </div>
                </Card>
                <Card padding="default" className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-accent-info/20"><UserCheck className="w-6 h-6 text-accent-info" /></div>
                    <div>
                        <p className="text-2xl font-bold font-display text-primary-950">{cashierCount}</p>
                        <p className="text-sm text-primary-500">Cashiers</p>
                    </div>
                </Card>
                <Card padding="default" className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-accent-success/20"><User className="w-6 h-6 text-accent-success" /></div>
                    <div>
                        <p className="text-2xl font-bold font-display text-primary-950">{clerkCount}</p>
                        <p className="text-sm text-primary-500">Stock Clerks</p>
                    </div>
                </Card>
            </div>

            <div className="flex gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                    <input
                        type="text"
                        placeholder="Search users..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-primary-200 rounded-lg text-primary-950 placeholder-primary-400 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue shadow-sm"
                    />
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
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-semibold text-primary-950">{user.firstName} {user.lastName}</p>
                                <p className="text-sm text-primary-500">{user.email}</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <RoleBadge role={user.role} />
                                    <span className="rounded-full border border-primary-200 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-primary-500">
                                        {user.status}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => handleEdit(user)}
                                className="rounded-lg border border-primary-200 p-2 text-primary-500"
                            >
                                <Edit2 className="h-4 w-4" />
                            </button>
                        </div>
                    </Card>
                ))}
            </div>

            <div className="hidden md:block">
                <Table columns={columns} data={filteredUsers} loading={usersLoading} emptyMessage="No users found" />
            </div>

            <MechanicManagementPanel mechanics={mechanics} onReload={loadMechanics} onNotify={success} />

            <Modal
                isOpen={showAddModal}
                onClose={() => { setShowAddModal(false); setEditingUser(null); }}
                title={editingUser ? 'Edit User' : 'Add New User'}
                size="md"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="First Name" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} required />
                        <Input label="Last Name" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} required />
                    </div>

                    <Input label="Email Address" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />

                    <Dropdown label="Role" options={roleOptions} value={formData.role} onChange={(value) => setFormData({ ...formData, role: value })} />

                    <Input
                        label={editingUser ? 'New Password (leave blank to keep current)' : 'Password'}
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required={!editingUser}
                    />

                    <div className="flex gap-3 pt-4">
                        <Button variant="secondary" fullWidth onClick={() => { setShowAddModal(false); setEditingUser(null); }}>
                            Cancel
                        </Button>
                        <Button variant="primary" fullWidth type="submit">
                            {editingUser ? 'Update User' : 'Create User'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default UserManagement;
