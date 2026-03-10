import { useState } from 'react';
import { Search, Plus, Edit2, Trash2, Shield, User, UserCheck } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Modal from '../../../components/ui/Modal';
import Input from '../../../components/ui/Input';
import Dropdown from '../../../components/ui/Dropdown';
import { RoleBadge } from '../../../components/ui/Badge';
import Table from '../../../components/ui/Table';
import { useToast } from '../../../components/ui/Toast';
import { ROLES, ROLE_LABELS } from '../../../utils/constants';

// Mock users
const mockUsers = [
    { id: '1', firstName: 'Wilson', lastName: 'Limen', email: 'admin@limen.com', role: 'admin', status: 'active', lastLogin: '2024-01-15' },
    { id: '2', firstName: 'Maria', lastName: 'Santos', email: 'cashier@limen.com', role: 'cashier', status: 'active', lastLogin: '2024-01-15' },
    { id: '3', firstName: 'Juan', lastName: 'Dela Cruz', email: 'clerk@limen.com', role: 'stock_clerk', status: 'active', lastLogin: '2024-01-14' },
    { id: '4', firstName: 'Ana', lastName: 'Reyes', email: 'ana@limen.com', role: 'cashier', status: 'inactive', lastLogin: '2024-01-10' },
];

const roleOptions = [
    { value: 'admin', label: 'Administrator' },
    { value: 'cashier', label: 'Cashier' },
    { value: 'stock_clerk', label: 'Stock Clerk' },
];

/**
 * User Management Page
 * Manage system users and roles
 */
const UserManagement = () => {
    const { success } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        role: 'cashier',
        password: '',
    });

    // Filter users
    const filteredUsers = mockUsers.filter(user =>
        user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Handle form submit
    const handleSubmit = (e) => {
        e.preventDefault();
        success(editingUser ? 'User updated successfully!' : 'User created successfully!');
        setShowAddModal(false);
        setEditingUser(null);
        resetForm();
    };

    // Reset form
    const resetForm = () => {
        setFormData({
            firstName: '',
            lastName: '',
            email: '',
            role: 'cashier',
            password: '',
        });
    };

    // Handle edit
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

    // Table columns
    const columns = [
        {
            key: 'name',
            label: 'User',
            render: (_, row) => (
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center border border-primary-200">
                        <span className="text-sm font-bold text-primary-500">
                            {row.firstName[0]}{row.lastName[0]}
                        </span>
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
                <span className={`inline-flex items-center gap-1 text-sm ${status === 'active' ? 'text-accent-success' : 'text-primary-500'
                    }`}>
                    <span className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-accent-success' : 'bg-primary-500'}`} />
                    {status === 'active' ? 'Active' : 'Inactive'}
                </span>
            ),
        },
        {
            key: 'lastLogin',
            label: 'Last Login',
            render: (date) => new Date(date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }),
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
                    <button
                        className="p-1.5 rounded-lg hover:bg-primary-50 text-primary-400 hover:text-accent-danger transition-colors border border-transparent hover:border-primary-200"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            ),
        },
    ];

    // Role stats
    const adminCount = mockUsers.filter(u => u.role === 'admin').length;
    const cashierCount = mockUsers.filter(u => u.role === 'cashier').length;
    const clerkCount = mockUsers.filter(u => u.role === 'stock_clerk').length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div>
                    <h1 className="text-2xl font-display font-bold text-primary-950">
                        User Management
                    </h1>
                    <p className="text-primary-500 font-medium mt-1">
                        Manage system users and their access roles
                    </p>
                </div>
                <Button
                    variant="primary"
                    leftIcon={<Plus className="w-4 h-4" />}
                    onClick={() => { resetForm(); setShowAddModal(true); }}
                >
                    Add User
                </Button>
            </div>

            {/* Role Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card padding="default" className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-accent-danger/20">
                        <Shield className="w-6 h-6 text-accent-danger" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold font-display text-primary-100">{adminCount}</p>
                        <p className="text-sm text-primary-400">Administrators</p>
                    </div>
                </Card>

                <Card padding="default" className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-accent-info/20">
                        <UserCheck className="w-6 h-6 text-accent-info" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold font-display text-primary-100">{cashierCount}</p>
                        <p className="text-sm text-primary-400">Cashiers</p>
                    </div>
                </Card>

                <Card padding="default" className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-accent-success/20">
                        <User className="w-6 h-6 text-accent-success" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold font-display text-primary-100">{clerkCount}</p>
                        <p className="text-sm text-primary-400">Stock Clerks</p>
                    </div>
                </Card>
            </div>

            {/* Search */}
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

            {/* Users Table */}
            <Table
                columns={columns}
                data={filteredUsers}
                emptyMessage="No users found"
            />

            {/* Add/Edit Modal */}
            <Modal
                isOpen={showAddModal}
                onClose={() => { setShowAddModal(false); setEditingUser(null); }}
                title={editingUser ? 'Edit User' : 'Add New User'}
                size="md"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="First Name"
                            value={formData.firstName}
                            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                            required
                        />
                        <Input
                            label="Last Name"
                            value={formData.lastName}
                            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                            required
                        />
                    </div>

                    <Input
                        label="Email Address"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                    />

                    <Dropdown
                        label="Role"
                        options={roleOptions}
                        value={formData.role}
                        onChange={(value) => setFormData({ ...formData, role: value })}
                    />

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
