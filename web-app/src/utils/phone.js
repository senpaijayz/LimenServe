const PHONE_INPUT_PATTERN = /^[\d().\-\s]+$/;

export function sanitizePhilippineMobileInput(value) {
  return typeof value === 'string' ? value.replace(/\D/g, '').slice(0, 11) : '';
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
  return /^09\d{9}$/.test(digits) ? digits : null;
}
