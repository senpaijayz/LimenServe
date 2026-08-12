import { describe, expect, it } from 'vitest';
import { recordRouteLoad, startPerformanceMonitoring } from '../observability/performance';

describe('browser performance telemetry', () => {
    it('records route load timing in an inspectable browser snapshot', () => {
        performance.clearMarks?.();
        const metric = recordRouteLoad('/catalog');

        expect(metric).toMatchObject({
            metric: 'ROUTE_LOAD',
            route: '/catalog',
        });
        expect(window.__limenPerformance.ROUTE_LOAD.value).toBeGreaterThanOrEqual(0);
    });

    it('returns a cleanup function when performance observers are unavailable', () => {
        const originalObserver = globalThis.PerformanceObserver;
        globalThis.PerformanceObserver = undefined;

        const cleanup = startPerformanceMonitoring();
        expect(cleanup).toBeTypeOf('function');
        cleanup();

        globalThis.PerformanceObserver = originalObserver;
    });
});
