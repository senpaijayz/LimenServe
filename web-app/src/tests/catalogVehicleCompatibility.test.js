import { describe, expect, it } from 'vitest';
import { catalogProductMatchesVehicle, getVehicleModelAliases } from '../services/catalogApi';

describe('catalog vehicle compatibility', () => {
  it('maps current public model names to the pricelist model families', () => {
    expect(getVehicleModelAliases('Montero Sport')).toEqual(expect.arrayContaining(['montero qx', 'montero']));
    expect(getVehicleModelAliases('Xpander Cross')).toEqual(expect.arrayContaining(['xpander']));
    expect(getVehicleModelAliases('Mirage Hatchback')).toEqual(expect.arrayContaining(['mirage hb']));
    expect(getVehicleModelAliases('Outlander Sport')).toEqual(expect.arrayContaining(['asx', 'outlander']));
  });

  it('matches current model years against PRESENT ranges in the pricelist', () => {
    expect(catalogProductMatchesVehicle({ model: 'MONTERO QX (2015-PRESENT)' }, 'Montero Sport', '2026')).toBe(true);
    expect(catalogProductMatchesVehicle({ model: 'XPANDER (2017-PRESENT)' }, 'Xpander Cross', '2026')).toBe(true);
    expect(catalogProductMatchesVehicle({ model: 'XFORCE (2024-PRESENT)' }, 'Xforce', '2026')).toBe(true);
    expect(catalogProductMatchesVehicle({ model: 'TRITON (2023-PRESENT)' }, 'Triton', '2026')).toBe(true);
  });

  it('does not match unrelated vehicle families', () => {
    expect(catalogProductMatchesVehicle({ model: 'XPANDER (2017-PRESENT)' }, 'Montero Sport', '2026')).toBe(false);
    expect(catalogProductMatchesVehicle({ model: 'MIRAGE HB (2012-PRESENT)' }, 'Triton', '2026')).toBe(false);
  });
});
