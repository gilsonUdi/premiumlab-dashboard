import QRCode from 'qrcode';

const DEFAULT_INSTANCE = 'Morning Call';

function cleanUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function evolutionConfig(override = {}) {
  const strict = Boolean(override.strict);
  const baseUrl = cleanUrl(
    override.baseUrl ||
      override.evolutionBaseUrl ||
      (!strict
        ? process.env.EVOLUTION_BASE_URL ||
          process.env.EVOLUTION_API_URL ||
          process.env.NEXT_PUBLIC_EVOLUTION_BASE_URL
        : '')
  );
  const apiKey =
    override.apiKey ||
    override.evolutionApiKey ||
    (!strict ? process.env.EVOLUTION_API_KEY || process.env.EVOLUTION_GLOBAL_API_KEY || '' : '');
  const instance =
    override.instance ||
    override.evolutionInstance ||
    (!strict
      ? process.env.EVOLUTION_INSTANCE_NAME ||
        process.env.EVOLUTION_INSTANCE ||
        process.env.NEXT_PUBLIC_EVOLUTION_INSTANCE ||
        DEFAULT_INSTANCE
      : '');

  if (!baseUrl || !apiKey || !instance) {
    throw new Error(
      'Evolution API nao configurada. Informe URL, instancia e API key da empresa.'
    );
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

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const rows = [];

  items.forEach(item => {
    const key = keyFn(item);
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(item);
  });

  return rows;
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

function toBoolean(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined) return false;

  const text = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'sim'].includes(text)) return true;
  if (['false', '0', 'no', 'nao', 'não', ''].includes(text)) return false;

  return Boolean(value);
}

function textFromMessage(message, messageType) {
  if (!message || typeof message !== 'object') return '';

  return (
    message.text ||
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.ephemeralMessage?.message?.conversation ||
    message.ephemeralMessage?.message?.extendedTextMessage?.text ||
    message.viewOnceMessage?.message?.conversation ||
    message.viewOnceMessage?.message?.extendedTextMessage?.text ||
    message.viewOnceMessageV2?.message?.conversation ||
    message.viewOnceMessageV2?.message?.extendedTextMessage?.text ||
    message.interactiveMessage?.body?.text ||
    message.viewOnceMessage?.message?.interactiveMessage?.body?.text ||
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
  const message = row.message?.message || row.message || row.messages?.message || row.data?.message || {};
  return Object.keys(message).find(key => key.endsWith('Message')) || '';
}

function normalizeMessage(row, index) {
  const key = row.key || row.message?.key || row.messages?.key || row.data?.key || {};
  const message =
    row.message?.message ||
    row.message ||
    row.messages?.message ||
    row.data?.message ||
    {};
  const messageType = messageTypeOf(row);
  const remoteJid = key.remoteJid || row.remoteJid || row.keyId?.remoteJid || row.data?.remoteJid || '';
  const remoteJidAlt = key.remoteJidAlt || row.remoteJidAlt || row.data?.remoteJidAlt || '';
  const participant = key.participant || row.participant || row.data?.participant || '';
  const fromMe = toBoolean(key.fromMe ?? row.fromMe);
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
    text: row.text || row.body || textFromMessage(message, messageType),
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

    if (phoneDigits.startsWith('55') && phoneDigits.length === 13 && phoneDigits[4] === '9') {
      const withoutMobileNine = `${phoneDigits.slice(0, 4)}${phoneDigits.slice(5)}`;
      values.add(withoutMobileNine);
      values.add(`${withoutMobileNine}@s.whatsapp.net`);
    }
  }

  return values;
}

function matchesConversation(message, candidates) {
  if (!candidates.size) return false;

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

function hasIncomingMessage(messages) {
  return messages.some(message => !message.fromMe);
}

async function evolutionFetch(path, { method = 'POST', body, config } = {}) {
  const { baseUrl, apiKey } = evolutionConfig(config);
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

function connectionStateFrom(data) {
  return String(
    data?.instance?.state ||
      data?.instance?.status ||
      data?.state ||
      data?.status ||
      data?.connectionState ||
      'close'
  ).toLowerCase();
}

function qrImageFrom(data) {
  const value =
    data?.base64 ||
    data?.qrcode?.base64 ||
    data?.qrCode?.base64 ||
    data?.qr?.base64 ||
    '';

  if (!value) return '';
  if (String(value).startsWith('data:image/')) return String(value);
  return `data:image/png;base64,${value}`;
}

export async function getEvolutionConnectionState({ evolutionConfig: config } = {}) {
  const { instance } = evolutionConfig(config);
  const encodedInstance = encodeURIComponent(instance);
  const data = await evolutionFetch(`/instance/connectionState/${encodedInstance}`, {
    method: 'GET',
    config
  });

  return {
    state: connectionStateFrom(data),
    connectedNumber:
      data?.instance?.ownerJid || data?.instance?.number || data?.ownerJid || data?.number || ''
  };
}

export async function getEvolutionConnectionQr({ evolutionConfig: config } = {}) {
  const { instance } = evolutionConfig(config);
  const encodedInstance = encodeURIComponent(instance);
  const data = await evolutionFetch(`/instance/connect/${encodedInstance}`, {
    method: 'GET',
    config
  });

  let qrCode = qrImageFrom(data);
  const rawCode = data?.code || data?.qrcode?.code || data?.qrCode?.code || '';

  if (!qrCode && rawCode) {
    qrCode = await QRCode.toDataURL(String(rawCode), {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 440,
      color: {
        dark: '#10120f',
        light: '#ffffff'
      }
    });
  }

  if (!qrCode) {
    throw new Error('A Evolution nao retornou um QR Code para esta instancia.');
  }

  return {
    state: connectionStateFrom(data),
    qrCode,
    count: Number(data?.count || 0)
  };
}

async function tryRequests(requests, config) {
  const errors = [];

  for (const request of requests) {
    try {
      return {
        data: await evolutionFetch(request.path, { ...request, config }),
        endpoint: `${request.method || 'POST'} ${request.path}`
      };
    } catch (error) {
      errors.push(error.message);
    }
  }

  throw new Error(errors[0] || 'Nao foi possivel consultar a Evolution API.');
}

async function collectMessagesFromRequests(requests, config) {
  const errors = [];
  const results = [];
  const endpoints = [];

  for (const request of requests) {
    try {
      const data = await evolutionFetch(request.path, { ...request, config });
      const rows = asArray(data);

      if (rows.length) {
        results.push(...rows);
        endpoints.push(`${request.method || 'POST'} ${request.path}`);
      }
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (!results.length && errors.length) {
    throw new Error(errors[0]);
  }

  return { rows: results, endpoints };
}

export async function findEvolutionMessages({
  remoteJid,
  whatsappId,
  phone,
  limit = 120,
  evolutionConfig: config
}) {
  const { instance } = evolutionConfig(config);
  const safeLimit = Math.min(Math.max(Number(limit) || 120, 1), 300);
  const candidates = jidCandidates({ remoteJid, whatsappId, phone });

  if (!candidates.size) {
    return {
      source: 'evolution',
      endpoint: '',
      messages: [],
      error: 'Informe telefone ou JID do contato para filtrar o historico.'
    };
  }

  const encodedInstance = encodeURIComponent(instance);
  const queryJids = Array.from(candidates).filter(value => String(value).includes('@'));
  const fallbackJid = remoteJid || whatsappId || (phone ? `${digits(phone)}@s.whatsapp.net` : '');
  if (fallbackJid && !queryJids.includes(fallbackJid)) queryJids.push(fallbackJid);

  const prefixes = ['/chat/findMessages', '/message/findMessages', '/messages/findMessages'];
  const requests = prefixes.flatMap(prefix =>
    queryJids.flatMap(queryJid => {
      const encodedJid = encodeURIComponent(queryJid);
      const bodies = [
        { where: { key: { remoteJid: queryJid } }, limit: safeLimit },
        { where: { key: { remoteJid: queryJid, fromMe: true } }, limit: safeLimit },
        { where: { key: { remoteJid: queryJid, fromMe: false } }, limit: safeLimit },
        { where: { remoteJid: queryJid }, limit: safeLimit },
        { remoteJid: queryJid, limit: safeLimit },
        { jid: queryJid, limit: safeLimit }
      ];

      return [
        ...bodies.map(body => ({ path: `${prefix}/${encodedInstance}`, method: 'POST', body })),
        {
          path: `${prefix}/${encodedInstance}?remoteJid=${encodedJid}&limit=${safeLimit}`,
          method: 'GET'
        }
      ];
    })
  );

  const broadRequests = prefixes.flatMap(prefix => [
    { path: `${prefix}/${encodedInstance}`, method: 'POST', body: { limit: safeLimit } },
    { path: `${prefix}/${encodedInstance}?limit=${safeLimit}`, method: 'GET' }
  ]);

  const result = await collectMessagesFromRequests(requests, config);
  let normalizedRows = uniqueBy(result.rows.map(normalizeMessage), message => message.id);
  let endpoints = [...result.endpoints];

  const filteredScopedRows = normalizedRows
    .filter(message => message.text || message.messageType)
    .filter(message => matchesConversation(message, candidates));

  if (!hasIncomingMessage(filteredScopedRows)) {
    try {
      const broadResult = await collectMessagesFromRequests(broadRequests, config);
      normalizedRows = uniqueBy(
        [...normalizedRows, ...broadResult.rows.map(normalizeMessage)],
        message => message.id
      );
      endpoints = [...endpoints, ...broadResult.endpoints];
    } catch {
      // A busca ampla e apenas um reforco para casos em que a Evolution salva
      // mensagens recebidas em outro JID. Se falhar, mantemos o retorno direto.
    }
  }

  const rows = normalizedRows
    .filter(message => message.text || message.messageType)
    .filter(message => matchesConversation(message, candidates))
    .sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return aTime - bTime;
    });

  return {
    source: 'evolution',
    endpoint: endpoints[0] || '',
    endpoints,
    messages: rows
  };
}

export async function findEvolutionChats({ limit = 100, evolutionConfig: config } = {}) {
  const { instance } = evolutionConfig(config);
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 300);
  const encodedInstance = encodeURIComponent(instance);
  const result = await tryRequests([
    { path: `/chat/findChats/${encodedInstance}`, method: 'POST', body: { limit: safeLimit } },
    { path: `/chat/findChats/${encodedInstance}`, method: 'GET' },
    { path: `/chat/findChats/${encodedInstance}?limit=${safeLimit}`, method: 'GET' }
  ], config);

  return {
    source: 'evolution',
    endpoint: result.endpoint,
    chats: asArray(result.data)
  };
}
