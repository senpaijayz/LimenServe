const PHONE_INPUT_PATTERN = /^\+?[\d().\-\s]+$/;

export function sanitizePhilippineMobileInput(value) {
  if (typeof value !== 'string') return '';
  const input = value.trim();
  const digits = input.replace(/\D/g, '');

  // Keep a country-code prefix intact while the user is still typing. It is
  // normalized to the local 09 format when the field loses focus or saves.
  if (input.startsWith('+') && digits.startsWith('63')) {
    return `+63${digits.slice(2, 12)}`;
  }
  if (digits.startsWith('63') && digits.length > 2) {
    return digits.slice(0, 12);
  }
  if (digits.startsWith('9')) return `0${digits.slice(0, 10)}`;
  return digits.slice(0, 11);
}

export function normalizePhilippinePhoneNumber(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const input = value.trim();
  if (!input || input.length > 32 || !PHONE_INPUT_PATTERN.test(input)) {
    return null;
  }

  const digits = input.replace(/\D/g, '');
  if (/^09\d{9}$/.test(digits)) return digits;
  if (/^639\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  return null;
}
