export function splitUserName(fullName = '') {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return { firstName: parts[0] || '', lastName: '' };
  }

  // Older accounts stored only a full name. Four-part names are split evenly
  // so common two-word given names and surnames remain intact (e.g. Jay Iverson
  // / Dela Cruz). For other legacy names, keep the previous first-token split.
  if (parts.length === 4) {
    return {
      firstName: parts.slice(0, 2).join(' '),
      lastName: parts.slice(2).join(' '),
    };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

export function getUserNameFields(authUser, profile = null) {
  const fullName = authUser?.user_metadata?.full_name || profile?.full_name || '';
  const fallback = splitUserName(fullName);

  return {
    firstName: String(authUser?.user_metadata?.first_name ?? authUser?.user_metadata?.firstName ?? fallback.firstName).trim(),
    lastName: String(authUser?.user_metadata?.last_name ?? authUser?.user_metadata?.lastName ?? fallback.lastName).trim(),
    fullName,
  };
}
