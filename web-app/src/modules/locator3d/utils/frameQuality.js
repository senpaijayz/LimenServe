// Idle demand-rendering gaps are not evidence of slow GPU performance.
export function createFrameSampler() { return { samples: [], slowWindows: 0, cooldown: 0 }; }
export function sampleFrameQuality(state, delta, tier, enabled = true) {
    if (!enabled || !Number.isFinite(delta) || delta <= 0 || delta > 0.25) {
        state.samples = []; state.slowWindows = 0; return null;
    }
    if (state.cooldown > 0) { state.cooldown -= delta; return null; }
    state.samples.push(delta);
    if (state.samples.length < 45) return null;
    const fps = state.samples.length / state.samples.reduce((sum, value) => sum + value, 0);
    state.samples = [];
    state.slowWindows = fps < 28 ? state.slowWindows + 1 : 0;
    if (state.slowWindows < 2) return null;
    state.slowWindows = 0; state.cooldown = 8;
    return tier === 'high' ? 'medium' : tier === 'medium' ? 'low' : null;
}
