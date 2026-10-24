import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyVehiclePackagePart, hasRequiredVehiclePackageParts, isVehiclePackagePartFit } from './vehiclePackageEligibility.js';

test('vehicle package parts exclude tools, lookalikes, and placeholder prices', () => {
  assert.equal(classifyVehiclePackagePart({ name: 'WRENCH,OIL FILTER', price: 336 }), null);
  assert.equal(classifyVehiclePackagePart({ name: 'ADAPTER,HOSE', price: 1000 }), null);
  assert.equal(classifyVehiclePackagePart({ name: 'PULLEY,P/S OIL PUMP IDLER', price: 0.01 }), null);
  assert.equal(classifyVehiclePackagePart({ name: 'FILTER,OIL A/T VALVE BODY', price: 500 }), null);
  assert.deepEqual(classifyVehiclePackagePart({ name: 'OIL FILTER', price: 981 }), { partFunction: 'oil_filter', serviceGroup: 'oil_change' });
  assert.deepEqual(classifyVehiclePackagePart({ name: 'Engine Oil CJ-4 5W-30 Full Synthetic', price: 630 }), { partFunction: 'engine_oil', serviceGroup: 'oil_change' });
});

test('a package requires its real core components and vehicle fitment', () => {
  assert.equal(hasRequiredVehiclePackageParts('oil_change', ['engine_oil']), false);
  assert.equal(hasRequiredVehiclePackageParts('oil_change', ['engine_oil', 'oil_filter']), true);
  assert.equal(isVehiclePackagePartFit({ model: 'MONTERO CR45' }, 'Montero Sport', 'oil_filter'), false);
  assert.equal(isVehiclePackagePartFit({ model: 'MONTERO SPORT (QX)' }, 'Montero Sport', 'oil_filter'), true);
  assert.equal(isVehiclePackagePartFit({ model: 'VARIOUS' }, 'Montero Sport', 'oil_filter'), false);
  assert.equal(isVehiclePackagePartFit({ model: 'VARIOUS' }, 'Montero Sport', 'engine_oil'), true);
});
