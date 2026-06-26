export function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function normalizePhone(value) {
  const digits = onlyDigits(value);

  if (!digits) return '';
  if (digits.startsWith('55')) return digits;

  return `55${digits}`;
}

export function formatPhone(value) {
  const digits = normalizePhone(value);

  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }

  if (digits.length === 12) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }

  return digits || '-';
}
