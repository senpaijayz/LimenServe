import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { applyEstimatePricelistScope, getActiveEstimatePricelist, isEstimatePricelistPart, NON_PART_NAME_PATTERN, NON_PART_LABEL_PATTERN, GENERAL_MODEL_PATTERN, CAR_PART_NAME_PATTERN, SERVICE_TOOL_SKU_PATTERN } from './estimatePricelistScope.js';

test('excludes merchandise and workshop supplies while retaining car components', () => {
  for (const name of ['2024 AXCR T-SHIRT SIZE 2XL', 'T SHIRT SIZE M', '2024 POLO SHIRT (BLACK)', '2024 RALLIART SPORT UMBREL', '2024 AXCR FOLDABLE UMBRELL', 'TUMBLER', 'LANYARD']) {
    assert.equal(isEstimatePricelistPart({ name, price: 100, model_name: 'VARIOUS' }), false, name);
  }
  for (const label of ['MERCHANDIZE', 'MERCHANDISE', 'Apparel', 'Collaterals', 'Tools', 'Manuals']) {
    for (const field of ['model_name', 'category', 'source_category']) {
      assert.equal(isEstimatePricelistPart({ name: 'Promotional item', price: 100, [field]: label }), false, field + label);
    }
  }
  for (const name of ['CAP ASSY,RADIATOR', 'WATER JACKET', 'MANUAL TRANSMISSION', 'INSTRUMENT CLUSTER', 'OIL FILTER', 'BRAKE PAD', 'BOLT,ABS CONTROL EQUIP', 'SEAT BELT', 'AIR CLEANER HOUSING']) {
    assert.equal(isEstimatePricelistPart({ name, price: 100, model_name: 'VARIOUS', category: null }), true, name);
  }
  assert.equal(isEstimatePricelistPart({ name: 'Oil filter', price: 0 }), false);
});

test('removes paint, tools, and unidentifiable VARIOUS entries without banning automotive sockets or tool-box covers', () => {
  for (const name of ['#1500 RIKEN CP38 (SANDPAPER)', '2K ELASTIC ADDITIVE', '3M PERFECT-IT FOAM POLISHING PAD GLAZE(B', 'ACRYLIC THINNER', 'WRENCH,OIL FILTER', 'INSTALLER,BEARING', 'A,REMOVER,GARNISH', 'BRAKE TOOL SET', 'DRIVE SOCKET 10MM', 'UNIDENTIFIED ITEM', 'ENGINE OIL 4L', 'SANDING MAT\'L MIRKA OSP 1', 'AUTOSURFACER RAPID LIGHT GREY', 'ATF, TRANSMISSION OIL SP III', 'SUPER HYPOID GEAR OIL', 'BRAKE FLUID']) {
    assert.equal(isEstimatePricelistPart({ name, price: 100, model_name: 'VARIOUS' }), false, name);
  }
  assert.equal(isEstimatePricelistPart({ name: 'ACTIVATOR WB', price: 100, model_name: 'PAINT MATERIAL' }), false);
  assert.equal(isEstimatePricelistPart({ name: 'SOCKET,LAMP', price: 100, model_name: 'L300' }), true);
  assert.equal(isEstimatePricelistPart({ name: 'COVER,TOOL BOX', price: 100, model_name: 'L300' }), true);
  assert.equal(isEstimatePricelistPart({ name: 'Oil filter', price: 100, model_name: null }), true);
  assert.equal(isEstimatePricelistPart({ name: 'Unidentified item', price: 100, model_name: null }), false);
  assert.equal(isEstimatePricelistPart({ name: 'BRAKE FLUID RESERVOIR', price: 100, model_name: 'VARIOUS' }), true);
  assert.equal(isEstimatePricelistPart({ sku: 'MB992190', name: 'ADAPTER SET, RAD CAP', price: 100, model_name: 'VARIOUS' }), false);
  assert.equal(isEstimatePricelistPart({ sku: 'MD998332V', name: 'HOSE ADAPTOR', price: 100, model_name: 'VARIOUS' }), false);
  assert.equal(isEstimatePricelistPart({ sku: 'MD997110', name: 'GASKET KIT', price: 100, model_name: 'L300' }), true);
  assert.equal(isEstimatePricelistPart({ name: 'PUMP,PRIMER', price: 100, model_name: 'L300' }), true);
  assert.equal(isEstimatePricelistPart({ name: 'KOS KEY CASE', price: 100, model_name: 'VARIOUS' }), false);
  assert.equal(isEstimatePricelistPart({ name: 'TIRE PANDO C', price: 100, model_name: 'VARIOUS' }), false);
  assert.equal(isEstimatePricelistPart({ name: '20MY L300 WORKSHOP MANUAL', price: 4081, model_name: 'L300' }), false);
  assert.equal(isEstimatePricelistPart({ name: 'MANUAL TRANSMISSION', price: 100, model_name: 'L300' }), true);
});

test('sends active version and merchandise filters to the database before pagination and counting', async () => {
  let requested;
  const client = createClient('https://example.supabase.co', 'test-only-key', { global: {
    fetch: async (url) => { requested = new URL(url); return new Response('[]', { status: 200, headers: { 'Content-Range': '0-0/0', 'Content-Type': 'application/json' } }); },
  }, auth: { persistSession: false } });
  const result = await applyEstimatePricelistScope(client.schema('catalog').from('pricelist_import_staging').select('sku,name', { count: 'exact' }), 'active-version').order('name').range(0, 7);
  assert.equal(result.error, null);
  assert.equal(requested.searchParams.get('pricelist_version_id'), 'eq.active-version');
  assert.equal(requested.searchParams.get('price'), 'gt.0');
  assert.equal(requested.searchParams.get('name'), `not.imatch.${NON_PART_NAME_PATTERN}`);
  for (const field of ['model_name', 'category', 'source_category']) {
    assert.ok(requested.searchParams.getAll('or').includes(`(${field}.is.null,${field}.not.imatch."${NON_PART_LABEL_PATTERN}")`));
  }
  assert.ok(requested.searchParams.getAll('or').includes(`(model_name.not.imatch."${GENERAL_MODEL_PATTERN}",and(name.imatch."${CAR_PART_NAME_PATTERN}",or(sku.is.null,sku.not.imatch."${SERVICE_TOOL_SKU_PATTERN}")))`));
  assert.equal(requested.searchParams.get('limit'), '8');
  assert.throws(() => applyEstimatePricelistScope(null, null), /active price list/);
});

test('no active pricelist is empty and lookup errors are not replaced by unrelated inventory', async () => {
  const client = (result) => ({ schema: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }) }) }) });
  assert.deepEqual(await getActiveEstimatePricelist(client({ data: null, error: null })), { versionId: null });
  const error = new Error('Price list unavailable');
  await assert.rejects(getActiveEstimatePricelist(client({ error })), /Price list unavailable/);
});

test('estimate route does not fall back to the full inventory when vehicle results are empty', async () => {
  const source = await readFile(new URL('../routes/catalogRoutes.js', import.meta.url), 'utf8');
  assert.ok(source.includes("const estimateOnly = source === 'estimate'"));
  assert.ok(source.includes('!estimateOnly && scopedProducts.length === 0'));
  assert.ok(source.includes('if (estimateScope && !estimateScope.versionId)'));
});
