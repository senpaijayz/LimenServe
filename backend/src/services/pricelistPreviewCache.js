const DEFAULT_MAX_BYTES = 24 * 1024 * 1024;

export function createPricelistPreviewCache({
  maxBytes = DEFAULT_MAX_BYTES,
  maxEntries = 1,
  now = Date.now,
} = {}) {
  const entries = new Map();

  const removeExpired = () => {
    const currentTime = now();
    for (const [token, entry] of entries) {
      if (entry.expiresAt <= currentTime) entries.delete(token);
    }
  };

  return {
    set({ uploadId, previewToken, preview, expiresAt }) {
      if (!uploadId || !previewToken || !Array.isArray(preview?._draftItems)) return false;

      const serialized = JSON.stringify(preview);
      const sizeBytes = Buffer.byteLength(serialized, 'utf8');
      if (sizeBytes > maxBytes) return false;

      removeExpired();
      entries.delete(previewToken);
      while (entries.size >= maxEntries) {
        const oldestToken = entries.keys().next().value;
        if (!oldestToken) break;
        entries.delete(oldestToken);
      }

      entries.set(previewToken, {
        uploadId: String(uploadId),
        expiresAt: Number(expiresAt) || now(),
        serialized,
      });
      return true;
    },

    get({ uploadId, previewToken }) {
      if (!uploadId || !previewToken) return null;
      removeExpired();
      const entry = entries.get(previewToken);
      if (!entry || entry.uploadId !== String(uploadId)) return null;

      try {
        return JSON.parse(entry.serialized);
      } catch (_error) {
        entries.delete(previewToken);
        return null;
      }
    },

    delete(previewToken) {
      if (previewToken) entries.delete(previewToken);
    },

    deleteForUpload(uploadId) {
      const normalizedUploadId = String(uploadId || '');
      for (const [token, entry] of entries) {
        if (entry.uploadId === normalizedUploadId) entries.delete(token);
      }
    },

    clear() {
      entries.clear();
    },

    get size() {
      removeExpired();
      return entries.size;
    },
  };
}
