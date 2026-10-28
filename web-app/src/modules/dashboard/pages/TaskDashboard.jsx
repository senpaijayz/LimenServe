import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../../context/useAuth';
import { listServiceOrders } from '../../../services/serviceOrdersApi';
import ServiceAttentionList from '../components/ServiceAttentionList';

const AdminDashboard = lazy(() => import('./AdminDashboard'));
const tasks = {
  cashier: [
    ['/pos','New sale','Find parts, review stock and take a verified payment.'],
    ['/services','Service payments','Review finished jobs and their final charges.'],
    ['/services/new','New service order','Record the customer, vehicle and requested work.'],
    ['/services/schedule','Workshop schedule','Check saved mechanic appointments.'],
  ],
  stock_clerk: [
    ['/inventory/receive','Receive stock','Scan or search received parts and review quantities.'],
    ['/inventory','Search inventory','Check recorded stock and part numbers.'],
    ['/locator-3d','Find in warehouse','Look up saved shelf and bin locations.'],
    ['/inventory/logs','Movement history','Review recorded stock additions and deductions.'],
  ],
};

export default function TaskDashboard() {
  const { user } = useAuth();
  const [state,setState] = useState({ loading: true, orders: [], error: '' });
  const [retry,setRetry] = useState(0);
  useEffect(() => {
    if (user?.role !== 'cashier') return;
    let active = true;
    listServiceOrders({ status: 'all', limit: 100 }).then((orders) => {
      if(active) setState({ loading: false, orders, error: '' });
    }).catch((error) => { if(active) setState({ loading: false, orders: [], error: error.message || 'Service jobs could not load. Open the service queue to check them.' }); });
    return () => { active = false; };
  },[user?.role,retry]);
  // Non-admin roles never mount the administrator analytics component.
  if(user?.role === 'admin') return <Suspense fallback={<p role="status">Loading shop overview…</p>}><AdminDashboard /></Suspense>;
  const links = tasks[user?.role] || [];
  return <div className="space-y-5">
    <header><h1 className="text-2xl font-bold text-primary-950">{user?.role === 'cashier' ? 'Sales & service desk' : 'Inventory & warehouse'}</h1><p className="mt-2 text-sm text-primary-700">Choose the task you need to work on.</p></header>
    <div className="grid gap-3 sm:grid-cols-2">{links.map(([href,title,description]) => <Link key={href} to={href} className="min-h-24 rounded-xl border border-primary-200 bg-white p-4 transition hover:border-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"><strong className="text-primary-950">{title}</strong><span className="mt-2 block text-sm text-primary-700">{description}</span></Link>)}</div>
    {user?.role === 'cashier' && <>
      {state.loading ? <p role="status">Loading recent service jobs…</p> : state.error ? <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{state.error}<button type="button" onClick={() => {setState((current) => ({...current,loading:true}));setRetry((value)=>value+1);}} className="ml-3 min-h-11 font-bold underline">Retry</button></div> : <ServiceAttentionList orders={state.orders} />}
    </>}
  </div>;
}
