#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const Firebird = require("node-firebird");
const { createClient } = require("@supabase/supabase-js");

loadEnvFile(path.join(__dirname, ".env.local"));

const args = process.argv.slice(2);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value.replace(/\\n/g, "\n");
  }
}

function cleanEnvValue(value) {
  let text = String(value || "").trim();
  if (!text) return "";

  while (true) {
    const next = text
      .replace(/^\\?"/, "")
      .replace(/\\?"$/, "")
      .replace(/^\\?'/, "")
      .replace(/\\?'$/, "")
      .trim();

    if (next === text) break;
    text = next;
  }

  return text;
}

function requiredEnv(names) {
  const missing = names.filter((name) => !cleanEnvValue(process.env[name]));
  if (missing.length > 0) {
    throw new Error(`Variaveis ausentes no .env.local: ${missing.join(", ")}`);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function timestamp() {
  return new Date().toISOString();
}

function log(message) {
  console.log(message);
  const logDir = path.resolve(__dirname, process.env.SYNC_LOG_DIR || "logs");
  ensureDir(logDir);
  fs.appendFileSync(
    path.join(logDir, "sync.log"),
    `[${timestamp()}] ${message}\n`,
    "utf8"
  );
}

function fbConnect(options) {
  return new Promise((resolve, reject) => {
    Firebird.attach(options, (err, db) => (err ? reject(err) : resolve(db)));
  });
}

function fbQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

function fbDetach(db) {
  return new Promise((resolve) => db.detach(resolve));
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}

function formatDatePart(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : null;
}

function formatTimePart(value) {
  if (!(value instanceof Date)) return null;
  return value.toISOString().slice(11, 19);
}

function formatTimestamp(value) {
  return value instanceof Date ? value.toISOString() : null;
}

function extractDatePart(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const match = text.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function extractTimePart(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(11, 19);
  const text = String(value).trim();
  const fullMatch = text.match(/(\d{2}:\d{2}:\d{2})/);
  if (fullMatch) return fullMatch[1];
  const shortMatch = text.match(/(\d{2}:\d{2})(?!:)/);
  return shortMatch ? `${shortMatch[1]}:00` : null;
}

function combineDateTime(dateValue, timeValue) {
  const datePart = extractDatePart(dateValue);
  if (!datePart) return null;
  const timePart = extractTimePart(timeValue);
  return timePart ? `${datePart}T${timePart}` : `${datePart}T00:00:00`;
}

function parseLocalDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
      value.getHours(),
      value.getMinutes(),
      value.getSeconds()
    );
  }

  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
}

function buildRouteStepLabel(alxcodigo, descricao) {
  const ascii = String(descricao || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .trim();
  const firstToken = ascii.split(/\s+/).find(Boolean) || "";
  const shortCode = firstToken.slice(0, 3).toUpperCase();
  const prefix = alxcodigo != null ? `${alxcodigo}` : "";
  if (prefix && shortCode) return `${prefix}-${shortCode}`;
  return prefix || shortCode || "-";
}

const MANUAL_TABLE_DEFINITIONS = {
  CLIENCRM: {
    targetTable: "cliencrm",
    primaryKeys: ["clicodigo"],
    replaceAll: true,
    query: `
      SELECT
          c.CLICODIGO,
          c.CLIRAZSOCIAL,
          c.CLINOMEFANT,
          c.CLICNPJCPF,
          c.CLILIMCRED,
          c.CLIPCDESCPRODU,
          rt.ROTULOS,
          pc.DATA_ULTIMA_COMPRA,
          DATEDIFF(DAY FROM pc.DATA_ULTIMA_COMPRA TO CURRENT_DATE) AS DIAS_SEM_COMPRAR
      FROM CLIEN c
      LEFT JOIN (
          SELECT
              n.CLICODIGO,
              LIST(r.RTCNOME, ', ') AS ROTULOS
          FROM NROTULOSCLIEN n
          INNER JOIN ROTULOSCLIEN r
              ON r.RTCCODIGO = n.RTCCODIGO
          GROUP BY
              n.CLICODIGO
      ) rt
          ON rt.CLICODIGO = c.CLICODIGO
      LEFT JOIN (
          SELECT
              p.CLICODIGO,
              MAX(p.PEDDTEMIS) AS DATA_ULTIMA_COMPRA
          FROM PEDID p
          GROUP BY
              p.CLICODIGO
      ) pc
          ON pc.CLICODIGO = c.CLICODIGO
    `,
  },
};

function normalizeValue(value, targetColumn) {
  if (value == null) return null;
  if (value instanceof Date) {
    const dataType = String(targetColumn?.dataType || "").toLowerCase();
    if (dataType.includes("time") && !dataType.includes("timestamp")) {
      return formatTimePart(value);
    }
    if (dataType === "date") {
      return formatDatePart(value);
    }
    return formatTimestamp(value);
  }
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return null;
  return value;
}

function normalizeRow(row, targetColumns) {
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeName(key);
    const targetColumn = targetColumns[normalizedKey];
    if (!targetColumn) continue;
    normalized[normalizedKey] = normalizeValue(value, targetColumn);
  }
  return normalized;
}

async function getTargetColumns(supabase, tableName) {
  const sql = `
    select
      column_name,
      data_type,
      udt_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = '${tableName}'
    order by ordinal_position
  `;

  const { data, error } = await supabase.rpc("exec_sql", {
    sql: sql.replace(/\s+/g, " ").trim(),
  });

  if (error) {
    throw new Error(`Supabase ${tableName} schema: ${error.message}`);
  }

  const rows = data || [];
  if (rows.length === 0) {
    throw new Error(`Supabase ${tableName} schema: tabela sem colunas visiveis`);
  }

  return Object.fromEntries(
    rows.map((row) => [
      normalizeName(row.column_name),
      {
        name: normalizeName(row.column_name),
        dataType: row.data_type || row.udt_name || "",
      },
    ])
  );
}

async function getTableNames(db, filterList) {
  const rows = await fbQuery(
    db,
    `SELECT TRIM(RDB$RELATION_NAME) AS TABLE_NAME
     FROM RDB$RELATIONS
     WHERE RDB$SYSTEM_FLAG = 0
     ORDER BY RDB$RELATION_NAME`
  );

  const all = rows.map((row) => String(row.TABLE_NAME || "").trim()).filter(Boolean);
  if (filterList.length === 0) return all;

  const wanted = new Set(filterList.map((name) => name.toUpperCase()));
  return all.filter((name) => wanted.has(name.toUpperCase()));
}

function getManualTableDefinition(tableName) {
  return MANUAL_TABLE_DEFINITIONS[String(tableName || "").trim().toUpperCase()] || null;
}

async function getPrimaryKeys(db, tableName) {
  const rows = await fbQuery(
    db,
    `SELECT TRIM(ISG.RDB$FIELD_NAME) AS COLUMN_NAME
     FROM RDB$RELATION_CONSTRAINTS RC
     JOIN RDB$INDEX_SEGMENTS ISG ON ISG.RDB$INDEX_NAME = RC.RDB$INDEX_NAME
     WHERE RC.RDB$CONSTRAINT_TYPE = 'PRIMARY KEY'
       AND TRIM(RC.RDB$RELATION_NAME) = ?`,
    [tableName]
  );

  return rows.map((row) => normalizeName(row.COLUMN_NAME)).filter(Boolean);
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function dateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function parseDateFilters() {
  const recentDays = Number(process.env.SYNC_RECENT_DAYS || 0);
  const from = recentDays > 0 ? dateDaysAgo(recentDays) : cleanEnvValue(process.env.SYNC_DATE_FROM || "2025-01-01");

  const entries = parseList(process.env.SYNC_DATE_COLUMNS).map((item) => {
    const [table, column] = item.split(":").map((part) => part.trim());
    return [table.toUpperCase(), { column, from }];
  });

  return Object.fromEntries(entries.filter(([table, filter]) => table && filter.column));
}

function parseLinkedDateFilters() {
  const recentDays = Number(process.env.SYNC_RECENT_DAYS || 0);
  const defaultFrom =
    recentDays > 0 ? dateDaysAgo(recentDays) : cleanEnvValue(process.env.SYNC_DATE_FROM || "2025-01-01");

  const entries = parseList(process.env.SYNC_LINKED_DATE_TABLES).map((item) => {
    const [table, foreignKey, parentTable, parentDateColumn, daysOverride] = item
      .split(":")
      .map((part) => part.trim());
    const parsedDays = Number(daysOverride || 0);
    const from = parsedDays > 0 ? dateDaysAgo(parsedDays) : defaultFrom;
    return [
      table.toUpperCase(),
      {
        foreignKey,
        parentTable,
        parentDateColumn,
        daysOverride: parsedDays > 0 ? parsedDays : null,
        from,
      },
    ];
  });

  return Object.fromEntries(
    entries.filter(
      ([table, filter]) =>
        table && filter.foreignKey && filter.parentTable && filter.parentDateColumn
    )
  );
}

function parseRefreshLinkedTables() {
  const recentDays = Number(process.env.SYNC_RECENT_DAYS || 0);
  const defaultFrom =
    recentDays > 0 ? dateDaysAgo(recentDays) : cleanEnvValue(process.env.SYNC_DATE_FROM || "2025-01-01");

  const entries = parseList(process.env.SYNC_REFRESH_LINKED_TABLES).map((item) => {
    const [table, foreignKey, parentTable, parentDateColumn, daysOverride] = item
      .split(":")
      .map((part) => part.trim());
    const parsedDays = Number(daysOverride || 0);
    const from = parsedDays > 0 ? dateDaysAgo(parsedDays) : defaultFrom;
    return [
      table.toUpperCase(),
      {
        foreignKey,
        parentTable,
        parentDateColumn,
        days: parsedDays > 0 ? parsedDays : recentDays,
        from,
      },
    ];
  });

  return Object.fromEntries(
    entries.filter(
      ([table, filter]) =>
        table && filter.foreignKey && filter.parentTable && filter.parentDateColumn && filter.from
    )
  );
}

function parseUpsertTables() {
  const configured = parseList(process.env.SYNC_UPSERT_TABLES);
  if (configured.length > 0) return configured.map((item) => item.toUpperCase());

  return ["REQUI", "PEDID", "ACOPED", "PDPRD", "PDSER", "JBXROTEIRO"];
}

function applyRefreshWindowToFilters(dateFilters, linkedDateFilters, days, tables) {
  if (!days || days <= 0) {
    return { dateFilters, linkedDateFilters };
  }

  const from = dateDaysAgo(days);
  const selected = new Set((tables || []).map((table) => String(table || "").trim().toUpperCase()));

  const nextDateFilters = Object.fromEntries(
    Object.entries(dateFilters).map(([table, filter]) => [
      table,
      selected.has(table) ? { ...filter, from } : filter,
    ])
  );

  const nextLinkedDateFilters = Object.fromEntries(
    Object.entries(linkedDateFilters).map(([table, filter]) => [
      table,
      selected.has(table) ? { ...filter, from } : filter,
    ])
  );

  return {
    dateFilters: nextDateFilters,
    linkedDateFilters: nextLinkedDateFilters,
  };
}

function getTableArg() {
  const index = args.indexOf("--table");
  return index === -1 ? null : args[index + 1];
}

function getTablesArg() {
  const index = args.indexOf("--tables");
  if (index === -1) return [];
  return String(args[index + 1] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getNumberArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = Number(args[index + 1]);
  return Number.isFinite(value) ? value : null;
}

function envIsTrue(name) {
  return String(process.env[name] || "").trim().toLowerCase() === "true";
}

function incrementalSyncEnabled() {
  const value = String(process.env.SYNC_INCREMENTAL || "").trim().toLowerCase();
  if (!value) return true;
  return !["false", "0", "no", "off"].includes(value);
}

function getSupabase() {
  const url = cleanEnvValue(process.env.SUPABASE_URL);
  const key = cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function execSupabaseSql(supabase, sql) {
  const { data, error } = await supabase.rpc("exec_sql", {
    sql: sql.replace(/\s+/g, " ").trim(),
  });

  if (error) {
    throw new Error(`Supabase SQL: ${error.message}`);
  }

  return data || [];
}

async function ensureRoteiroCacheTable(supabase) {
  await execSupabaseSql(
    supabase,
    `
      create table if not exists public.pedido_roteiro_cache (
        id_pedido bigint primary key,
        pedcodigo text not null,
        roteiro_resumo text,
        roteiro_json jsonb not null default '[]'::jsonb,
        updated_at timestamptz not null default now()
      )
    `
  );
}

async function rebuildRoteiroCache(supabase, fromDate) {
  await ensureRoteiroCacheTable(supabase);

  const orders = await execSupabaseSql(
    supabase,
    `
      select
        ped.id_pedido,
        ped.pedcodigo,
        ped.pedpzentre,
        ped.pedhrentre,
        ped.peddtemis,
        ped.pedsitped
      from pedid ped
      where ped.peddtemis >= '${fromDate}T00:00:00'
        and ped.pedsitped <> 'C'
      order by ped.id_pedido
    `
  );

  if (!orders.length) return;

  const orderMap = new Map();
  const orderIds = [];
  for (const row of orders) {
    const id = Number(row.id_pedido);
    if (!Number.isFinite(id)) continue;
    orderIds.push(id);
    orderMap.set(String(id), {
      id_pedido: id,
      pedcodigo: String(row.pedcodigo || "").trim(),
      expected: parseLocalDateTime(combineDateTime(row.pedpzentre, row.pedhrentre)),
    });
  }

  const roteiroRows = [];
  const passRows = [];
  for (let index = 0; index < orderIds.length; index += 500) {
    const chunk = orderIds.slice(index, index + 500).join(", ");
    const routeChunk = await execSupabaseSql(
      supabase,
      `
        select
          jr.id_pedido,
          jr.jbrordem,
          jr.alxcodigo,
          a.alxdescricao::text as celula_descricao
        from jbxroteiro jr
        left join almox a on a.alxcodigo = jr.alxcodigo and a.empcodigo = jr.empcodigo
        where jr.id_pedido in (${chunk})
        order by jr.id_pedido, jr.jbrordem asc, jr.alxcodigo asc
      `
    );
    roteiroRows.push(...routeChunk);

    const passChunk = await execSupabaseSql(
      supabase,
      `
        select distinct on (ac.id_pedido, ac.alxcodigo)
          ac.id_pedido,
          ac.alxcodigo,
          a.alxdescricao::text as celula_descricao,
          ac.apdata,
          ac.aphora
        from acoped ac
        left join almox a on a.alxcodigo = ac.alxcodigo and a.empcodigo = ac.empcodigo
        where ac.id_pedido in (${chunk})
          and ac.alxcodigo is not null
        order by ac.id_pedido, ac.alxcodigo, ac.apdata asc nulls last, ac.aphora asc nulls last
      `
    );
    passRows.push(...passChunk);
  }

  const passMap = new Map();
  const observedByOrder = new Map();
  for (const row of passRows) {
    const orderId = String(row.id_pedido || "");
    const alx = row.alxcodigo != null ? String(row.alxcodigo) : "";
    if (!orderId || !alx) continue;
    const passedAt = parseLocalDateTime(combineDateTime(row.apdata, row.aphora));
    passMap.set(`${orderId}:${alx}`, passedAt);

    if (!observedByOrder.has(orderId)) observedByOrder.set(orderId, []);
    observedByOrder.get(orderId).push({
      ordem: Number.MAX_SAFE_INTEGER,
      alxcodigo: alx,
      descricao: String(row.celula_descricao || "").trim(),
      passedAt,
    });
  }

  const cacheByOrder = new Map();
  for (const row of roteiroRows) {
    const orderId = String(row.id_pedido || "");
    if (!orderId || !orderMap.has(orderId)) continue;
    const alx = row.alxcodigo != null ? String(row.alxcodigo) : "";
    const expected = orderMap.get(orderId).expected;
    const passedAt = passMap.get(`${orderId}:${alx}`);

    let state = "pending";
    if (passedAt) state = expected && passedAt > expected ? "delayed" : "completed";

    if (!cacheByOrder.has(orderId)) cacheByOrder.set(orderId, []);
    cacheByOrder.get(orderId).push({
      ordem: Number(row.jbrordem) || 0,
      alxcodigo: alx,
      label: buildRouteStepLabel(row.alxcodigo, row.celula_descricao),
      descricao: String(row.celula_descricao || "").trim(),
      state,
    });
  }

  const cacheRows = [];
  for (const orderId of orderIds.map(String)) {
    let route = (cacheByOrder.get(orderId) || []).sort((a, b) => {
      if (a.ordem !== b.ordem) return a.ordem - b.ordem;
      return String(a.alxcodigo).localeCompare(String(b.alxcodigo));
    });

    if (route.length === 0) {
      const order = orderMap.get(orderId);
      const expected = order?.expected || null;
      route = (observedByOrder.get(orderId) || [])
        .slice()
        .sort((a, b) => {
          const timeA = a.passedAt ? a.passedAt.getTime() : Number.MAX_SAFE_INTEGER;
          const timeB = b.passedAt ? b.passedAt.getTime() : Number.MAX_SAFE_INTEGER;
          if (timeA !== timeB) return timeA - timeB;
          return String(a.alxcodigo).localeCompare(String(b.alxcodigo));
        })
        .map((step, index) => ({
          ordem: index + 1,
          alxcodigo: step.alxcodigo,
          label: buildRouteStepLabel(step.alxcodigo, step.descricao),
          descricao: step.descricao,
          state: step.passedAt && expected && step.passedAt > expected ? "delayed" : "completed",
        }));
    }

    const order = orderMap.get(orderId);
    cacheRows.push({
      id_pedido: order.id_pedido,
      pedcodigo: order.pedcodigo,
      roteiro_resumo: route.map((step) => step.label).join(" | "),
      roteiro_json: route,
      updated_at: new Date().toISOString(),
    });
  }

  for (let index = 0; index < cacheRows.length; index += 500) {
    const chunk = cacheRows.slice(index, index + 500);
    const { error } = await supabase.from("pedido_roteiro_cache").upsert(chunk, {
      onConflict: "id_pedido",
      ignoreDuplicates: false,
      defaultToNull: true,
    });
    if (error) {
      throw new Error(`Supabase pedido_roteiro_cache: ${error.message}`);
    }
  }

  log(`Cache    : pedido_roteiro_cache atualizado para ${cacheRows.length.toLocaleString("pt-BR")} pedido(s).`);
}

async function deleteSupabaseInChunks(supabase, tableName, whereClause, batchSize = 5000) {
  const normalizedTable = normalizeName(tableName);

  while (true) {
    const probeRows = await execSupabaseSql(
      supabase,
      `
        select ctid
        from ${normalizedTable}
        where ${whereClause}
        limit ${batchSize}
      `
    );

    if (!probeRows || probeRows.length === 0) break;

    const ctids = probeRows
      .map((row) => row.ctid)
      .filter(Boolean)
      .map((ctid) => `'${String(ctid).replace(/'/g, "''")}'`);

    if (ctids.length === 0) break;

    await execSupabaseSql(
      supabase,
      `
        delete from ${normalizedTable}
        where ctid in (${ctids.join(", ")})
      `
    );

    if (ctids.length < batchSize) break;
  }
}

async function writeBatch(supabase, tableName, rows, primaryKeys, mode = "insert-only") {
  if (rows.length === 0) return;

  if (mode === "upsert" && primaryKeys.length > 0) {
    const { error } = await supabase.from(tableName).upsert(rows, {
      onConflict: primaryKeys.join(","),
      ignoreDuplicates: false,
      defaultToNull: true,
    });

    if (error) {
      throw new Error(`Supabase ${tableName}: ${error.message}`);
    }

    return;
  }

  let query = supabase.from(tableName).upsert(rows, {
    ignoreDuplicates: true,
    defaultToNull: true,
  });

  if (primaryKeys.length > 0) {
    query = supabase.from(tableName).upsert(rows, {
      onConflict: primaryKeys.join(","),
      ignoreDuplicates: true,
      defaultToNull: true,
    });
  }

  const { error } = await query;
  if (error) {
    throw new Error(`Supabase ${tableName}: ${error.message}`);
  }
}

async function syncManualTable(db, supabase, tableName, definition, options) {
  const normalizedTable = normalizeName(definition.targetTable || tableName);
  const targetColumns = await getTargetColumns(supabase, normalizedTable);
  const primaryKeys = (definition.primaryKeys || []).map((key) => normalizeName(key));
  const rows = await fbQuery(db, definition.query);

  process.stdout.write(`  ${tableName} -> ${normalizedTable}: `);

  const normalizedRows = rows
    .map((row) => normalizeRow(row, targetColumns))
    .filter((row) => Object.keys(row).length > 0);

  if (!options.dryRun && definition.replaceAll) {
    await execSupabaseSql(supabase, `delete from ${normalizedTable} where true`);
  }

  if (!options.dryRun) {
    for (let index = 0; index < normalizedRows.length; index += options.insertBatch) {
      const chunk = normalizedRows.slice(index, index + options.insertBatch);
      await writeBatch(supabase, normalizedTable, chunk, primaryKeys, "upsert");
      process.stdout.write(".");
    }
  }

  console.log(` ${normalizedRows.length.toLocaleString("pt-BR")} linha(s)${options.dryRun ? " [dry-run]" : ""}`);
  return normalizedRows.length;
}

async function refreshRecentWindow(supabase, tables, days, refreshLinkedTables = {}) {
  const envRecentDays = Number(process.env.SYNC_RECENT_DAYS || 0);
  const effectiveDays = days && days > 0 ? days : envRecentDays;

  if ((!effectiveDays || effectiveDays <= 0) && Object.keys(refreshLinkedTables).length === 0) return;
  if (tables.length === 0) return;

  const from = dateDaysAgo(effectiveDays);
  const wanted = new Set(tables.map((table) => String(table || "").trim().toUpperCase()));

  const steps = [
    {
      table: "REQUI",
      enabled: wanted.has("REQUI"),
      where: `reqdata >= '${from}T00:00:00'`,
    },
    {
      table: "ACOPED",
      enabled: wanted.has("ACOPED"),
      where: `apdata >= '${from}'`,
    },
    {
      table: "PDPRD",
      enabled: wanted.has("PDPRD"),
      where: `id_pedido in (
          select id_pedido
          from pedid
          where peddtemis >= '${from}T00:00:00'
        )`,
    },
    {
      table: "PDSER",
      enabled: wanted.has("PDSER"),
      where: `id_pedido in (
          select id_pedido
          from pedid
          where peddtemis >= '${from}T00:00:00'
        )`,
    },
    {
      table: "PEDID",
      enabled: wanted.has("PEDID"),
      where: `peddtemis >= '${from}T00:00:00'`,
    },
  ];

  const activeSteps = steps.filter((step) => step.enabled);
  const refreshLinkedSteps = Object.entries(refreshLinkedTables)
    .filter(([table]) => wanted.has(table))
    .map(([table, filter]) => ({
      table,
      days: filter.days || days,
      where: `"${normalizeName(filter.foreignKey)}" in (
          select distinct "${normalizeName(filter.foreignKey)}"
          from "${normalizeName(filter.parentTable)}"
          where "${normalizeName(filter.parentDateColumn)}" >= '${filter.from}'
        )`,
    }));

  if (activeSteps.length === 0 && refreshLinkedSteps.length === 0) return;

  if (activeSteps.length > 0) {
    log(`Refresh  : limpando janela recente de ${effectiveDays} dia(s) para ${activeSteps.map((step) => step.table).join(", ")}`);
    for (const step of activeSteps) {
      await deleteSupabaseInChunks(supabase, step.table, step.where);
    }
  }

  for (const step of refreshLinkedSteps) {
    log(`Refresh  : limpando ${step.table} pela janela de ${step.days} dia(s) via tabela vinculada`);
    await deleteSupabaseInChunks(supabase, step.table, step.where);
  }
}

async function syncTable(db, supabase, tableName, options) {
  const normalizedTable = normalizeName(tableName);
  const dateFilter = options.dateFilters[tableName.toUpperCase()] || null;
  const linkedDateFilter = options.linkedDateFilters[tableName.toUpperCase()] || null;
  const writeMode = options.upsertTables.has(tableName.toUpperCase()) ? "upsert" : "insert-only";
  const primaryKeys = await getPrimaryKeys(db, tableName);
  const targetColumns = await getTargetColumns(supabase, normalizedTable);
  const fetchBatch = options.fetchBatch;
  const insertBatch = options.insertBatch;
  const whereClause = dateFilter
    ? `WHERE "${dateFilter.column}" >= '${dateFilter.from}'`
    : linkedDateFilter
      ? `WHERE "${linkedDateFilter.foreignKey}" IN (
          SELECT "${linkedDateFilter.foreignKey}"
          FROM "${linkedDateFilter.parentTable}"
          WHERE "${linkedDateFilter.parentDateColumn}" >= '${linkedDateFilter.from}'
        )`
      : "";

  const filterLabel = dateFilter
    ? ` [>= ${dateFilter.from}]`
    : linkedDateFilter
      ? ` [via ${linkedDateFilter.parentTable}.${linkedDateFilter.parentDateColumn} >= ${linkedDateFilter.from}]`
      : "";

  process.stdout.write(`  ${tableName} -> ${normalizedTable}${filterLabel}: `);

  let skip = 0;
  let totalRows = 0;
  let pendingRows = [];

  async function flushPending() {
    if (pendingRows.length === 0 || options.dryRun) return;
    await writeBatch(supabase, normalizedTable, pendingRows, primaryKeys, writeMode);
    pendingRows = [];
    process.stdout.write(".");
  }

  while (true) {
    const rows = await fbQuery(
      db,
      `SELECT FIRST ${fetchBatch} SKIP ${skip} * FROM "${tableName}" ${whereClause}`
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      const normalized = normalizeRow(row, targetColumns);
      if (Object.keys(normalized).length === 0) continue;
      pendingRows.push(normalized);
      totalRows += 1;

      if (pendingRows.length >= insertBatch) {
        await flushPending();
      }
    }

    if (rows.length < fetchBatch) break;
    skip += rows.length;
  }

  if (!options.dryRun && pendingRows.length > 0) {
    await writeBatch(supabase, normalizedTable, pendingRows, primaryKeys, writeMode);
    process.stdout.write(".");
  }

  console.log(` ${totalRows.toLocaleString("pt-BR")} linha(s)${options.dryRun ? " [dry-run]" : ""}`);
  return totalRows;
}

async function runOnce() {
  requiredEnv([
    "FIREBIRD_HOST",
    "FIREBIRD_DATABASE",
    "FIREBIRD_PASSWORD",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);

  const dryRun = args.includes("--dry-run");
  const tableArg = getTableArg();
  const tablesArg = getTablesArg();
  const refreshRecentDays = getNumberArg("--refresh-recent-days");
  const incrementalEnabled = incrementalSyncEnabled();
  const dateFilters = incrementalEnabled ? parseDateFilters() : {};
  const linkedDateFilters = incrementalEnabled ? parseLinkedDateFilters() : {};
  const refreshLinkedTables = incrementalEnabled ? parseRefreshLinkedTables() : {};
  const upsertTables = new Set(parseUpsertTables());
  const dateTablesOnly =
    incrementalEnabled && (args.includes("--date-tables-only") || envIsTrue("SYNC_DATE_TABLES_ONLY"));
  const filterList = tablesArg.length > 0 ? tablesArg : tableArg ? [tableArg] : parseList(process.env.SYNC_TABLES);
  const requestedTables =
    dateTablesOnly && !tableArg && tablesArg.length === 0
      ? [...new Set([...Object.keys(dateFilters), ...Object.keys(linkedDateFilters)])]
      : filterList;
  const manualTablesToSync = [...new Set(requestedTables.filter((table) => getManualTableDefinition(table)).map((table) => table.toUpperCase()))];
  const regularRequestedTables = requestedTables.filter((table) => !getManualTableDefinition(table));

  const fbOptions = {
    host: cleanEnvValue(process.env.FIREBIRD_HOST),
    port: Number(process.env.FIREBIRD_PORT || 3050),
    database: cleanEnvValue(process.env.FIREBIRD_DATABASE),
    user: cleanEnvValue(process.env.FIREBIRD_USER || "SYSDBA"),
    password: cleanEnvValue(process.env.FIREBIRD_PASSWORD),
    lowercase_keys: false,
  };

  log("");
  log("=== Firebird -> Supabase Sync ===");
  log(`Firebird : ${fbOptions.host}:${fbOptions.port} / ${fbOptions.database}`);
  log(`Supabase : ${cleanEnvValue(process.env.SUPABASE_URL)}`);
  log(`Tabelas  : ${requestedTables.length > 0 ? requestedTables.join(", ") : "todas"}`);
  log(`Modo     : ${incrementalEnabled ? "incremental" : "normal completo"}`);
  if (dateTablesOnly && !tableArg && tablesArg.length === 0) log("Modo     : somente tabelas com filtro de data");
  if (refreshRecentDays && refreshRecentDays > 0) log(`Refresh  : substituindo somente os ultimos ${refreshRecentDays} dia(s) das tabelas selecionadas`);
  log(`Escrita  : upsert para ${[...upsertTables].join(", ")}; demais seguem em insert-only`);
  if (dryRun) log("Modo     : dry-run");

  const db = await fbConnect(fbOptions);
  const supabase = getSupabase();

  try {
    const tables =
      regularRequestedTables.length > 0 ? await getTableNames(db, regularRequestedTables) : [];
    if (tables.length === 0 && manualTablesToSync.length === 0) {
      log("Nenhuma tabela encontrada para sincronizar.");
      return;
    }

    if (!dryRun && refreshRecentDays && refreshRecentDays > 0) {
      await refreshRecentWindow(supabase, tables, refreshRecentDays, refreshLinkedTables);
    }

    const effectiveFilters = applyRefreshWindowToFilters(dateFilters, linkedDateFilters, refreshRecentDays, tables);

    const options = {
      dryRun,
      fetchBatch: Number(process.env.SYNC_FETCH_BATCH || 1000),
      insertBatch: Number(process.env.SYNC_INSERT_BATCH || 500),
      dateFilters: effectiveFilters.dateFilters,
      linkedDateFilters: effectiveFilters.linkedDateFilters,
      upsertTables,
    };

    let ok = 0;
    let failed = 0;
    let totalRows = 0;
    const startedAt = Date.now();

    for (const table of tables) {
      try {
        totalRows += await syncTable(db, supabase, table, options);
        ok += 1;
      } catch (error) {
        failed += 1;
        log(`  ERRO ${table}: ${error.message}`);
      }
    }

    for (const table of manualTablesToSync) {
      try {
        totalRows += await syncManualTable(db, supabase, table, getManualTableDefinition(table), options);
        ok += 1;
      } catch (error) {
        failed += 1;
        log(`  ERRO ${table}: ${error.message}`);
      }
    }

    const summary = {
      ok: failed === 0,
      tablesOk: ok,
      tablesFailed: failed,
      totalRows,
      elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
      finishedAt: timestamp(),
    };

    log(`Concluido: ${ok} tabela(s) OK, ${failed} erro(s), ${totalRows.toLocaleString("pt-BR")} linha(s).`);
    const shouldRebuildRouteCache = tables.some((table) =>
      ["PEDID", "ACOPED", "JBXROTEIRO", "ALMOX"].includes(String(table || "").toUpperCase())
    );

    if (!dryRun && ok > 0 && shouldRebuildRouteCache) {
      const roteiroFromDate = incrementalEnabled
        ? dateDaysAgo(Number(process.env.SYNC_RECENT_DAYS || 30))
        : cleanEnvValue(process.env.SYNC_DATE_FROM || "2025-01-01");
      await rebuildRoteiroCache(supabase, roteiroFromDate);
    }
    log(`Resumo   : ${JSON.stringify(summary)}`);

    if (failed > 0) process.exitCode = 1;
  } finally {
    await fbDetach(db);
  }
}

async function main() {
  if (!args.includes("--watch")) {
    await runOnce();
    return;
  }

  const intervalMs = Number(process.env.SYNC_INTERVAL_SECONDS || 300) * 1000;
  while (true) {
    try {
      await runOnce();
    } catch (error) {
      log(`Erro fatal: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

main().catch((error) => {
  log(`Erro fatal: ${error.message}`);
  process.exit(1);
});
