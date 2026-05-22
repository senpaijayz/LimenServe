import { describe, expect, it } from 'vitest';
import inventoryClassifier from '../lib/inventoryClassifier';

const { classifyInventoryItem, OPERATIONAL_CATEGORIES } = inventoryClassifier;

describe('inventory classifier', () => {
  const cases = [
    [{ sku: '4605B806', name: 'PAD SET,RR BRAKE' }, 'Brakes & Suspension'],
    [{ sku: '8651A247XA', name: 'SENSOR,CORNER CLEARANCE' }, 'Electrical & Lighting'],
    [{ sku: 'MZ691066', name: 'CABIN AIR FILTER' }, 'Filters & Fluids'],
    [{ sku: '1822A085', name: 'SPARK PLUG' }, 'Engine & Ignition'],
    [{ sku: '1370A665', name: 'HOSE,RADIATOR,UPR' }, 'Cooling & A/C'],
    [{ sku: '2528A234', name: 'GEAR,M/T INPUT SHAFT 5TH' }, 'Transmission & Drivetrain'],
    [{ sku: '5713A518', name: 'SCREW,FR DOOR WINDOW RGLTR' }, 'Body & Exterior'],
    [{ sku: 'BL000002', name: 'NUTS AND BOLTS' }, 'General Parts & Accessories'],
    [{ sku: '3880A103', name: 'NUT,WHEEL' }, 'Hardware & Fasteners'],
    [{ sku: '48429A001P', name: 'BEZEL,STEERING WHEEL' }, 'Interior & Trim'],
    [{ sku: 'DP010374', name: '#1500 RIKEN CP38 (SANDPAPER)' }, 'Tools & Consumables'],
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

    expect(result.category).toBe('Electrical & Lighting');
    expect(result.sourceCategory).toBe('Lighting');
    expect(result.trace.strategy).toBe('legacy_category');
  });

  it('exposes the expected operational category set without tire retail categories', () => {
    expect(OPERATIONAL_CATEGORIES).toEqual([
      'Brakes & Suspension',
      'Electrical & Lighting',
      'Filters & Fluids',
      'Engine & Ignition',
      'Cooling & A/C',
      'Transmission & Drivetrain',
      'Body & Exterior',
      'Interior & Trim',
      'Hardware & Fasteners',
      'Tools & Consumables',
      'General Parts & Accessories',
    ]);
    expect(OPERATIONAL_CATEGORIES).not.toContain('Wheels & Tires');
    expect(OPERATIONAL_CATEGORIES).not.toContain('Tires & Wheels');
  });
});
