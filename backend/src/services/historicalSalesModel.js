export const HISTORICAL_SALES_GRANULARITIES = Object.freeze(['day', 'month', 'year']);

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function invalid(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}
export function parseDateOnly(value, fieldName = 'Period start') {
    if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) {
        throw invalid(`${fieldName} must be a valid date in YYYY-MM-DD format.`);
    }

    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
        parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day
    ) {
        throw invalid(`${fieldName} must be a valid date in YYYY-MM-DD format.`);
    }

    return value;
}

export function normalizePeriod(granularity, periodStart) {
    if (!HISTORICAL_SALES_GRANULARITIES.includes(granularity)) {
        throw invalid('Historical totals must use day, month, or year granularity.');
    }

    const start = parseDateOnly(periodStart);
    const [year, month, day] = start.split('-').map(Number);

    if (granularity === 'day') {
        return { periodStart: start, periodEnd: start };
    }

    if (granularity === 'month') {
        const monthStart = new Date(Date.UTC(year, month - 1, 1));
        const monthEnd = new Date(Date.UTC(year, month, 0));
        return {
            periodStart: monthStart.toISOString().slice(0, 10),
            periodEnd: monthEnd.toISOString().slice(0, 10),
        };
    }

    return {
        periodStart: `${year.toString().padStart(4, '0')}-01-01`,
        periodEnd: `${year.toString().padStart(4, '0')}-12-31`,
    };
}

export function normalizeHistoricalAggregatePayload(body = {}) {
    const periodGranularity = typeof body.periodGranularity === 'string'
        ? body.periodGranularity.trim().toLowerCase()
        : '';
    const period = normalizePeriod(periodGranularity, body.periodStart);
    const totalAmount = Number(body.totalAmount);
    const transactionCount = Number(body.transactionCount ?? 1);
    const paymentMethod = typeof body.paymentMethod === 'string'
        ? body.paymentMethod.trim().toLowerCase()
        : 'cash';

    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
        throw invalid('Historical totals require a non-negative total amount.');
    }

    if (!Number.isInteger(transactionCount) || transactionCount < 1) {
        throw invalid('Historical totals require a whole transaction count of at least 1.');
    }

    if (!['cash', 'gcash', 'bank_transfer', 'mixed', 'unknown'].includes(paymentMethod)) {
        throw invalid('Historical totals require a supported payment method.');
    }

    const originalReference = typeof body.originalReference === 'string'
        ? body.originalReference.trim()
        : '';
    if (!originalReference) {
        throw invalid('Historical totals require an original paper reference.');
    }

    const cashierName = typeof body.cashierName === 'string' ? body.cashierName.trim() : '';
    if (!cashierName) {
        throw invalid('Historical totals require the original cashier name.');
    }

    return {
        periodGranularity,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        totalAmount: Number(totalAmount.toFixed(2)),
        transactionCount,
        paymentMethod,
        originalReference,
        customerName: typeof body.customerName === 'string' ? body.customerName.trim() : '',
        cashierName,
        note: typeof body.note === 'string' ? body.note.trim() : '',
        idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '',
    };
}
