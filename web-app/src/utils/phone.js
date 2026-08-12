const PHONE_INPUT_PATTERN = /^[+\d().\-\s]+$/;

export function normalizePhilippinePhoneNumber(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const input = value.trim();
  if (!input || input.length > 32 || !PHONE_INPUT_PATTERN.test(input)) {
    return null;
  }

  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('0063')) {
    digits = `0${digits.slice(4)}`;
  } else if (digits.startsWith('63')) {
    digits = `0${digits.slice(2)}`;
  }

  return /^0\d{9,10}$/.test(digits) ? digits : null;
}
