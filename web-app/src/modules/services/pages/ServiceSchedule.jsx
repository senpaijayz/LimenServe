import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, Clock } from 'lucide-react';
import { useNavigate } from 'react-router';
import { getServiceScheduleDay } from '../../../services/serviceOrdersApi';

const todayInManila = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const time = (value) => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
const manilaMinutes = (value) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
};

export default function ServiceSchedule() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayInManila);
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    getServiceScheduleDay(date).then((result) => { if (active) { setSchedule(result); setError(''); } })
      .catch((err) => { if (active) setError(err.message || 'Unable to load this day.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [date]);
  const sunday = schedule?.hours?.closesAt?.startsWith('12');
  const bookings = schedule?.bookings || [];
  return <div className="mx-auto max-w-5xl space-y-5 pb-12">
    <button type="button" onClick={() => navigate('/services')} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary-600 hover:text-primary-950"><ArrowLeft className="h-4 w-4" /> Service Orders</button>
    <header className="rounded-2xl border border-primary-200 bg-white p-5 shadow-sm sm:p-7"><div className="flex items-center gap-3"><CalendarDays className="h-6 w-6 text-blue-700" /><h1 className="text-2xl font-bold text-primary-950">Daily workshop schedule</h1></div><p className="mt-2 text-sm text-primary-600">Saved mechanic appointments, including historical sessions. Select a day to see its bookings.</p><div className="mt-5 flex flex-wrap items-end gap-4"><label className="text-sm font-semibold text-primary-700">Schedule date<input type="date" className="input mt-1 block" value={date} onChange={(e) => { setLoading(true); setDate(e.target.value); }} /></label><span className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">{sunday ? 'Sunday · 8:00 AM–12:00 PM' : 'Monday–Saturday · 8:00 AM–5:00 PM'}</span></div></header>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <main className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm sm:p-6"><h2 className="text-lg font-bold text-primary-950">{loading ? 'Loading bookings…' : `${bookings.length} recorded session${bookings.length===1?'':'s'}`}</h2>{!loading && bookings.length===0 && <p className="mt-4 rounded-xl border border-dashed border-primary-200 p-6 text-sm text-primary-600">No appointments are recorded for this day.</p>}<div className="mt-4 space-y-3">{bookings.map((booking) => {
      const outsideCurrentHours = manilaMinutes(booking.scheduled_start) < 480 || manilaMinutes(booking.scheduled_end) > (sunday ? 720 : 1020);
      return <button key={booking.id} type="button" onClick={() => navigate(`/services/${booking.service_order_id}`)} className="flex w-full flex-col gap-3 rounded-xl border border-primary-200 p-4 text-left transition hover:border-blue-500 hover:shadow-sm sm:flex-row sm:items-center"><span className="flex shrink-0 items-center gap-2 text-sm font-bold text-blue-800"><Clock className="h-4 w-4" /> {time(booking.scheduled_start)}–{time(booking.scheduled_end)}</span><span className="min-w-0 flex-1"><strong className="block truncate text-primary-950">{booking.mechanic?.full_name || 'Former mechanic'} · {booking.order?.order_number || 'Service order'}</strong><span className="mt-1 block truncate text-sm text-primary-600">{booking.order?.note || 'No work description recorded'}</span>{outsideCurrentHours && <span className="mt-1 block text-xs font-semibold text-amber-800">Existing booking outside current workshop hours; new bookings cannot use this time.</span>}</span><span className="self-start rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold capitalize text-primary-700 sm:self-auto">{booking.status}</span></button>;
    })}</div></main>
  </div>;
}
