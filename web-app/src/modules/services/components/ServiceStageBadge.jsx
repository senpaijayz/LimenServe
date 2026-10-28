import { getServiceOperationalStage } from '../utils/serviceOrderDisplay';

const colors = {
  blue: 'border-blue-200 bg-blue-50 text-blue-900',
  amber: 'border-amber-300 bg-amber-50 text-amber-950',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  slate: 'border-slate-200 bg-slate-50 text-slate-800',
};

export default function ServiceStageBadge({ order, work }) {
  const stage = getServiceOperationalStage(order, work);
  return <span title={stage.nextAction} className={`inline-flex max-w-full rounded-xl border px-2.5 py-1 text-xs font-semibold ${colors[stage.tone]}`}>{stage.label}</span>;
}
