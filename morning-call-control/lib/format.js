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

export function matchExecutionToContact(execution, contact) {
  const contactId = String(contact.id || '');
  const contactPhone = String(contact.phone || '');
  const contactWhatsappId = String(contact.whatsappId || '');
  const executionContactId = String(execution.contactId || '');
  const executionPhone = String(execution.phone || '');
  const executionWhatsappId = String(execution.whatsappId || '');

  return (
    (contactId && executionContactId === contactId) ||
    (contactPhone && executionPhone === contactPhone) ||
    (contactWhatsappId && executionWhatsappId === contactWhatsappId)
  );
}
