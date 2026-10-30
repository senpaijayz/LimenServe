import { packageError } from './managedPackageDomain.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Read-only orchestration. A published preview must never fall back to its draft.
export function createSavedPackagePreviewReader({ loadRoot, loadRevision, loadDraft, previewDraft, loadReferences, pricePublished, publicDefinition }) {
  return async (id, query = {}) => {
    if (typeof id !== 'string' || !UUID.test(id) || !['draft', 'published'].includes(query.source)) {
      throw packageError('Choose a saved package and preview version.');
    }
    id = id.toLowerCase();
    const published = query.source === 'published';
    const revision = typeof query.expectedRevision === 'string' && /^\d+$/.test(query.expectedRevision)
      ? Number(query.expectedRevision) : NaN;
    if (published ? typeof query.revisionId !== 'string' || !UUID.test(query.revisionId)
      : !Number.isSafeInteger(revision) || revision < 0) {
      throw packageError('Refresh the package list before previewing this version.');
    }
    const revisionId = published ? query.revisionId.toLowerCase() : null;
    const root = await loadRoot(id);
    if (!root) throw packageError('This package is no longer available.', 404);
    if (!published) {
      const draft = await loadDraft(id);
      if (draft.id !== id || draft.expectedRevision !== revision) throw packageError('The saved draft changed. Refresh packages and preview it again.', 409);
      const result = await previewDraft(draft);
      return { ...result, source: 'draft', revisionId: null, revisionNumber: revision,
        publicationStatus: root.publication_status, generatedAt: new Date().toISOString() };
    }
    const isCurrent = (value) => value?.publication_status === 'published' && value.published_revision_id === revisionId;
    if (!isCurrent(root)) throw packageError('The published version changed or was removed. Refresh packages before previewing it.', 409);
    const saved = await loadRevision(id, revisionId);
    if (!saved || saved.package_id !== id || saved.id !== revisionId || !saved.definition) {
      throw packageError('The published version could not be confirmed. No draft has been substituted.', 409);
    }
    const definition = { ...saved.definition, variants: saved.definition.variants.filter((variant) => variant.active) };
    const references = await loadReferences(definition);
    const publication = { definition, revisionId: saved.id, revisionNumber: saved.revision_number, pricingSnapshot: saved.pricing_snapshot };
    const variants = definition.variants.map((variant) => {
      try { return pricePublished(publication, variant, references); }
      catch (error) {
        if (!error.statusCode) throw error;
        return { variantId: variant.id, label: variant.label, valid: false, error: error.publicMessage };
      }
    });
    if (!isCurrent(await loadRoot(id))) throw packageError('Publication changed while this preview was loading. Refresh packages and try again.', 409);
    return { source: 'published', revisionId: saved.id, revisionNumber: saved.revision_number,
      definition: publicDefinition(definition), variants, publicationStatus: 'published', generatedAt: new Date().toISOString() };
  };
}
