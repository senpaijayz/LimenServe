import { Link } from 'react-router';
import { getServiceOperationalStage } from '../../services/utils/serviceOrderDisplay';

export default function ServiceAttentionList({ orders = [] }) {
  const actionable = orders.filter((order) => ['pending','in_progress'].includes(order.status) && (order.workStage === 'work_completed' || !order.assignedMechanic));
  return <section className="rounded-2xl border border-primary-200 bg-white p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold text-primary-950">Jobs needing attention</h2><Link to="/services" className="min-h-11 py-3 text-sm font-semibold text-blue-800 underline">View service queue</Link></div>
    <p className="mb-3 text-sm text-primary-700">From the loaded recent jobs. Open a job to review its next step.</p>
    {actionable.length === 0 && <p className="text-sm text-primary-700">No matching jobs in the loaded records. Check the full queue for older work.</p>}
    <div className="divide-y divide-primary-100">{actionable.slice(0,8).map((order) => {
      const stage = getServiceOperationalStage(order);
      return <Link key={order.id} to={`/services/${order.id}`} className="block rounded-lg py-3 text-sm hover:bg-primary-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
        <span className="font-bold text-primary-950">{order.orderNumber || order.order_number || order.id}</span>
        <span className="mt-1 block font-semibold text-amber-900">{stage.label}</span>
        <span className="mt-1 block text-primary-700">{stage.nextAction}</span>
      </Link>;
    })}</div>
  </section>;
}
