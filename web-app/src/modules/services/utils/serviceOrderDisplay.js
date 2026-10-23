export function isServiceOrderOverdue(order) {
  if (!order || ['completed', 'cancelled'].includes(order.status)) return false;
  const plannedEnd = order.scheduledEnd ?? order.scheduled_end ?? order.assignment?.scheduledEnd;
  return Boolean(plannedEnd && new Date(plannedEnd).getTime() < Date.now());
}
