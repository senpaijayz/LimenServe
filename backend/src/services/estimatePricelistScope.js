const words = (terms) => `(^|[^a-z])(${terms.join('|')})([^a-z]|$)`;

// Raw supplier rows, not the derived operational categories used by inventory.
// Do not mistake a radiator CAP, water JACKET, or TOOL BOX COVER for merchandise.
export const NON_PART_NAME_PATTERN = [
  words([
    't[ -]?shirts?', 'polo[ -]?shirts?', 'umbrel[a-z]*', 'tumblers?', 'lanyards?',
    'backpacks?', 'baseball[ -]?caps?', 'souvenirs?', 'sandpaper', 'thinners?',
    'hardeners?', 'putty', 'glaze[a-z]*', 'polish[a-z]*', 'sanders?',
    'abrasives?', 'abralon', 'superbuff', 'sanding', 'autosurfacer', 'stickers?', 'ratchets?', 'wrench(es)?', 'spanners?',
    'screwdrivers?', 'pliers', 'pullers?', 'removers?', 'installers?', 'extractors?',
    'testers?', 'jigs?', 'mandrels?', 'reamers?', 'taps', 'dies', 'press(es)?',
    'masking', 'respirators?', 'adhesives?', 'sealants?', 'degreasers?', '2k',
    'key[ -]+case', 'tire[ -]+pando',
    '(workshop|service|repair|owner[s]?[ -]*|instruction)[ -]+manuals?',
    'parts[ -]+catalog(ue)?s?', 'technical[ -]+publications?',
  ]),
  'drive[ -]+(socket|extension)',
  'socket[ -]+adapt[eo]r',
  '^mask[ -]+(black|white|[(])',
  'cover.*[(]10[ -]*pcs',
  '(^|^a[, ])tools?([^a-z]|$)',
  words(['tools?[ -]+(set|kit)']),
].join('|');

export const NON_PART_LABEL_PATTERN = words([
  'merchandi[sz]e', 'apparel', 'collaterals?', 'manuals', 'tools',
  'paint[ -]+materials?', 'workshop[ -]+supplies',
]);
export const GENERAL_MODEL_PATTERN = `^$|${words(['various', 'universal', 'general', 'accessories'])}`;
// These general-fitment supplier ranges contain service-tool adapters, holding
// fixtures and diagnostic harnesses in the imported list, not replacement parts.
// Do not apply this exclusion to products with a specific vehicle fitment.
export const SERVICE_TOOL_SKU_PATTERN = '^M(B99|D99)';
export const CAR_PART_NAME_PATTERN = words([
  'filters?', 'brakes?(?![ -]+(fluid|cleaner))', 'calipers?', 'rotors?', 'discs?', 'drums?', 'thermostats?',
  'radiators?', 'condensers?', 'compressors?', 'evaporators?', 'heaters?', 'pumps?',
  'hoses?', 'pipes?', 'tubes?', 'belts?', 'pulleys?', 'tensioners?', 'bearings?',
  'bushings?', 'bushes', 'bolts?', 'nuts?', 'washers?', 'clips?', 'seals?', 'gaskets?',
  'plugs?', 'wires?', 'harness(es)?', 'sensors?', 'switch(es)?', 'relays?', 'bulbs?',
  'lamps?', 'lights?', 'lens(es)?', 'sockets?', 'alternators?', 'starters?',
  'batter[a-z]*', 'struts?', 'shocks?', 'springs?', 'arms?', 'joints?', 'shafts?',
  'axles?', 'clutch(es)?', 'transmissions?(?![ -]+oil)', 'gears?(?![ -]+oil)', 'sprockets?', 'chains?',
  'pistons?', 'cylinders?', 'valves?', 'manifolds?', 'mufflers?', 'catalysts?',
  'bumpers?', 'fenders?', 'panels?', 'doors?', 'hoods?', 'bonnets?', 'grilles?',
  'mirrors?', 'glass', 'windshields?', 'wipers?', 'seats?', 'carpets?', 'mats?',
  'handles?', 'knobs?', 'locks?', 'latch(es)?', 'hinges?', 'brackets?', 'mounts?',
  'caps?', 'covers?', 'housings?', 'cases?', 'tanks?', 'reservoirs?', 'fans?',
  'shrouds?', 'dampers?', 'stabilizers?', 'links?', 'knuckles?', 'hubs?', 'wheels?',
  'rims?', 'tires?', 'tyres?', 'emblems?', 'mouldings?', 'moldings?', 'garnish',
  'trim', 'instruments?', 'clusters?', 'jackets?', 'assy', 'assembly', 'assemblies',
]);

export function isEstimatePricelistPart(row = {}) {
  const name = String(row.name || '');
  const model = String(row.model_name || '');
  return Number(row.price) > 0
    && !new RegExp(NON_PART_NAME_PATTERN, 'i').test(name)
    && !['model_name', 'category', 'source_category'].some((key) =>
      new RegExp(NON_PART_LABEL_PATTERN, 'i').test(String(row[key] || '')))
    && ((row.model_name != null && !new RegExp(GENERAL_MODEL_PATTERN, 'i').test(model))
      || (new RegExp(CAR_PART_NAME_PATTERN, 'i').test(name)
        && !new RegExp(SERVICE_TOOL_SKU_PATTERN, 'i').test(String(row.sku || ''))));
}

export function applyEstimatePricelistScope(query, versionId) {
  if (!versionId) throw new Error('An active price list is required for estimate browsing.');
  let scoped = query.eq('pricelist_version_id', versionId)
    .gt('price', 0)
    .not('name', 'imatch', NON_PART_NAME_PATTERN);
  for (const field of ['model_name', 'category', 'source_category']) {
    // Preserve NULLs and quote regex values so PostgREST does not parse regex
    // parentheses as logic delimiters. These filters precede count/pagination.
    scoped = scoped.or(`${field}.is.null,${field}.not.imatch."${NON_PART_LABEL_PATTERN}"`);
  }
  // VARIOUS is not proof that something is a car part. Require identifiable
  // component names for general/unknown fitment, rather than workshop supplies.
  return scoped.or(`model_name.not.imatch."${GENERAL_MODEL_PATTERN}",and(name.imatch."${CAR_PART_NAME_PATTERN}",or(sku.is.null,sku.not.imatch."${SERVICE_TOOL_SKU_PATTERN}"))`);
}

export async function getActiveEstimatePricelist(client) {
  const { data, error } = await client.schema('catalog').from('pricelist_versions')
    .select('id').eq('price_type', 'retail').eq('is_active', true).maybeSingle();
  if (error) throw error;
  return { versionId: data?.id ?? null };
}
