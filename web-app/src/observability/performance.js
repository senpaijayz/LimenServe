const VITAL_ENTRIES = [
    ['largest-contentful-paint', 'LCP'],
    ['layout-shift', 'CLS'],
    ['event', 'INP'],
    ['first-input', 'FID'],
    ['paint', 'FCP'],
];

function hasBrowserPerformance() {
    return typeof window !== 'undefined' && typeof performance !== 'undefined';
}

function publish(metric, value, details = {}) {
    if (!hasBrowserPerformance() || !Number.isFinite(value)) {
        return;
    }

    const entry = {
        id: `${metric.toLowerCase()}-${Math.round(performance.now())}`,
        metric,
        route: window.location.pathname,
        timestamp: new Date().toISOString(),
        value: Number(value.toFixed(2)),
        ...details,
    };
    window.__limenPerformance = {
        ...(window.__limenPerformance || {}),
        [metric]: entry,
    };
    window.dispatchEvent(new CustomEvent('limen:performance', { detail: entry }));
}

function observeVitals(onMetric) {
    if (typeof PerformanceObserver === 'undefined') {
        return [];
    }

    return VITAL_ENTRIES.flatMap(([type, metric]) => {
        try {
            const observer = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const latest = entries.at(-1);
                if (!latest) return;
                const value = metric === 'CLS'
                    ? entries.reduce((total, item) => total + Number(item.value || 0), 0)
                    : metric === 'INP'
                        ? Number(latest.duration || 0)
                        : Number(latest.startTime || latest.value || 0);
                const details = metric === 'INP' ? { interactionType: latest.name } : {};
                publish(metric, value, details);
                onMetric?.(window.__limenPerformance[metric]);
            });
            observer.observe({ buffered: true, type });
            return [observer];
        } catch {
            return [];
        }
    });
}

export function recordRouteLoad(route) {
    if (!hasBrowserPerformance()) {
        return null;
    }

    const safeRoute = String(route || window.location.pathname || '/');
    const markName = `limen-route-loaded:${safeRoute}`;
    performance.mark(markName);
    const navigationStart = performance.getEntriesByType('navigation')[0]?.startTime || 0;
    const value = performance.getEntriesByName(markName)[0]?.startTime - navigationStart;
    publish('ROUTE_LOAD', value, { route: safeRoute });
    return window.__limenPerformance.ROUTE_LOAD;
}

export function startPerformanceMonitoring({ onMetric } = {}) {
    if (!hasBrowserPerformance()) {
        return () => {};
    }

    const navigation = performance.getEntriesByType('navigation')[0];
    if (navigation) {
        publish('TTFB', navigation.responseStart - navigation.requestStart);
    }
    const observers = observeVitals(onMetric);
    const handleVisibility = () => {
        if (!document.hidden) {
            recordRouteLoad(window.location.pathname);
        }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
        observers.forEach((observer) => observer.disconnect());
        document.removeEventListener('visibilitychange', handleVisibility);
    };
}
