import { describe, expect, it } from 'vitest';
import { normalizePhilippinePhoneNumber } from './phone';

describe('normalizePhilippinePhoneNumber', () => {
  it('normalizes supported local and country-code formats', () => {
    expect(normalizePhilippinePhoneNumber('0917 123 4567')).toBe('09171234567');
    expect(normalizePhilippinePhoneNumber('+63 (917) 123-4567')).toBe('09171234567');
    expect(normalizePhilippinePhoneNumber('0063 917 123 4567')).toBe('09171234567');
    expect(normalizePhilippinePhoneNumber('(02) 8123 4567')).toBe('0281234567');
  });

  it('rejects missing, foreign, alphabetic, and malformed values', () => {
    expect(normalizePhilippinePhoneNumber('')).toBeNull();
    expect(normalizePhilippinePhoneNumber('+1 555 123 4567')).toBeNull();
    expect(normalizePhilippinePhoneNumber('0917-CALL-NOW')).toBeNull();
    expect(normalizePhilippinePhoneNumber('123')).toBeNull();
  });
});
