const DEFAULT_INSTANCE = 'Morning Call';

function cleanUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function evolutionConfig() {
  const baseUrl = cleanUrl(
    process.env.EVOLUTION_BASE_URL ||
      process.env.EVOLUTION_API_URL ||
      process.env.NEXT_PUBLIC_EVOLUTION_BASE_URL
  );
  const apiKey = process.env.EVOLUTION_API_KEY || process.env.EVOLUTION_GLOBAL_API_KEY || '';
  const instance =
    process.env.EVOLUTION_INSTANCE_NAME ||
    process.env.EVOLUTION_INSTANCE ||
    process.env.NEXT_PUBLIC_EVOLUTION_INSTANCE ||
    DEFAULT_INSTANCE;

  if (!baseUrl || !apiKey) {
    throw new Error('Evolution API nao configurada. Defina EVOLUTION_BASE_URL e EVOLUTION_API_KEY.');
  }

  return { baseUrl, apiKey, instance };
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];

  const candidates = [
    value.messages,
    value.records,
    value.rows,
    value.items,
    value.chats,
    value.data,
    value.response,
    value.result,
    value.results
  ];

  for (const candidate of candidates) {
    const rows = asArray(candidate);
    if (rows.length) return rows;
  }

  return [];
}

function timestampToIso(value) {
  if (!value) return '';

  if (typeof value === 'number') {
    return new Date(value < 100000000000 ? value * 1000 : value).toISOString();
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  }

  if (typeof value === 'object') {
    if (typeof value.low === 'number') return new Date(value.low * 1000).toISOString();
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  }

  return '';
}

function textFromMessage(message, messageType) {
  if (!message || typeof message !== 'object') return '';

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.buttonsResponseMessage?.selectedButtonId ||
    message.listResponseMessage?.title ||
    message.listResponseMessage?.singleSelectReply?.selectedRowId ||
    message.templateButtonReplyMessage?.selectedDisplayText ||
    message.templateButtonReplyMessage?.selectedId ||
    message.interactiveResponseMessage?.body?.text ||
    message.pollCreationMessage?.name ||
    (messageType ? `[${messageType}]` : '')
  );
}

function messageTypeOf(row) {
  if (row.messageType) return row.messageType;
  const message = row.message || row.messages?.message || {};
  return Object.keys(message).find(key => key.endsWith('Message')) || '';
}

function normalizeMessage(row, index) {
  const key = row.key || row.messages?.key || {};
  const message = row.message || row.messages?.message || {};
  const messageType = messageTypeOf(row);
  const remoteJid = key.remoteJid || row.remoteJid || row.keyId?.remoteJid || '';
  const remoteJidAlt = key.remoteJidAlt || row.remoteJidAlt || '';
  const participant = key.participant || row.participant || '';
  const fromMe = Boolean(key.fromMe ?? row.fromMe);
  const timestamp =
    row.messageTimestamp ||
    row.timestamp ||
    row.createdAt ||
    row.updatedAt ||
    row.date_time ||
    row.datetime ||
    row.time;

  return {
    id: key.id || row.id || row.messageId || `${remoteJid || 'message'}-${index}`,
    remoteJid,
    remoteJidAlt,
    participant,
    fromMe,
    pushName: row.pushName || row.name || '',
    status: row.status || '',
    messageType,
    text: textFromMessage(message, messageType),
    timestamp: timestampToIso(timestamp),
    raw: row
  };
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function jidCandidates({ remoteJid, whatsappId, phone }) {
  const values = new Set();

  [remoteJid, whatsappId].filter(Boolean).forEach(value => values.add(String(value)));

  const phoneDigits = digits(phone || remoteJid || whatsappId);
  if (phoneDigits) {
    values.add(phoneDigits);
    values.add(`${phoneDigits}@s.whatsapp.net`);
    if (!phoneDigits.startsWith('55')) values.add(`55${phoneDigits}@s.whatsapp.net`);
  }

  return values;
}

function matchesConversation(message, candidates) {
  if (!candidates.size) return true;

  const values = [
    message.remoteJid,
    message.remoteJidAlt,
    message.participant,
    digits(message.remoteJid),
    digits(message.remoteJidAlt),
    digits(message.participant)
  ].filter(Boolean);

  return values.some(value => candidates.has(value));
}

async function evolutionFetch(path, { method = 'POST', body } = {}) {
  const { baseUrl, apiKey } = evolutionConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      apikey: apiKey,
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store'
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data?.response?.message || data?.message || text || response.statusText;
    throw new Error(`Evolution API respondeu ${response.status}: ${message}`);
  }

  return data;
}

async function tryRequests(requests) {
  const errors = [];

  for (const request of requests) {
    try {
      return {
        data: await evolutionFetch(request.path, request),
        endpoint: `${request.method || 'POST'} ${request.path}`
      };
    } catch (error) {
      errors.push(error.message);
    }
  }

  throw new Error(errors[0] || 'Nao foi possivel consultar a Evolution API.');
}

export async function findEvolutionMessages({ remoteJid, whatsappId, phone, limit = 120 }) {
  const { instance } = evolutionConfig();
  const safeLimit = Math.min(Math.max(Number(limit) || 120, 1), 300);
  const queryJid = remoteJid || whatsappId || (phone ? `${digits(phone)}@s.whatsapp.net` : '');
  const encodedInstance = encodeURIComponent(instance);
  const encodedJid = encodeURIComponent(queryJid);
  const bodies = [
    { where: { key: { remoteJid: queryJid } }, limit: safeLimit },
    { where: { remoteJid: queryJid }, limit: safeLimit },
    { remoteJid: queryJid, limit: safeLimit },
    { jid: queryJid, limit: safeLimit }
  ];
  const prefixes = ['/chat/findMessages', '/message/findMessages', '/messages/findMessages'];
  const requests = prefixes.flatMap(prefix => [
    ...bodies.map(body => ({ path: `${prefix}/${encodedInstance}`, method: 'POST', body })),
    {
      path: `${prefix}/${encodedInstance}?remoteJid=${encodedJid}&limit=${safeLimit}`,
      method: 'GET'
    }
  ]);

  const result = await tryRequests(requests);
  const candidates = jidCandidates({ remoteJid, whatsappId, phone });
  const rows = asArray(result.data)
    .map(normalizeMessage)
    .filter(message => message.text || message.messageType)
    .filter(message => matchesConversation(message, candidates))
    .sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return aTime - bTime;
    });

  return {
    source: 'evolution',
    endpoint: result.endpoint,
    messages: rows
  };
}

export async function findEvolutionChats({ limit = 100 } = {}) {
  const { instance } = evolutionConfig();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 300);
  const encodedInstance = encodeURIComponent(instance);
  const result = await tryRequests([
    { path: `/chat/findChats/${encodedInstance}`, method: 'POST', body: { limit: safeLimit } },
    { path: `/chat/findChats/${encodedInstance}`, method: 'GET' },
    { path: `/chat/findChats/${encodedInstance}?limit=${safeLimit}`, method: 'GET' }
  ]);

  return {
    source: 'evolution',
    endpoint: result.endpoint,
    chats: asArray(result.data)
  };
}
