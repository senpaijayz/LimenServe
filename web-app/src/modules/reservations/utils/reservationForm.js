export function validateReservationForm(form) {
  const errors = {};
  if (form.customerName.trim().length < 2) errors.customerName = 'Enter the customer’s name using at least 2 characters.';
  const phone = form.customerPhone.trim();
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0063')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('63')) digits = `0${digits.slice(2)}`;
  if (phone.length > 32 || !/^[+\d\s().-]+$/.test(phone) || !/^0\d{9,10}$/.test(digits)) errors.customerPhone = 'Enter a valid phone number, such as 0917 123 4567.';
  const email = form.customerEmail.trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.customerEmail = 'Check the email address, or leave it blank.';
  if (!form.items.length) errors.items = 'Choose at least one part from the search results below.';
  for (const item of form.items) {
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) errors[`quantity-${item.productId}`] = 'Use a whole number from 1 to 999.';
  }
  return errors;
}
