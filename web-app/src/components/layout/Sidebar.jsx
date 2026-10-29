import { Link, useLocation } from 'react-router';
import { LayoutDashboard, ShoppingCart, Package, FileText, Wrench, Box, Boxes, BarChart3, Users, Truck, ClipboardList, ChevronLeft, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { useTheme } from '../../context/ThemeContext';
import usePublicCmsSite from '../../hooks/usePublicCmsSite';
import { ROLE_LABELS } from '../../utils/constants';
import { getActiveNavigationPath, getNavigationGroups } from '../../utils/workspaceNavigation';
import Modal from '../ui/Modal';

const icons = { LayoutDashboard, ShoppingCart, Package, FileText, Wrench, Box, Boxes, BarChart3, Users, Truck, ClipboardList };

function NavigationEntry({ item, active, collapsed, mobile, onNavigate }) {
    const Icon = icons[item.icon] || Box;
    const mobileClass = 'grid min-h-12 grid-cols-[1.125rem_minmax(0,1fr)] items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold ' + (active ? 'border-blue-500 bg-blue-50 text-blue-950' : 'border-primary-200 bg-white text-primary-800 hover:border-blue-400 hover:bg-blue-50');
    const desktopClass = 'sidebar-nav-item ' + (active ? 'sidebar-nav-item-active' : '');
    return <Link to={item.path} onClick={onNavigate} aria-current={active ? 'page' : undefined}
        aria-label={item.label} title={collapsed && !mobile ? item.label : undefined}
        className={(mobile ? mobileClass : desktopClass) + ' focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'}>
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className={collapsed && !mobile ? 'sr-only' : 'min-w-0 break-words'}>{item.label}</span>
    </Link>;
}

function NavigationGroups({ groups, activePath, collapsed = false, mobile = false, onNavigate }) {
    return groups.map((section) => <section key={section.label} aria-label={section.label} className="mb-5 last:mb-0">
        <h2 className={collapsed && !mobile ? 'sr-only' : 'mb-2 px-1 text-xs font-bold uppercase tracking-wider text-primary-600'}>{section.label}</h2>
        <div className={mobile ? 'grid grid-cols-2 gap-2 [&>a:last-child:nth-child(odd)]:col-span-2' : 'space-y-1'}>
            {section.items.map((item) => <NavigationEntry key={item.path} item={item} active={activePath === item.path} collapsed={collapsed} mobile={mobile} onNavigate={onNavigate} />)}
        </div>
    </section>);
}

export default function Sidebar() {
    const { user, logout } = useAuth();
    const { sidebarCollapsed, sidebarOpen, toggleSidebar, closeMobileSidebar } = useTheme();
    const { settings } = usePublicCmsSite();
    const { pathname } = useLocation();
    const groups = getNavigationGroups(user?.role);
    const activePath = getActiveNavigationPath(pathname, groups.flatMap((group) => group.items));
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.fullName || 'Staff account';
    const role = ROLE_LABELS[user?.role] || user?.role || '';
    const canViewSecurity = ['admin', 'cashier', 'stock_clerk'].includes(user?.role);
    const securityActive = pathname.startsWith('/settings/security');
    const handleLogout = () => { closeMobileSidebar(); void logout(); };

    return <>
        <aside className={'sidebar hidden lg:flex ' + (sidebarCollapsed ? 'sidebar-collapsed' : '')} aria-label="Desktop workspace">
            <div className="sidebar-logo">
                <img src={settings?.logo_url || '/LogoLimen.jpg'} alt="Limen Logo" onError={(event) => { event.currentTarget.src = '/LogoLimen.jpg'; }} className="h-10 w-10 shrink-0 rounded-lg border border-primary-200 bg-white p-1 object-contain" />
                {!sidebarCollapsed && <div className="min-w-0"><p className="font-display text-lg font-bold text-primary-950">LimenServe</p><p className="text-xs text-primary-600">Auto Parts MIS</p></div>}
            </div>
            <nav className="sidebar-nav" aria-label="Workspace navigation">
                <NavigationGroups groups={groups} activePath={activePath} collapsed={sidebarCollapsed} onNavigate={closeMobileSidebar} />
            </nav>
            <div className="mt-auto border-t border-primary-200 p-3">
                <div className="mb-3 flex min-w-0 items-center gap-3 px-1" title={name + ' · ' + role}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary-200 bg-primary-100 text-sm font-bold text-primary-900">{user?.firstName?.[0]}{user?.lastName?.[0]}</span>
                    {!sidebarCollapsed && <div className="min-w-0"><p className="truncate text-sm font-semibold text-primary-950">{name}</p><p className="text-xs text-primary-600">{role}</p></div>}
                </div>
                {canViewSecurity && <Link to="/settings/security" onClick={closeMobileSidebar} aria-label="Account Security" title={sidebarCollapsed ? 'Account Security' : undefined} aria-current={securityActive ? 'page' : undefined}
                    className={'sidebar-nav-item ' + (securityActive ? 'sidebar-nav-item-active' : '')}>
                    <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" /><span className={sidebarCollapsed ? 'sr-only' : 'text-sm'}>Account Security</span>
                </Link>}
                <button type="button" onClick={toggleSidebar} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? 'Expand sidebar' : undefined}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-primary-700 hover:bg-primary-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                    <ChevronLeft className={'h-5 w-5 shrink-0 ' + (sidebarCollapsed ? 'rotate-180' : '')} aria-hidden="true" />
                    <span className={sidebarCollapsed ? 'sr-only' : 'text-sm'}>Collapse</span>
                </button>
                <button type="button" onClick={handleLogout} aria-label="Logout" title={sidebarCollapsed ? 'Logout' : undefined}
                    className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600">
                    <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" /><span className={sidebarCollapsed ? 'sr-only' : 'text-sm'}>Logout</span>
                </button>
            </div>
        </aside>

        <Modal id="mobile-workspace-navigation" isOpen={sidebarOpen} onClose={closeMobileSidebar} title="Menu" size="lg" footer={
            <div className="w-full">
                <p className="mb-3 break-words text-xs text-primary-600">{name} · {role}</p>
                <div className="flex flex-wrap gap-2">
                    {canViewSecurity && <Link to="/settings/security" onClick={closeMobileSidebar} aria-current={securityActive ? 'page' : undefined} className="btn btn-secondary min-h-11 flex-1"><ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />Account Security</Link>}
                    <button type="button" onClick={handleLogout} className="btn btn-secondary min-h-11 text-red-700"><LogOut className="h-4 w-4" aria-hidden="true" />Logout</button>
                </div>
            </div>
        }>
            <nav aria-label="Workspace navigation">
                <NavigationGroups groups={groups} activePath={activePath} mobile onNavigate={closeMobileSidebar} />
            </nav>
        </Modal>
    </>;
}
