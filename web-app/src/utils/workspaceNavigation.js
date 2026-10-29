import { NAV_ITEMS } from './constants';

const sections = [
  { label: 'Daily work', paths: ['/dashboard', '/pos', '/quotation', '/services', '/customers'] },
  { label: 'Inventory', paths: ['/inventory', '/inventory/receive', '/products', '/locator-3d', '/suppliers'] },
  { label: 'Management', paths: ['/reports', '/users', '/cms'] },
];
const items = [...NAV_ITEMS.main, ...NAV_ITEMS.admin];
const itemByPath = new Map(items.map((item) => [item.path, item]));

export function getNavigationGroups(role) {
  return sections.map((section) => ({
    label: section.label,
    items: section.paths.map((path) => itemByPath.get(path)).filter((item) => item?.roles.includes(role)),
  })).filter((section) => section.items.length > 0);
}

export function getActiveNavigationPath(pathname, links = items) {
  return links.filter((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path;
}

const titles = [
  ...items,
  ...Object.entries({
    '/inventory': 'Inventory Management', '/quotation': 'Cost Estimation & Quotation',
    '/inventory/logs': 'Inventory History', '/inventory/orders': 'Supplier Orders',
    '/services/new': 'New Service Order', '/services/schedule': 'Workshop Schedule',
    '/reports': 'Reports & Analytics', '/reports/sales': 'Sales Report', '/reports/inventory': 'Inventory Report',
    '/settings/security': 'Account Security',
  }).map(([path, label]) => ({ path, label })),
];

export function getWorkspaceTitle(pathname) {
  const match = getActiveNavigationPath(pathname, titles);
  return [...titles].reverse().find((item) => item.path === match)?.label || 'LimenServe';
}
