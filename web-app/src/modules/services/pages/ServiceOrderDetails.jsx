import { useEffect, useState } from 'react';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { ServiceOrderDetailModal } from '../components/ServiceOrderModals';
import { assignMechanicToServiceOrder, completeServiceOrder, getServiceOrder, removeMechanicFromServiceOrder, updateServiceOrder } from '../../../services/serviceOrdersApi';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../context/useAuth';
import { ROLES } from '../../../utils/constants';
import ServiceWorkPanel from '../components/ServiceWorkPanel';

export default function ServiceOrderDetails() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    let active = true;
    getServiceOrder(orderId).then((value) => { if (active) { setOrder(value); setLoadError(''); } })
      .catch((error) => { if (active) setLoadError(error.message || 'Unable to load this order.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [orderId]);
  const update = async (id, status) => {
    const updated = await updateServiceOrder(id, { status });
    setOrder(updated); toast.success('Work status updated.'); return updated;
  };
  const complete = async (id, payment) => {
    const result = await completeServiceOrder(id, payment);
    setOrder(result.order); toast.success('Payment posted and job archived.'); return result;
  };
  const assign = async (id, payload) => {
    const updated = await assignMechanicToServiceOrder(id, payload);
    setOrder(updated); toast.success('Appointment saved.'); return updated;
  };
  const remove = async (id) => {
    const updated = await removeMechanicFromServiceOrder(id);
    setOrder(updated); toast.success('Assignment removed; history preserved.'); return updated;
  };
  return <div className="mx-auto max-w-6xl space-y-4 pb-12">
    <button type="button" onClick={() => navigate('/services')} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary-600 hover:text-primary-950"><ArrowLeft className="h-4 w-4" /> Service Orders</button>
    {loading && <div className="rounded-2xl border border-primary-200 bg-white p-8 text-primary-600">Loading service order…</div>}
    {loadError && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="h-4 w-4" /> {loadError}</div>}
    {!loading && order && <><ServiceOrderDetailModal pageMode workshopMode isOpen order={order} onClose={() => navigate('/services')} onStatusUpdate={update} onComplete={complete} canAssignMechanic={user?.role === ROLES.ADMIN} onAssignMechanic={assign} onRemoveMechanic={remove} /><ServiceWorkPanel order={order} onOrderUpdated={setOrder} /></>}
  </div>;
}
