import { describe, expect, it } from 'vitest';
import { normalizePhilippinePhoneNumber, sanitizePhilippineMobileInput } from './phone';

describe('normalizePhilippinePhoneNumber', () => {
  it('accepts only 11-digit Philippine mobile numbers beginning with 09', () => {
    expect(normalizePhilippinePhoneNumber('0917 123 4567')).toBe('09171234567');
    expect(normalizePhilippinePhoneNumber('09171234567')).toBe('09171234567');
    expect(normalizePhilippinePhoneNumber('+63 (917) 123-4567')).toBe('09171234567');
    expect(normalizePhilippinePhoneNumber('639171234567')).toBe('09171234567');
    expect(normalizePhilippinePhoneNumber('0063 917 123 4567')).toBeNull();
    expect(normalizePhilippinePhoneNumber('(02) 8123 4567')).toBeNull();
  });

  it('rejects missing, wrong-prefix, short, long, alphabetic, and malformed values', () => {
    expect(normalizePhilippinePhoneNumber('')).toBeNull();
    expect(normalizePhilippinePhoneNumber('+1 555 123 4567')).toBeNull();
    expect(normalizePhilippinePhoneNumber('0917-CALL-NOW')).toBeNull();
    expect(normalizePhilippinePhoneNumber('123')).toBeNull();
    expect(normalizePhilippinePhoneNumber('19171234567')).toBeNull();
    expect(normalizePhilippinePhoneNumber('0917123456')).toBeNull();
    expect(normalizePhilippinePhoneNumber('091712345678')).toBeNull();
  });

  it('keeps local entry at 11 digits and accepts a country code while typing', () => {
    expect(sanitizePhilippineMobileInput('09 17-123 4567')).toBe('09171234567');
    expect(sanitizePhilippineMobileInput('+63 (917) 123-4567')).toBe('+639171234567');
    expect(sanitizePhilippineMobileInput('+639')).toBe('+639');
    expect(sanitizePhilippineMobileInput('639171234567')).toBe('639171234567');
    expect(sanitizePhilippineMobileInput('9171234567')).toBe('09171234567');
    expect(sanitizePhilippineMobileInput('1917123456789')).toBe('19171234567');
  });
});
