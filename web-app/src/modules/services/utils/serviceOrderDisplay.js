export function isServiceOrderOverdue(order) {
  if (!order || ['completed', 'cancelled'].includes(order.status)) return false;
  const plannedEnd = order.scheduledEnd ?? order.scheduled_end ?? order.assignment?.scheduledEnd;
  return Boolean(plannedEnd && new Date(plannedEnd).getTime() < Date.now());
}

// Display-only interpretation: never writes lifecycle, workshop or payment facts.
// A completed lifecycle alone is not evidence of settlement.
export function getServiceOperationalStage(order, work) {
  const payment = order?.paymentStatus ?? order?.payment_status;
  const stage = work?.state?.stage ?? order?.workStage;
  const result = (label, nextAction, tone = 'blue') => ({ label, nextAction, tone });
  if (order?.status === 'cancelled' || stage === 'cancelled') return result('Cancelled', 'Review job history', 'slate');
  if (order?.status === 'completed' || stage === 'released') {
    if (payment !== 'paid') return result('Completed · payment needs review', 'Check the payment record; do not assume this job was paid.', 'amber');
    return result('Completed / released', 'View the posted receipt and job history', 'green');
  }
  if (payment === 'paid') return result('Payment recorded · review release', 'Verify the posted sale before handing over the vehicle', 'green');
  if (stage === 'work_completed') return result('Repair finished · awaiting payment', 'Review actual charges, then confirm payment received', 'amber');
  if (stage === 'paused') return result('Paused', 'Review the recorded delay and resume when ready', 'amber');
  if (stage === 'in_progress' || order?.status === 'in_progress') return result('In progress', 'Update work and record actual parts and labor');
  const start = order?.scheduledStart ?? order?.scheduled_start ?? order?.assignment?.scheduledStart;
  if (start && Date.parse(start) > Date.now()) return result('Scheduled', 'Review the appointment and requested work');
  if (!order?.assignedMechanic && !order?.assignment?.mechanic) return result('Awaiting mechanic', 'Ask an administrator to assign a mechanic');
  return result('Awaiting assessment', 'Review the requested work before starting');
}
