import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import inventoryClassifier from '../../../scripts/lib/inventory-classifier.cjs';

const { classifyInventoryItem } = inventoryClassifier;
const fixtures = [
  ['PULLEY,P/S OIL PUMP IDLER', 'Brakes & Suspension'],
  ['BELT,ALTERNATOR & OTHER', 'Engine & Ignition'],
  ['TENSIONER,ALTNTR BELT AUTO', 'Engine & Ignition'],
  ['PULLEY,CRANKSHAFT', 'Engine & Ignition'],
  ['TIMING BELT', 'Engine & Ignition'],
  ['PUMP,FUEL', 'Engine & Ignition'],
  ['MUFF FINISHER FULL STAINLESS', 'Engine & Ignition'],
  ['LATCH ASSY', 'Body & Exterior'],
  ['LATCH,TAILGATE', 'Body & Exterior'],
  ['HOOD INSECT PROTECTOR', 'Body & Exterior'],
  ['MOLDING FR BUMPER LH', 'Body & Exterior'],
  ['REAR BUMPER GARNISH', 'Body & Exterior'],
  ['SIDE MIRROR CHROME COVER W/LED', 'Body & Exterior'],
  ['AIR CLEANER HOUSING', 'Filters & Fluids'],
  ['AIR FILTER', 'Filters & Fluids'],
  ['OIL FILTER', 'Filters & Fluids'],
  ['BRAKE FLUID DOT 4', 'Filters & Fluids'],
  ['ATF, TRANSMISSION OIL SP III', 'Filters & Fluids'],
  ['THERMOSTAT', 'Cooling & A/C'],
  ['CAP ASSY,RADIATOR', 'Cooling & A/C'],
  ['PULLEY,A/C COMPRESSOR', 'Cooling & A/C'],
  ['COOLANT RESERVOIR', 'Cooling & A/C'],
  ['SEAT BELT', 'Interior & Trim'],
  ['BELT,SEAT', 'Interior & Trim'],
  ['LATCH,SEAT', 'Interior & Trim'],
  ['CARGO TRAY (5 SEATS) BIG', 'Interior & Trim'],
  ['RUBBER FLOOR MAT', 'Interior & Trim'],
  ['MIRROR ASSY,ROOM', 'Interior & Trim'],
  ['BOLT,ABS CONTROL EQUIP', 'Hardware & Fasteners'],
  ['BRAKE LIGHT SWITCH', 'Electrical & Lighting'],
  ['HARNESS,DOOR', 'Electrical & Lighting'],
  ['CAPACITOR', 'Electrical & Lighting'],
  ['DISC KIT,A/T 2ND BRAKE', 'Transmission & Drivetrain'],
  ['CVT DRIVE BELT', 'Transmission & Drivetrain'],
  ['MANUAL TRANSMISSION ASSY', 'Transmission & Drivetrain'],
  ['GEAR COMPL, STRG MANUAL', 'Brakes & Suspension'],
  ['BRAKE FLUID RESERVOIR', 'Brakes & Suspension'],
  ['WRENCH,OIL FILTER', 'Tools & Consumables'],
  ['BRAKE CLEANER', 'Tools & Consumables'],
  ['UNKNOWN PART', 'General Parts & Accessories'],
  ['PMS KIT NO. 10 (6)', 'General Parts & Accessories'],
];

test('classifies specific components without guessing generic kit contents', () => {
  for (const [name, expected] of fixtures) {
    assert.equal(classifyInventoryItem({ name, model_name: 'VARIOUS' }).category, expected, name);
  }
});

test('uses token boundaries and does not let model or previous fallback labels determine specific context', () => {
  assert.equal(classifyInventoryItem({ name: 'UNKNOWN PART', model_name: 'MONTERO', sourceCategory: 'General Parts & Accessories' }).category, 'General Parts & Accessories');
  assert.notEqual(classifyInventoryItem({ name: 'SPINDLE' }).category, 'Hardware & Fasteners');
  assert.equal(classifyInventoryItem({ name: 'LATCH ASSY', category: 'General Parts & Accessories' }).trace.strategy, 'part_context');
});

test('frontend and backend classification remain identical', async () => {
  const source = await readFile(new URL('../../../web-app/src/lib/inventoryClassifier.js', import.meta.url), 'utf8');
  const frontend = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  assert.equal(frontend.CLASSIFIER_VERSION, inventoryClassifier.CLASSIFIER_VERSION);
  for (const [name] of fixtures) {
    const item = { name, model_name: 'VARIOUS' };
    assert.deepEqual(frontend.classifyInventoryItem(item), classifyInventoryItem(item), name);
  }
});
