// Recovery is device-local assistance, never an authoritative layout or session.
// The old unscoped v1 key is intentionally not adopted: its owner is unknown.
let context = null;
export function configureLocatorRecovery(next) {
    context = next?.userId && next?.layoutId ? { ...next } : null;
}
export function getRecoveryContext() { return context; }
function key() {
    return context ? `limen:locator3d:autosave:v2:${encodeURIComponent(context.userId)}:${encodeURIComponent(context.layoutId)}` : null;
}
export function readLocatorRecovery() {
    try {
        const value = key() && JSON.parse(localStorage.getItem(key()) || 'null');
        return value?.userId === context?.userId && value?.layoutId === context?.layoutId && Array.isArray(value?.objects) ? value : null;
    } catch { return null; }
}
export function writeLocatorRecovery(objects) {
    if (!key()) return;
    try {
        localStorage.setItem(key(), JSON.stringify({ ...context, createdAt: new Date().toISOString(), objects }));
    } catch { /* Private browsing and storage quota must not break editing. */ }
}
export function clearLocatorRecovery() {
    try { if (key()) localStorage.removeItem(key()); } catch { /* Leave other users/layouts intact. */ }
}
