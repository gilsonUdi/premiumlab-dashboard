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
     WHERE RDB$SYSTEM_FLAG = 0 AND RDB$VIEW_BLR IS NULL
     ORDER BY RDB$RELATION_NAME`
  );

  const all = rows.map((row) => String(row.TABLE_NAME || "").trim()).filter(Boolean);
  if (filterList.length === 0) return all;

  const wanted = new Set(filterList.map((name) => name.toUpperCase()));
  return all.filter((name) => wanted.has(name.toUpperCase()));
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
  const from = recentDays > 0 ? dateDaysAgo(recentDays) : cleanEnvValue(process.env.SYNC_DATE_FROM || "2025-01-01");

  const entries = parseList(process.env.SYNC_LINKED_DATE_TABLES).map((item) => {
    const [table, foreignKey, parentTable, parentDateColumn] = item.split(":").map((part) => part.trim());
    return [
      table.toUpperCase(),
      {
        foreignKey,
        parentTable,
        parentDateColumn,
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

function getTableArg() {
  const index = args.indexOf("--table");
  return index === -1 ? null : args[index + 1];
}

function envIsTrue(name) {
  return String(process.env[name] || "").trim().toLowerCase() === "true";
}

function getSupabase() {
  const url = cleanEnvValue(process.env.SUPABASE_URL);
  const key = cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function insertOnlyBatch(supabase, tableName, rows, primaryKeys) {
  if (rows.length === 0) return;

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

async function syncTable(db, supabase, tableName, options) {
  const normalizedTable = normalizeName(tableName);
  const dateFilter = options.dateFilters[tableName.toUpperCase()] || null;
  const linkedDateFilter = options.linkedDateFilters[tableName.toUpperCase()] || null;
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
    await insertOnlyBatch(supabase, normalizedTable, pendingRows, primaryKeys);
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
    await insertOnlyBatch(supabase, normalizedTable, pendingRows, primaryKeys);
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
  const dateFilters = parseDateFilters();
  const linkedDateFilters = parseLinkedDateFilters();
  const dateTablesOnly = args.includes("--date-tables-only") || envIsTrue("SYNC_DATE_TABLES_ONLY");
  const filterList = tableArg ? [tableArg] : parseList(process.env.SYNC_TABLES);
  const tablesToSync =
    dateTablesOnly && !tableArg
      ? [...new Set([...Object.keys(dateFilters), ...Object.keys(linkedDateFilters)])]
      : filterList;

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
  log(`Tabelas  : ${tablesToSync.length > 0 ? tablesToSync.join(", ") : "todas"}`);
  if (dateTablesOnly && !tableArg) log("Modo     : somente tabelas com filtro de data");
  log("Escrita  : insert-only (nao apaga e nao sobrescreve registros existentes)");
  if (dryRun) log("Modo     : dry-run");

  const db = await fbConnect(fbOptions);
  const supabase = getSupabase();

  try {
    const tables = await getTableNames(db, tablesToSync);
    if (tables.length === 0) {
      log("Nenhuma tabela encontrada para sincronizar.");
      return;
    }

    const options = {
      dryRun,
      fetchBatch: Number(process.env.SYNC_FETCH_BATCH || 1000),
      insertBatch: Number(process.env.SYNC_INSERT_BATCH || 500),
      dateFilters,
      linkedDateFilters,
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

    const summary = {
      ok: failed === 0,
      tablesOk: ok,
      tablesFailed: failed,
      totalRows,
      elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
      finishedAt: timestamp(),
    };

    log(`Concluido: ${ok} tabela(s) OK, ${failed} erro(s), ${totalRows.toLocaleString("pt-BR")} linha(s).`);
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
