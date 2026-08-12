export const LOCATOR_QUALITY_OPTIONS = ['auto', 'high', 'medium', 'low'];

export const LOCATOR_QUALITY_PROFILES = {
    high: {
        antialias: true,
        bloom: true,
        contactShadows: true,
        dpr: [1, 1.75],
        environment: true,
        labels: true,
        shadowMapSize: 2048,
        shadows: true,
    },
    medium: {
        antialias: false,
        bloom: false,
        contactShadows: true,
        dpr: [1, 1.35],
        environment: false,
        labels: true,
        shadowMapSize: 1024,
        shadows: true,
    },
    low: {
        antialias: false,
        bloom: false,
        contactShadows: false,
        dpr: [1, 1],
        environment: false,
        labels: false,
        shadowMapSize: 0,
        shadows: false,
    },
};

function safeNumber(value, fallback) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function normalizeLocatorQualityPreference(value) {
    return LOCATOR_QUALITY_OPTIONS.includes(value) ? value : 'auto';
}

export function resolveLocatorQualityTier(preference = 'auto', capabilities = {}) {
    const normalizedPreference = normalizeLocatorQualityPreference(preference);

    if (normalizedPreference !== 'auto') {
        return normalizedPreference;
    }

    const deviceMemory = safeNumber(capabilities.deviceMemory, 4);
    const hardwareConcurrency = safeNumber(capabilities.hardwareConcurrency, 4);
    const devicePixelRatio = safeNumber(capabilities.devicePixelRatio, 1);
    const saveData = Boolean(capabilities.saveData);
    const reducedMotion = Boolean(capabilities.reducedMotion);

    if (saveData || reducedMotion || deviceMemory <= 2 || hardwareConcurrency <= 2) {
        return 'low';
    }

    if (deviceMemory <= 4 || hardwareConcurrency <= 4 || devicePixelRatio > 2) {
        return 'medium';
    }

    return 'high';
}

export function getLocatorQualityCapabilities(browserWindow = globalThis.window) {
    const navigatorValue = browserWindow?.navigator;
    const connection = navigatorValue?.connection ?? navigatorValue?.mozConnection ?? navigatorValue?.webkitConnection;

    return {
        deviceMemory: navigatorValue?.deviceMemory,
        devicePixelRatio: browserWindow?.devicePixelRatio,
        hardwareConcurrency: navigatorValue?.hardwareConcurrency,
        reducedMotion: Boolean(browserWindow?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches),
        saveData: Boolean(connection?.saveData),
    };
}

export function getLocatorQualityProfile(preference = 'auto', capabilities) {
    const tier = resolveLocatorQualityTier(preference, capabilities);

    return {
        ...LOCATOR_QUALITY_PROFILES[tier],
        tier,
    };
}
