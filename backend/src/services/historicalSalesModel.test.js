import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeHistoricalAggregatePayload,
    normalizePeriod,
    parseDateOnly,
} from './historicalSalesModel.js';

test('normalizes a day without changing its date', () => {
        assert.deepEqual(normalizePeriod('day', '2026-08-28'), {
            periodStart: '2026-08-28',
            periodEnd: '2026-08-28',
        });
    });

test('normalizes month and year boundaries', () => {
        assert.deepEqual(normalizePeriod('month', '2026-02-18'), {
            periodStart: '2026-02-01',
            periodEnd: '2026-02-28',
        });
        assert.deepEqual(normalizePeriod('year', '2026-08-28'), {
            periodStart: '2026-01-01',
            periodEnd: '2026-12-31',
        });
    });

test('rejects invalid calendar dates and unsupported granularities', () => {
        assert.throws(() => parseDateOnly('2026-02-30'), /valid date/);
        assert.throws(() => normalizePeriod('week', '2026-08-28'), /day, month, or year/);
    });

test('normalizes money, count, and operator fields', () => {
        assert.deepEqual(normalizeHistoricalAggregatePayload({
            periodGranularity: 'MONTH',
            periodStart: '2026-08-28',
            totalAmount: '64076.287',
            transactionCount: '12',
            paymentMethod: 'Mixed',
            originalReference: 'Monthly close 2026-08',
            cashierName: 'Jay',
        }), {
            periodGranularity: 'month',
            periodStart: '2026-08-01',
            periodEnd: '2026-08-31',
            totalAmount: 64076.29,
            transactionCount: 12,
            paymentMethod: 'mixed',
            originalReference: 'Monthly close 2026-08',
            customerName: '',
            cashierName: 'Jay',
            note: '',
            idempotencyKey: '',
        });
    });

test('requires a reference, cashier, amount, and count', () => {
        assert.throws(() => normalizeHistoricalAggregatePayload({
            periodGranularity: 'day',
            periodStart: '2026-08-28',
            totalAmount: -1,
            originalReference: 'x',
            cashierName: 'Jay',
        }), /non-negative/);
        assert.throws(() => normalizeHistoricalAggregatePayload({
            periodGranularity: 'day',
            periodStart: '2026-08-28',
            totalAmount: 10,
            originalReference: '',
            cashierName: 'Jay',
        }), /paper reference/);
    });
