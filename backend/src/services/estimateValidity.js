function utcDateString(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function filterActiveEstimates(estimates = [], now = new Date()) {
  const today = utcDateString(now);
  if (!today) return [];

  return (Array.isArray(estimates) ? estimates : []).filter((estimate) => {
    const validUntil = String(estimate?.valid_until || '').slice(0, 10);
    return !validUntil || validUntil >= today;
  });
}
