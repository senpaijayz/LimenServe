import { supabaseAdmin } from '../config/supabase.js';
import { getManagedPackage, loadManagedPackageReferences, previewManagedPackage } from './managedPackageService.js';
import { pricePublishedManagedVariant, publicManagedPackageDefinition } from './publishedManagedPackages.js';
import { createSavedPackagePreviewReader } from './managedPackagePreview.js';

const unwrap = ({ data, error }) => { if (error) throw error; return data; };
export const readSavedPackagePreview = createSavedPackagePreviewReader({
  loadRoot: async (id) => unwrap(await supabaseAdmin.schema('cms').from('recommendation_packages')
    .select('id,publication_status,published_revision_id').eq('id', id).maybeSingle()),
  loadRevision: async (packageId, revisionId) => unwrap(await supabaseAdmin.schema('cms').from('package_revisions')
    .select('id,package_id,revision_number,definition,pricing_snapshot').eq('id', revisionId).eq('package_id', packageId).maybeSingle()),
  loadDraft: getManagedPackage,
  previewDraft: previewManagedPackage,
  loadReferences: loadManagedPackageReferences,
  pricePublished: pricePublishedManagedVariant,
  publicDefinition: publicManagedPackageDefinition,
});
