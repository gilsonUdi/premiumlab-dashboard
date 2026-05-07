#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const Firebird = require("node-firebird");
const { Pool: PgPool } = require("pg");
const { createClient } = require("@supabase/supabase-js");

loadEnvFile(path.join(__dirname, ".env.local"));

const args = process.argv.slice(2);
let pgPool = null;

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

function normalizeText(value) {
  if (value == null) return "";

  const original = String(value).trim();
  if (!original) return "";

  let best = original;

  try {
    const repaired = Buffer.from(original, "latin1").toString("utf8").trim();
    const repairedLooksBetter =
      repaired &&
      /[A-Za-zÀ-ÿ]/.test(repaired) &&
      (repaired.match(/[ï¿½ÃƒÃ‚]/g) || []).length < (best.match(/[ï¿½ÃƒÃ‚]/g) || []).length;

    if (repairedLooksBetter) best = repaired;
  } catch {
    // ignore best-effort decoding failures
  }

  return best.replace(/\uFFFD/g, "").trim();
}

function nowInProductionTimeZone() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
}

function orderIsDelayed(expected, delivered, now) {
  if (!expected) return false;
  return (delivered && delivered > expected) || (!delivered && now > expected);
}

function resolveStatus(expected, delivered, now) {
  if (delivered) return delivered > expected ? "delayed_completed" : "completed";
  return expected && now > expected ? "delayed" : "in_progress";
}

function buildStatusPriority(status) {
  if (status === "delayed") return 4;
  if (status === "in_progress" || status === "pending") return 3;
  if (status === "delayed_completed") return 2;
  if (status === "completed") return 1;
  return 0;
}

function buildDelayRank(expected, delivered, now) {
  if (!expected) return Number.MIN_SAFE_INTEGER;
  return Math.floor(((delivered || now).getTime() - expected.getTime()) / 60000);
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
          rt.CODS_ROTULO,
          rt.ROTULOS,
          rt.ROTULOS_DETALHE,
          pc.DATA_ULTIMA_COMPRA,
          DATEDIFF(DAY FROM pc.DATA_ULTIMA_COMPRA TO CURRENT_DATE) AS DIAS_SEM_COMPRAR
      FROM CLIEN c
      LEFT JOIN (
          SELECT
              n.CLICODIGO,
              LIST(CAST(n.RTCCODIGO AS VARCHAR(20)), ', ') AS CODS_ROTULO,
              LIST(r.RTCNOME, ', ') AS ROTULOS
              , LIST(CAST(n.RTCCODIGO AS VARCHAR(20)) || ' - ' || r.RTCNOME, ' | ') AS ROTULOS_DETALHE
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

const TABLE_COLUMN_OMISSIONS = {
  REQUI: new Set(["reqdtreceb"]),
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

function sanitizeRowForTable(tableName, row) {
  const omissions = TABLE_COLUMN_OMISSIONS[String(tableName || "").trim().toUpperCase()];
  if (!omissions || omissions.size === 0) return row;

  const sanitized = {};
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeName(key);
    if (omissions.has(normalizedKey)) continue;
    sanitized[key] = value;
  }
  return sanitized;
}

function normalizeRow(row, targetColumns) {
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeName(key);
    const targetColumn = targetColumns ? targetColumns[normalizedKey] : null;
    if (targetColumns && !targetColumn) continue;
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

function addDaysToDateString(dateString, days) {
  const base = new Date(`${String(dateString).slice(0, 10)}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function buildDateBoundary(value, includeTime = false) {
  const datePart = String(value || "").slice(0, 10);
  return includeTime ? `${datePart}T00:00:00` : datePart;
}

function buildWindowedWhereClause(dateFilter, linkedDateFilter, windowStart, windowEnd) {
  if (dateFilter) {
    const lower = buildDateBoundary(windowStart, String(dateFilter.from || "").includes("T"));
    const upper = buildDateBoundary(windowEnd, String(dateFilter.from || "").includes("T"));
    return `WHERE "${dateFilter.column}" >= '${lower}' AND "${dateFilter.column}" < '${upper}'`;
  }

  if (linkedDateFilter) {
    const useTime = String(linkedDateFilter.from || "").includes("T");
    const lower = buildDateBoundary(windowStart, useTime);
    const upper = buildDateBoundary(windowEnd, useTime);
    return `WHERE "${linkedDateFilter.foreignKey}" IN (
          SELECT "${linkedDateFilter.foreignKey}"
          FROM "${linkedDateFilter.parentTable}"
          WHERE "${linkedDateFilter.parentDateColumn}" >= '${lower}'
            AND "${linkedDateFilter.parentDateColumn}" < '${upper}'
        )`;
  }

  return "";
}

function buildOpenEndedWhereClause(dateFilter, linkedDateFilter) {
  if (dateFilter) {
    const lower = buildDateBoundary(dateFilter.from, String(dateFilter.from || "").includes("T"));
    return `WHERE "${dateFilter.column}" >= '${lower}'`;
  }

  if (linkedDateFilter) {
    const lower = buildDateBoundary(linkedDateFilter.from, String(linkedDateFilter.from || "").includes("T"));
    return `WHERE "${linkedDateFilter.foreignKey}" IN (
          SELECT "${linkedDateFilter.foreignKey}"
          FROM "${linkedDateFilter.parentTable}"
          WHERE "${linkedDateFilter.parentDateColumn}" >= '${lower}'
        )`;
  }

  return "";
}

function buildProcessingWindows(dateFilter, linkedDateFilter, windowDays) {
  const filterFrom = dateFilter?.from || linkedDateFilter?.from;
  if (!filterFrom || !windowDays || windowDays <= 0) return [null];

  const start = String(filterFrom).slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const windows = [];
  let cursor = start;

  while (cursor <= today) {
    const next = addDaysToDateString(cursor, windowDays);
    windows.push({ start: cursor, end: next });
    cursor = next;
  }

  return windows.length > 0 ? windows : [null];
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

function getSupabaseDatabaseUrl() {
  return cleanEnvValue(process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPgTimeoutError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("etimedout") ||
    message.includes("connection terminated due to connection timeout")
  );
}

async function getPgPool() {
  const connectionString = getSupabaseDatabaseUrl();
  if (!connectionString) {
    throw new Error(
      "SUPABASE_DATABASE_URL nao configurada. Configure a conexao Postgres direta para reconstruir o pedido_dashboard_cache."
    );
  }

  if (!pgPool) {
    pgPool = new PgPool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 1,
      family: 4,
      connectionTimeoutMillis: 15000,
    });
  }

  return pgPool;
}

async function resetPgPool() {
  if (!pgPool) return;

  try {
    await pgPool.end();
  } catch {
    // ignore pool shutdown failures
  } finally {
    pgPool = null;
  }
}

async function withPgRetries(work) {
  const attempts = Math.max(1, Number(process.env.SYNC_PG_RETRY_ATTEMPTS || 3));
  const delayMs = Math.max(250, Number(process.env.SYNC_PG_RETRY_DELAY_MS || 2000));
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (!isPgTimeoutError(error) || attempt === attempts) {
        throw error;
      }

      log(`Cache    : tentativa ${attempt}/${attempts} do Postgres expirou, tentando novamente...`);
      await resetPgPool();
      await sleep(delayMs);
    }
  }

  throw lastError;
}

async function pgQuery(clientOrPool, text, params = []) {
  const result = await clientOrPool.query(text, params);
  return result.rows || [];
}

async function withPgTransaction(work) {
  return withPgRetries(async () => {
    const pool = await getPgPool();
    const client = await pool.connect();

    try {
      await client.query("begin");
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      try {
        await client.query("rollback");
      } catch {
        // ignore rollback failures
      }
      throw error;
    } finally {
      client.release();
    }
  });
}

async function insertPgRowsInBatches(client, tableName, columns, rows, mapRowToValues, batchSize = 250) {
  if (!rows.length) return;

  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const values = [];

    const groups = batch.map((row, rowIndex) => {
      const mapped = mapRowToValues(row);
      values.push(...mapped);
      const placeholders = mapped.map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`);
      return `(${placeholders.join(",")})`;
    });

    await client.query(
      `
        insert into ${tableName} (${columns.join(", ")})
        values ${groups.join(", ")}
      `,
      values
    );
  }
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

async function execOptionalSql(supabase, sql) {
  try {
    return await execSupabaseSql(supabase, sql);
  } catch (error) {
    return [];
  }
}

async function fetchSupabasePages(queryFactory, pageSize = 1000, maxRows = 100000) {
  const rows = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize - 1, maxRows - 1);
    const { data, error } = await queryFactory().range(from, to);
    if (error) {
      throw new Error(`Supabase page fetch: ${error.message}`);
    }

    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

async function ensureRoteiroCacheTable(supabase) {
  const ddl = `
    create table if not exists public.pedido_roteiro_cache (
      id_pedido bigint primary key,
      pedcodigo text not null,
      roteiro_resumo text,
      roteiro_json jsonb not null default '[]'::jsonb,
      updated_at timestamptz not null default now()
    )
  `;

  await execSupabaseSql(supabase, ddl);
}

async function ensureDashboardCacheTable(supabase) {
  const ddl = `
    create table if not exists public.pedido_dashboard_cache (
      id_pedido bigint primary key,
      pedcodigo text not null,
      clicodigo bigint,
      clinome text,
      gclcodigo bigint,
      vendedor_codigo bigint,
      vendedor_nome text,
      emissao timestamptz,
      previsto timestamptz,
      saida timestamptz,
      quantidade numeric not null default 0,
      status text,
      current_cell text,
      caixa text,
      indice integer not null default 0,
      delay_rank bigint not null default 0,
      status_priority integer not null default 0,
      row_tone text,
      roteiro_resumo text,
      roteiro_json jsonb not null default '[]'::jsonb,
      updated_at timestamptz not null default now()
    )
  `;

  await execSupabaseSql(supabase, ddl);
}

async function ensureCliencrmTable(supabase) {
  const ddl = `
    create table if not exists public.cliencrm (
      clicodigo bigint primary key,
      clirazsocial text,
      clinomefant text,
      clicnpjcpf text,
      clilimcred numeric,
      clipcdescprodu numeric,
      cods_rotulo text,
      rotulos text,
      rotulos_detalhe text,
      data_ultima_compra timestamptz,
      dias_sem_comprar integer
    )
  `;

  const alterStatements = [
    "alter table public.cliencrm add column if not exists cods_rotulo text",
    "alter table public.cliencrm add column if not exists rotulos text",
    "alter table public.cliencrm add column if not exists rotulos_detalhe text",
    "alter table public.cliencrm add column if not exists data_ultima_compra timestamptz",
    "alter table public.cliencrm add column if not exists dias_sem_comprar integer",
  ];

  await execSupabaseSql(supabase, ddl);
  for (const statement of alterStatements) {
    await execSupabaseSql(supabase, statement);
  }
}

async function rebuildRoteiroCache(supabase, fromDate) {
  await ensureRoteiroCacheTable(supabase);
  const pool = await withPgRetries(() => getPgPool());
  const orders = await withPgRetries(() =>
    pgQuery(
      pool,
      `
        select
          ped.id_pedido,
          ped.pedcodigo,
          ped.pedpzentre,
          ped.pedhrentre,
          ped.peddtemis,
          ped.pedsitped
        from public.pedid ped
        where ped.peddtemis >= $1
          and coalesce(ped.pedsitped, '') <> 'C'
        order by ped.id_pedido
      `,
      [`${fromDate}T00:00:00`]
    )
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
    const chunkIds = orderIds.slice(index, index + 500);
    const routeChunk = await pgQuery(
      pool,
      `
        select
          jr.id_pedido,
          jr.jbrordem,
          jr.alxcodigo,
          a.alxdescricao::text as celula_descricao
        from public.jbxroteiro jr
        left join public.almox a on a.alxcodigo = jr.alxcodigo and a.empcodigo = jr.empcodigo
        where jr.id_pedido = any($1::bigint[])
        order by jr.id_pedido, jr.jbrordem asc, jr.alxcodigo asc
      `,
      [chunkIds]
    );
    roteiroRows.push(...routeChunk);

    const passChunk = await pgQuery(
      pool,
      `
        select distinct on (ac.id_pedido, ac.alxcodigo)
          ac.id_pedido,
          ac.alxcodigo,
          a.alxdescricao::text as celula_descricao,
          ac.apdata,
          ac.aphora
        from public.acoped ac
        left join public.almox a on a.alxcodigo = ac.alxcodigo and a.empcodigo = ac.empcodigo
        where ac.id_pedido = any($1::bigint[])
          and ac.alxcodigo is not null
        order by ac.id_pedido, ac.alxcodigo, ac.apdata asc nulls last, ac.aphora asc nulls last
      `,
      [chunkIds]
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

  await withPgTransaction(async (client) => {
    for (let index = 0; index < orderIds.length; index += 5000) {
      const chunkIds = orderIds.slice(index, index + 5000);
      await client.query(
        `
          delete from public.pedido_roteiro_cache
          where id_pedido = any($1::bigint[])
        `,
        [chunkIds]
      );
    }

    await insertPgRowsInBatches(
      client,
      "public.pedido_roteiro_cache",
      ["id_pedido", "pedcodigo", "roteiro_resumo", "roteiro_json", "updated_at"],
      cacheRows,
      (row) => [
        row.id_pedido,
        row.pedcodigo,
        row.roteiro_resumo,
        JSON.stringify(row.roteiro_json || []),
        row.updated_at,
      ],
      250
    );
  });

  log(`Cache    : pedido_roteiro_cache atualizado para ${cacheRows.length.toLocaleString("pt-BR")} pedido(s).`);
}

async function rebuildDashboardCache(supabase, fromDate) {
  await ensureDashboardCacheTable(supabase);
  log(`Cache    : reconstruindo pedido_dashboard_cache desde ${fromDate}`);

  const now = nowInProductionTimeZone();
  const pool = await withPgRetries(() => getPgPool());
  const [orders, clients, sellers] = await withPgRetries(() =>
    Promise.all([
      pgQuery(
        pool,
        `
          select
            id_pedido,
            pedcodigo,
            clicodigo,
            funcodigo,
            peddtemis,
            pedpzentre,
            pedhrentre,
            peddtsaida,
            pedhrsaida,
            pedsitped
          from public.pedid
          where peddtemis >= $1
            and coalesce(pedsitped, '') <> 'C'
          order by id_pedido
        `,
        [`${fromDate}T00:00:00`]
      ),
      pgQuery(
        pool,
        `
          select clicodigo, clinomefant, clirazsocial, gclcodigo
          from public.clien
          order by clicodigo
        `
      ),
      pgQuery(
        pool,
        `
          select funcodigo, funnome
          from public.funcio
          order by funcodigo
        `
      ),
    ])
  );

  const clientMap = new Map(
    clients.map((row) => [
      String(row.clicodigo),
      {
        clinome: normalizeText(row.clinomefant || row.clirazsocial),
        gclcodigo: row.gclcodigo != null ? Number(row.gclcodigo) : null,
      },
    ])
  );
  const sellerMap = new Map(
    sellers.map((row) => [String(row.funcodigo), normalizeText(row.funnome)])
  );

  const orderIds = [];
  const orderMap = new Map();
  for (const row of orders) {
    const orderId = Number(row.id_pedido);
    if (!Number.isFinite(orderId)) continue;
    const clientInfo = clientMap.get(String(row.clicodigo)) || { clinome: "", gclcodigo: null };
    orderIds.push(orderId);
    orderMap.set(String(orderId), {
      id_pedido: orderId,
      pedcodigo: String(row.pedcodigo || "").trim(),
      clicodigo: row.clicodigo != null ? Number(row.clicodigo) : null,
      clinome: clientInfo.clinome,
      gclcodigo: clientInfo.gclcodigo,
      vendedor_codigo: row.funcodigo != null ? Number(row.funcodigo) : null,
      vendedor_nome: sellerMap.get(String(row.funcodigo)) || "",
      emitted: parseLocalDateTime(row.peddtemis),
      expected: parseLocalDateTime(combineDateTime(row.pedpzentre, row.pedhrentre)),
      delivered: parseLocalDateTime(combineDateTime(row.peddtsaida, row.pedhrsaida)),
    });
  }

  const latestCellMap = new Map();
  const fallbackCellMap = new Map();
  const quantityMap = new Map();
  const roteiroCacheMap = new Map();

  for (let index = 0; index < orderIds.length; index += 250) {
    const chunkIds = orderIds.slice(index, index + 250);

    const [latestCellRows, fallbackRows, productQuantityRows, serviceQuantityRows, roteiroRows] = await Promise.all([
      pgQuery(
        pool,
        `
          select distinct on (ac.id_pedido)
            ac.id_pedido,
            lp.lpdescricao::text as celula,
            ac.jbcodigo::text as caixa
          from acoped ac
          left join localped lp on lp.lpcodigo = ac.lpcodigo
          where ac.id_pedido = any($1::bigint[])
          order by ac.id_pedido, ac.apdata desc nulls last, ac.aphora desc nulls last
        `,
        [chunkIds]
      ),
      pgQuery(
        pool,
        `
          select distinct on (rq.pdccodigo)
            rq.pdccodigo as id_pedido,
            al.alxdescricao::text as estoque_descricao,
            rq.reqentsai,
            rq.dptcodigo
          from requi rq
          left join almox al on al.dptcodigo = rq.dptcodigo
          where rq.pdccodigo = any($1::bigint[])
          order by rq.pdccodigo, rq.reqdata desc nulls last, rq.reqhora desc nulls last, rq.reqcodigo desc
        `,
        [chunkIds]
      ),
      pgQuery(
        pool,
        `
          select
            id_pedido,
            coalesce(sum(pdpqtdade)::numeric, 0) as quantidade_total
          from pdprd
          where id_pedido = any($1::bigint[])
          group by id_pedido
        `,
        [chunkIds]
      ),
      pgQuery(
        pool,
        `
          select
            id_pedido,
            coalesce(sum(pdsqtdade)::numeric, 0) as quantidade_total
          from pdser
          where id_pedido = any($1::bigint[])
          group by id_pedido
        `,
        [chunkIds]
      ),
      pgQuery(
        pool,
        `
          select
            id_pedido,
            roteiro_resumo,
            roteiro_json
          from pedido_roteiro_cache
          where id_pedido = any($1::bigint[])
        `,
        [chunkIds]
      ),
    ]);

    for (const row of latestCellRows) {
      latestCellMap.set(String(row.id_pedido), {
        current_cell: normalizeText(row.celula),
        caixa: normalizeText(row.caixa),
      });
    }

    for (const row of fallbackRows) {
      const currentCell =
        normalizeText(row.estoque_descricao) || (row.reqentsai === "S" ? "Saida" : row.dptcodigo != null ? `Depto ${row.dptcodigo}` : "");
      fallbackCellMap.set(String(row.id_pedido), currentCell);
    }

    for (const row of [...productQuantityRows, ...serviceQuantityRows]) {
      const key = String(row.id_pedido);
      quantityMap.set(key, (quantityMap.get(key) || 0) + (Number(row.quantidade_total) || 0));
    }

    for (const row of roteiroRows) {
      let roteiro = row.roteiro_json;
      if (typeof roteiro === "string") {
        try {
          roteiro = JSON.parse(roteiro);
        } catch {
          roteiro = [];
        }
      }

      roteiroCacheMap.set(String(row.id_pedido), {
        roteiro_resumo: String(row.roteiro_resumo || "").trim(),
        roteiro_json: Array.isArray(roteiro) ? roteiro : [],
      });
    }
  }

  const cacheRows = [];
  for (const [orderId, order] of orderMap.entries()) {
    const currentCellInfo = latestCellMap.get(orderId);
    const fallbackCell = fallbackCellMap.get(orderId);
    const resolvedStatus = resolveStatus(order.expected, order.delivered, now);
    const roteiroCache = roteiroCacheMap.get(orderId) || { roteiro_resumo: "", roteiro_json: [] };

    cacheRows.push({
      id_pedido: order.id_pedido,
      pedcodigo: order.pedcodigo,
      clicodigo: order.clicodigo,
      clinome: order.clinome,
      gclcodigo: order.gclcodigo,
      vendedor_codigo: order.vendedor_codigo,
      vendedor_nome: order.vendedor_nome,
      emissao: order.emitted ? order.emitted.toISOString() : null,
      previsto: order.expected ? order.expected.toISOString() : null,
      saida: order.delivered ? order.delivered.toISOString() : null,
      quantidade: quantityMap.get(orderId) || 0,
      status: resolvedStatus,
      current_cell: currentCellInfo?.current_cell || fallbackCell || (order.delivered ? "PEDIDO FATURADO" : "-"),
      caixa: currentCellInfo?.caixa || "-",
      indice: orderIsDelayed(order.expected, order.delivered, now) ? 0 : 100,
      delay_rank: buildDelayRank(order.expected, order.delivered, now),
      status_priority: buildStatusPriority(resolvedStatus),
      row_tone: resolvedStatus === "delayed" || resolvedStatus === "delayed_completed" ? "danger" : "success",
      roteiro_resumo: roteiroCache.roteiro_resumo,
      roteiro_json: roteiroCache.roteiro_json,
      updated_at: new Date().toISOString(),
    });
  }

  await withPgTransaction(async (client) => {
    await client.query(
      `
        delete from public.pedido_dashboard_cache
        where emissao >= $1
      `,
      [`${fromDate}T00:00:00`]
    );

    await insertPgRowsInBatches(
      client,
      "public.pedido_dashboard_cache",
      [
        "id_pedido",
        "pedcodigo",
        "clicodigo",
        "clinome",
        "gclcodigo",
        "vendedor_codigo",
        "vendedor_nome",
        "emissao",
        "previsto",
        "saida",
        "quantidade",
        "status",
        "current_cell",
        "caixa",
        "indice",
        "delay_rank",
        "status_priority",
        "row_tone",
        "roteiro_resumo",
        "roteiro_json",
        "updated_at"
      ],
      cacheRows,
      (row) => [
        row.id_pedido,
        row.pedcodigo,
        row.clicodigo,
        row.clinome,
        row.gclcodigo,
        row.vendedor_codigo,
        row.vendedor_nome,
        row.emissao,
        row.previsto,
        row.saida,
        row.quantidade,
        row.status,
        row.current_cell,
        row.caixa,
        row.indice,
        row.delay_rank,
        row.status_priority,
        row.row_tone,
        row.roteiro_resumo,
        JSON.stringify(row.roteiro_json || []),
        row.updated_at,
      ],
      250
    );
  });

  log(`Cache    : pedido_dashboard_cache atualizado para ${cacheRows.length.toLocaleString("pt-BR")} pedido(s).`);
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
  const batchRows =
    primaryKeys.length > 0 ? dedupeRowsByPrimaryKeys(rows, primaryKeys) : rows;

  if (mode === "upsert" && primaryKeys.length > 0) {
    const { error } = await supabase.from(tableName).upsert(batchRows, {
      onConflict: primaryKeys.join(","),
      ignoreDuplicates: false,
      defaultToNull: true,
    });

    if (error) {
      throw new Error(`Supabase ${tableName}: ${error.message}`);
    }

    return;
  }

  let query = supabase.from(tableName).upsert(batchRows, {
    ignoreDuplicates: true,
    defaultToNull: true,
  });

  if (primaryKeys.length > 0) {
    query = supabase.from(tableName).upsert(batchRows, {
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

function dedupeRowsByPrimaryKeys(rows, primaryKeys) {
  const uniqueRows = new Map();

  for (const row of rows) {
    const key = primaryKeys.map((column) => JSON.stringify(row?.[column] ?? null)).join("|");
    uniqueRows.set(key, row);
  }

  return Array.from(uniqueRows.values());
}

async function syncManualTable(db, supabase, tableName, definition, options) {
  const normalizedTable = normalizeName(definition.targetTable || tableName);
  const primaryKeys = (definition.primaryKeys || []).map((key) => normalizeName(key));
  if (String(tableName || "").toUpperCase() === "CLIENCRM") {
    await ensureCliencrmTable(supabase);
  }
  const rows = await fbQuery(db, definition.query);

  process.stdout.write(`  ${tableName} -> ${normalizedTable}: `);

  const normalizedRows = rows
    .map((row) => normalizeRow(row))
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
  const heavyTable = options.heavyTables.has(tableName.toUpperCase());
  const fetchBatch = heavyTable ? options.heavyFetchBatch : options.fetchBatch;
  const insertBatch = heavyTable ? options.heavyInsertBatch : options.insertBatch;
  const whereClause = buildOpenEndedWhereClause(dateFilter, linkedDateFilter);

  const filterLabel = dateFilter
    ? ` [>= ${dateFilter.from}]`
    : linkedDateFilter
      ? ` [via ${linkedDateFilter.parentTable}.${linkedDateFilter.parentDateColumn} >= ${linkedDateFilter.from}]`
      : "";

  process.stdout.write(`  ${tableName} -> ${normalizedTable}${filterLabel}: `);

  let totalRows = 0;
  let pendingRows = [];
  const windows = heavyTable ? buildProcessingWindows(dateFilter, linkedDateFilter, options.heavyWindowDays) : [null];

  async function flushPending() {
    if (pendingRows.length === 0 || options.dryRun) return;
    await writeBatch(supabase, normalizedTable, pendingRows, primaryKeys, writeMode);
    pendingRows = [];
    process.stdout.write(".");
  }

  for (const window of windows) {
    const effectiveWhereClause = window
      ? buildWindowedWhereClause(dateFilter, linkedDateFilter, window.start, window.end)
      : whereClause;

    let skip = 0;
    while (true) {
      const rows = await fbQuery(
        db,
        `SELECT FIRST ${fetchBatch} SKIP ${skip} * FROM "${tableName}" ${effectiveWhereClause}`
      );

      if (rows.length === 0) break;

      for (const row of rows) {
        const normalized = normalizeRow(sanitizeRowForTable(tableName, row));
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
  const heavyTables = new Set(parseList(process.env.SYNC_HEAVY_TABLES || "ACOPED,PDPRD,PEDID,REQUI"));
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
    if (!dryRun) {
      await ensureRoteiroCacheTable(supabase);
      await ensureDashboardCacheTable(supabase);
    }

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
      heavyFetchBatch: Number(process.env.SYNC_HEAVY_FETCH_BATCH || 100),
      heavyInsertBatch: Number(process.env.SYNC_HEAVY_INSERT_BATCH || 50),
      heavyWindowDays: Number(process.env.SYNC_HEAVY_WINDOW_DAYS || 7),
      dateFilters: effectiveFilters.dateFilters,
      linkedDateFilters: effectiveFilters.linkedDateFilters,
      upsertTables,
      heavyTables,
    };

    let ok = 0;
    let failed = 0;
    const succeededTables = new Set();
    const failedTables = new Set();
    let totalRows = 0;
    const startedAt = Date.now();

    for (const table of tables) {
      try {
        totalRows += await syncTable(db, supabase, table, options);
        ok += 1;
        succeededTables.add(String(table || "").toUpperCase());
      } catch (error) {
        failed += 1;
        failedTables.add(String(table || "").toUpperCase());
        log(`  ERRO ${table}: ${error.message}`);
      }
    }

    for (const table of manualTablesToSync) {
      try {
        totalRows += await syncManualTable(db, supabase, table, getManualTableDefinition(table), options);
        ok += 1;
        succeededTables.add(String(table || "").toUpperCase());
      } catch (error) {
        failed += 1;
        failedTables.add(String(table || "").toUpperCase());
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
    const requestedSet = new Set(requestedTables.map((table) => String(table || "").toUpperCase()));
    const shouldRebuildRouteCache = tables.some((table) =>
      ["PEDID", "ACOPED", "JBXROTEIRO", "ALMOX"].includes(String(table || "").toUpperCase())
    );
    const shouldRebuildDashboardCache = tables.some((table) =>
      ["PEDID", "ACOPED", "REQUI", "PDPRD", "PDSER", "CLIEN", "FUNCIO", "LOCALPED", "JBXROTEIRO", "ALMOX"].includes(String(table || "").toUpperCase())
    );

    const routeCacheDependencies = ["PEDID", "ACOPED", "JBXROTEIRO"];
    const dashboardCacheDependencies = ["PEDID", "ACOPED", "REQUI", "PDPRD", "PDSER"];
    const dependenciesSucceeded = (dependencies) =>
      dependencies
        .filter((table) => requestedSet.has(table))
        .every((table) => succeededTables.has(table) && !failedTables.has(table));

    if (!dryRun && ok > 0 && (shouldRebuildRouteCache || shouldRebuildDashboardCache)) {
      const cacheFromDate = incrementalEnabled
        ? dateDaysAgo(Number(process.env.SYNC_RECENT_DAYS || 30))
        : cleanEnvValue(process.env.SYNC_DATE_FROM || "2025-01-01");

      if (shouldRebuildRouteCache && dependenciesSucceeded(routeCacheDependencies)) {
        log(`Cache    : iniciando rebuild de pedido_roteiro_cache desde ${cacheFromDate}`);
        try {
          await rebuildRoteiroCache(supabase, cacheFromDate);
        } catch (error) {
          log(`Cache    : erro no pedido_roteiro_cache: ${error.message}`);
        }
      } else if (shouldRebuildRouteCache) {
        log("Cache    : pedido_roteiro_cache ignorado nesta execucao por falhas nas tabelas-base.");
      }

      if (shouldRebuildDashboardCache && dependenciesSucceeded(dashboardCacheDependencies)) {
        log(`Cache    : iniciando rebuild de pedido_dashboard_cache desde ${cacheFromDate}`);
        try {
          await rebuildDashboardCache(supabase, cacheFromDate);
        } catch (error) {
          log(`Cache    : erro no pedido_dashboard_cache: ${error.message}`);
        }
      } else if (shouldRebuildDashboardCache) {
        log("Cache    : pedido_dashboard_cache ignorado nesta execucao por falhas nas tabelas-base.");
      }
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
