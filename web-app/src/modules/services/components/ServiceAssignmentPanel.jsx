import { useEffect, useState } from 'react';
import { useAuth } from '../../../context/useAuth';
import { useToast } from '../../../components/ui/Toast';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { listMechanics } from '../../../services/mechanicsApi';
import { assignMechanicToServiceOrder, getServiceScheduleSlots, removeMechanicFromServiceOrder } from '../../../services/serviceOrdersApi';

const manilaDate = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const time = (value) => new Date(value).toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit'});
const dateTime = (value) => value ? new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila'}) : 'Not scheduled';

export default function ServiceAssignmentPanel({ order,onOrderUpdated }) {
  const { user } = useAuth();
  const toast = useToast();
  const [mechanics,setMechanics] = useState([]);
  const [mechanicId,setMechanicId] = useState(order.assignedMechanic?.id || '');
  const [date,setDate] = useState(manilaDate);
  const [duration,setDuration] = useState(60);
  const [slots,setSlots] = useState([]);
  const [selected,setSelected] = useState(null);
  const [loading,setLoading] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [removeOpen,setRemoveOpen] = useState(false);
  const [reload,setReload] = useState(0);
  const canEdit = user?.role === 'admin' && !['completed','cancelled'].includes(order.status);
  useEffect(() => {
    if(!canEdit) return;
    let active = true;
    listMechanics({activeOnly:true}).then((rows)=>{if(active) setMechanics(rows);}).catch((err)=>{if(active) setError(err.message || 'Mechanics could not load. Retry below.');});
    return ()=>{active=false;};
  },[canEdit,reload]);
  useEffect(() => {
    if(!canEdit || !mechanicId || !date) {setSlots([]); return;}
    let active=true;
    setLoading(true); setSelected(null); setError('');
    getServiceScheduleSlots({date,duration,mechanicId,orderId:order.id}).then((result)=>{if(active) setSlots(result.slots || []);})
      .catch((err)=>{if(active){setSlots([]);setError(err.message || 'Appointment times could not load. Choose another date or retry.');}})
      .finally(()=>{if(active) setLoading(false);});
    return ()=>{active=false;};
  },[canEdit,mechanicId,date,duration,order.id,reload]);
  const save = async () => {
    if(busy || loading || !selected || !slots.some((slot)=>slot.start===selected.start && slot.available)) return;
    setBusy(true); setError('');
    try {
      const saved = await assignMechanicToServiceOrder(order.id,{mechanicId,scheduledStart:selected.start,scheduledEnd:selected.end});
      onOrderUpdated(saved); setSelected(null); setReload((value)=>value+1); toast.success('Appointment saved.');
    } catch(err){setError(err.message || 'The appointment could not be saved. Refresh available times before trying again.');setSelected(null);}
    finally{setBusy(false);}
  };
  const remove = async () => {
    if(busy) return;
    setBusy(true);setError('');
    try{onOrderUpdated(await removeMechanicFromServiceOrder(order.id));setRemoveOpen(false);setSelected(null);toast.success('Assignment removed. Its history is retained.');}
    catch(err){setError(err.message || 'The assignment could not be removed. Check the saved job before retrying.');}
    finally{setBusy(false);}
  };
  return <section className="space-y-4 rounded-xl border border-primary-200 bg-white p-4 sm:p-6">
    <h2 className="text-lg font-bold text-primary-950">Mechanic & schedule</h2>
    <div className="rounded-xl bg-primary-50 p-4 text-sm text-primary-800"><p className="font-bold">{order.assignedMechanic?.name || 'No mechanic assigned'}</p><p className="mt-2">{dateTime(order.scheduledStart)}{order.scheduledEnd ? ` – ${dateTime(order.scheduledEnd)}` : ''}</p><p className="mt-2">Philippine time. Previous appointments stay in History.</p></div>
    {error && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{error}<button type="button" disabled={busy} onClick={()=>setReload((value)=>value+1)} className="ml-3 min-h-11 font-bold underline">Refresh times and mechanics</button></div>}
    {canEdit ? <>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm font-semibold text-primary-800">Mechanic<select className="input mt-1 w-full" value={mechanicId} onChange={(event)=>{setMechanicId(event.target.value);setSelected(null);}}><option value="">Choose a mechanic</option>{mechanics.map((mechanic)=><option key={mechanic.id} value={mechanic.id}>{mechanic.fullName || mechanic.full_name || mechanic.name}</option>)}</select></label>
        <label className="text-sm font-semibold text-primary-800">Date<input type="date" min={manilaDate()} value={date} onChange={(event)=>{setDate(event.target.value);setSelected(null);}} className="input mt-1 w-full" /></label>
        <label className="text-sm font-semibold text-primary-800">Appointment length<select value={duration} onChange={(event)=>{setDuration(Number(event.target.value));setSelected(null);}} className="input mt-1 w-full">{[30,60,90,120,180,240].map((minutes)=><option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label>
      </fieldset>
      <p className="text-sm text-primary-700">Monday–Saturday: 8 AM–5 PM. Sunday: 8 AM–12 PM. Available times also respect the mechanic’s shift and existing bookings.</p>
      {loading ? <p role="status">Loading available times…</p> : mechanicId && <label className="block text-sm font-semibold text-primary-800">Available appointment<select disabled={busy} value={selected?.start || ''} onChange={(event)=>setSelected(slots.find((slot)=>slot.start===event.target.value) || null)} className="input mt-1 w-full"><option value="">Choose an available time</option>{slots.filter((slot)=>slot.available).map((slot)=><option key={slot.start} value={slot.start}>{time(slot.start)} – {time(slot.end)}</option>)}</select>{!slots.some((slot)=>slot.available) && <span className="mt-2 block font-normal">No available times for this selection. Try another date or mechanic.</span>}</label>}
      <div className="flex flex-wrap gap-3"><button type="button" onClick={save} disabled={busy || loading || !selected} className="btn bg-blue-800 text-white disabled:opacity-50">{busy?'Saving…':order.assignedMechanic?'Change assignment':'Save assignment'}</button>{order.assignedMechanic && <button type="button" disabled={busy} onClick={()=>setRemoveOpen(true)} className="btn border border-red-300 text-red-800">Remove assignment</button>}</div>
    </> : <p className="text-sm text-primary-700">{user?.role!=='admin'?'An administrator can change the mechanic or appointment.':'Completed and cancelled jobs retain their recorded appointments.'}</p>}
    <ConfirmDialog isOpen={removeOpen} title="Remove this assignment?" message="The current appointment will be removed. Its assignment history stays with the job." onConfirm={remove} onClose={()=>{if(!busy)setRemoveOpen(false);}} isLoading={busy} confirmLabel="Remove assignment" />
  </section>;
}
