// Match merchandise, not automotive words such as radiator CAP, water JACKET,
// transmission MANUAL, or instrument CLUSTER. Imported labels can be missing.
export const NON_PART_NAME_PATTERN = '(^|[^a-z])(t[ -]?shirts?|polo[ -]?shirts?|umbrel[a-z]*|tumblers?|lanyards?|backpacks?|baseball[ -]?caps?|souvenirs?)([^a-z]|$)';
export const NON_PART_LABEL_PATTERN = '(^|[^a-z])(merchandi[sz]e|apparel|collaterals?|manuals|tools)([^a-z]|$)';

export function isEstimatePricelistPart(row = {}) {
  return Number(row.price) > 0
    && !new RegExp(NON_PART_NAME_PATTERN, 'i').test(String(row.name || ''))
    && !['model_name', 'category', 'source_category'].some((key) =>
      new RegExp(NON_PART_LABEL_PATTERN, 'i').test(String(row[key] || '')));
}

export function applyEstimatePricelistScope(query, versionId) {
  if (!versionId) throw new Error('An active price list is required for estimate browsing.');
  let scoped = query.eq('pricelist_version_id', versionId)
    .gt('price', 0)
    .not('name', 'imatch', NON_PART_NAME_PATTERN);
  for (const field of ['model_name', 'category', 'source_category']) {
    // Keep unclassified automotive parts; NOT alone would discard SQL NULLs.
    // Quote the regex inside PostgREST's logic expression. Otherwise its
    // parentheses are parsed as logic delimiters and truncate the pattern.
    scoped = scoped.or(`${field}.is.null,${field}.not.imatch."${NON_PART_LABEL_PATTERN}"`);
  }
  return scoped;
}

export async function getActiveEstimatePricelist(client) {
  const { data, error } = await client.schema('catalog').from('pricelist_versions')
    .select('id').eq('price_type', 'retail').eq('is_active', true).maybeSingle();
  if (error) throw error;
  return { versionId: data?.id ?? null };
}
