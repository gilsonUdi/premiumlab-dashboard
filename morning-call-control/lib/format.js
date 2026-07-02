export function timestampToMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return null;
}

// Normaliza valores vindos do Firestore (Timestamp -> ISO string) para evitar
// erro ao renderizar objetos Timestamp diretamente no JSX. Nao remover.
export function normalizeFirestoreValue(value) {
  if (!value) return value;

  const timestampMillis = timestampToMillis(value);
  if (timestampMillis !== null) return new Date(timestampMillis).toISOString();

  if (Array.isArray(value)) return value.map(normalizeFirestoreValue);

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeFirestoreValue(item)])
    );
  }

  return value;
}

export function toDate(value) {
  if (!value) return null;

  let date;
  if (typeof value?.toDate === 'function') {
    date = value.toDate();
  } else if (typeof value?.toMillis === 'function') {
    date = new Date(value.toMillis());
  } else if (typeof value === 'object') {
    date = typeof value.seconds === 'number' ? new Date(value.seconds * 1000) : null;
  } else {
    date = new Date(value);
  }

  if (!date || Number.isNaN(date.getTime())) return null;
  return date;
}

export function dateValue(value) {
  const timestampMillis = timestampToMillis(value);
  if (timestampMillis !== null) return timestampMillis;
  if (!value) return 0;
  if (typeof value === 'object') return 0;

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function formatDate(value) {
  const date = toDate(value);
  if (!date) return '-';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function formatTime(value) {
  const date = toDate(value);
  if (!date) return '-';

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function formatReferenceDate(...values) {
  const value = values.find(item => item);
  if (!value) return '-';

  if (typeof value === 'string') {
    const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
    if (!/\d{4}-\d{2}-\d{2}T/.test(value)) return value;
  }

  const date = toDate(value);
  if (!date) return typeof value === 'string' ? value : '-';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

export function timeAgo(value) {
  const date = toDate(value);
  if (!date) return '';

  const diff = Date.now() - date.getTime();
  if (diff < 0) return 'agora';

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} d`;

  return formatReferenceDate(value);
}

export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(value) {
  const date = toDate(value);
  if (!date) return false;
  return isSameDay(date, new Date());
}

export function dayLabel(value) {
  const date = toDate(value);
  if (!date) return 'Sem data';

  const now = new Date();
  if (isSameDay(date, now)) return 'Hoje';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Ontem';

  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  }).format(date);
}

export function dayKey(value) {
  const date = toDate(value);
  if (!date) return 'sem-data';
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function initialsOf(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function digitsOf(value) {
  return String(value || '').replace(/\D/g, '');
}

function phoneVariants(...values) {
  const variants = new Set();

  values.forEach(value => {
    const raw = String(value || '');
    const digits = digitsOf(raw);

    if (raw) variants.add(raw);
    if (!digits) return;

    variants.add(digits);
    variants.add(`${digits}@s.whatsapp.net`);

    if (!digits.startsWith('55')) {
      variants.add(`55${digits}`);
      variants.add(`55${digits}@s.whatsapp.net`);
    }

    if (digits.startsWith('55') && digits.length === 13 && digits[4] === '9') {
      const withoutMobileNine = `${digits.slice(0, 4)}${digits.slice(5)}`;
      variants.add(withoutMobileNine);
      variants.add(`${withoutMobileNine}@s.whatsapp.net`);
    }
  });

  return variants;
}

export function matchExecutionToContact(execution, contact) {
  const contactId = String(contact.id || '');
  const executionContactId = String(execution.contactId || '');
  const contactValues = phoneVariants(contact.phone, contact.whatsappId);
  const executionValues = phoneVariants(
    execution.phone,
    execution.whatsappId,
    execution.raw?.data?.key?.remoteJidAlt,
    execution.raw?.data?.key?.remoteJid,
    execution.raw?.data?.key?.participant
  );

  return (
    (contactId && executionContactId === contactId) ||
    Array.from(contactValues).some(value => executionValues.has(value))
  );
}
