import { NavLink } from 'react-router-dom';
import {
    BarChart3,
    FileText,
    LayoutDashboard,
    Package,
    ShoppingCart,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { NAV_ITEMS } from '../../utils/constants';

const iconMap = {
    LayoutDashboard,
    ShoppingCart,
    Package,
    FileText,
    BarChart3,
};

const mobilePaths = new Set(['/dashboard', '/inventory', '/pos', '/quotation', '/reports']);

export default function MobileBottomNav() {
    const { user } = useAuth();
    const items = [...NAV_ITEMS.main, ...NAV_ITEMS.admin]
        .filter((item) => mobilePaths.has(item.path))
        .filter((item) => item.roles.includes(user?.role));

    if (items.length === 0) {
        return null;
    }

    return (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-primary-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
            <div className="mx-auto grid max-w-md grid-flow-col auto-cols-fr gap-1 py-2">
                {items.map((item) => {
                    const Icon = iconMap[item.icon];
                    return (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) => `flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-semibold ${isActive ? 'bg-primary-950 text-white' : 'text-primary-500'}`}
                        >
                            {Icon && <Icon className="h-4 w-4" />}
                            <span className="max-w-full truncate">{item.label.replace('Point of Sale', 'POS')}</span>
                        </NavLink>
                    );
                })}
            </div>
        </nav>
    );
}
