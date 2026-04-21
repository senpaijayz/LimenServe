import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import inventoryClassifier from '../../../scripts/lib/inventory-classifier.cjs';

const { classifyInventoryItem, OPERATIONAL_CATEGORIES } = inventoryClassifier;

describe('inventory classifier', () => {
  const cases = [
    [{ sku: '4605B806', name: 'PAD SET,RR BRAKE' }, 'Brakes & Suspension'],
    [{ sku: '8651A247XA', name: 'SENSOR,CORNER CLEARANCE' }, 'Electrical & Sensors'],
    [{ sku: 'MZ691066', name: 'CABIN AIR FILTER' }, 'Filters & Fluids'],
    [{ sku: '1822A085', name: 'SPARK PLUG' }, 'Ignition & Engine Components'],
    [{ sku: '1370A665', name: 'HOSE,RADIATOR,UPR' }, 'Cooling System'],
    [{ sku: '2528A234', name: 'GEAR,M/T INPUT SHAFT 5TH' }, 'Transmission & Drivetrain'],
    [{ sku: '5713A518', name: 'SCREW,FR DOOR WINDOW RGLTR' }, 'Body & Interior'],
    [{ sku: 'BL000002', name: 'NUTS AND BOLTS' }, 'General Parts & Accessories'],
    [{ sku: 'TIR-AT-265', name: 'ALL-TERRAIN TIRE 265/70R17' }, 'Wheels & Tires'],
  ];

  it.each(cases)('classifies %o as %s', (input, expectedCategory) => {
    const result = classifyInventoryItem(input);
    expect(result.category).toBe(expectedCategory);
  });

  it('preserves a legacy source category when mapping to operational groups', () => {
    const result = classifyInventoryItem({
      sku: 'ZZ001',
      name: 'UNSPECIFIED ITEM',
      category: 'Lighting',
    });

    expect(result.category).toBe('Electrical & Sensors');
    expect(result.sourceCategory).toBe('Lighting');
    expect(result.trace.strategy).toBe('legacy_category');
  });

  it('covers the expected operational category set in the generated import summary', () => {
    const summaryPath = path.resolve(process.cwd(), '..', 'Pricelist', 'generated', 'normalized_pricelist_summary.json');
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    const categoryDistribution = summary.categoryDistribution ?? {};
    const populatedCategories = Object.keys(categoryDistribution);

    expect(populatedCategories.length).toBeGreaterThanOrEqual(6);
    expect(populatedCategories.every((category) => OPERATIONAL_CATEGORIES.includes(category))).toBe(true);
    expect(Math.max(...Object.values(categoryDistribution))).toBeLessThan(summary.importedRows);
    expect(summary.fallbackCount).toBeLessThan(summary.importedRows);
  });
});
