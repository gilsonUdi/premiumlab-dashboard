#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Firebird = require("node-firebird");

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

function requiredEnv(names) {
  const missing = names.filter((name) => !process.env[name]);
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

function normalizeValue(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return null;
  return value;
}

function normalizeRow(row) {
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeName(key)] = normalizeValue(value);
  }
  return normalized;
}

function rowIdentity(row, primaryKeys) {
  const keys = primaryKeys.length > 0 ? primaryKeys : Object.keys(row).sort();
  const identity = keys.map((key) => normalizeValue(row[key])).join("|");
  if (primaryKeys.length > 0) return identity;
  return crypto.createHash("sha1").update(JSON.stringify(row)).digest("hex");
}

function bucketIndex(identity, bucketCount) {
  const digest = crypto.createHash("sha1").update(String(identity)).digest("hex");
  return parseInt(digest.slice(0, 8), 16) % bucketCount;
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

async function getTableColumns(db, tableName) {
  const rows = await fbQuery(
    db,
    `SELECT TRIM(RF.RDB$FIELD_NAME) AS COLUMN_NAME
     FROM RDB$RELATION_FIELDS RF
     WHERE TRIM(RF.RDB$RELATION_NAME) = ?
     ORDER BY RF.RDB$FIELD_POSITION`,
    [tableName]
  );

  return rows.map((row) => String(row.COLUMN_NAME || "").trim()).filter(Boolean);
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

  return rows.map((row) => String(row.COLUMN_NAME || "").trim()).filter(Boolean);
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseDateFilters() {
  const recentDays = Number(process.env.SYNC_RECENT_DAYS || 0);
  const from = recentDays > 0 ? dateDaysAgo(recentDays) : (process.env.SYNC_DATE_FROM || "2025-01-01");
  const entries = parseList(process.env.SYNC_DATE_COLUMNS).map((item) => {
    const [table, column] = item.split(":").map((part) => part.trim());
    return [table.toUpperCase(), { column, from }];
  });
  return Object.fromEntries(entries.filter(([table, filter]) => table && filter.column));
}

function parseIndexColumns() {
  return Object.fromEntries(
    parseList(process.env.SYNC_INDEX_COLUMNS)
      .map((item) => item.split(":").map((part) => part.trim().toLowerCase()))
      .filter(([table, column]) => table && column)
      .map(([table, column]) => [table, column])
  );
}

function dateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function getTableArg() {
  const index = args.indexOf("--table");
  return index === -1 ? null : args[index + 1];
}

function envIsTrue(name) {
  return String(process.env[name] || "").trim().toLowerCase() === "true";
}

function upstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  return {
    url: url.replace(/\/+$/, ""),
    token,
    prefix: (process.env.UPSTASH_KEY_PREFIX || "premium:firebird").replace(/:+$/, ""),
  };
}

async function upstashCommand(command) {
  const { url, token } = upstashConfig();
  const response = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([command]),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upstash HTTP ${response.status}: ${text}`);
  }

  const payload = await response.json();
  const result = payload?.[0];
  if (result?.error) throw new Error(`Upstash: ${result.error}`);
  return result?.result;
}

async function upstashPipeline(commands) {
  if (commands.length === 0) return [];

  const { url, token } = upstashConfig();
  const response = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upstash HTTP ${response.status}: ${text}`);
  }

  const payload = await response.json();
  for (const item of payload) {
    if (item?.error) throw new Error(`Upstash: ${item.error}`);
  }
  return payload.map((item) => item.result);
}

function keyFor(...parts) {
  return [upstashConfig().prefix, ...parts.map((part) => String(part))].join(":");
}

async function clearOldChunks(tableKey, oldChunkCount, newChunkCount) {
  const commands = [];
  for (let index = newChunkCount; index < oldChunkCount; index++) {
    commands.push(["DEL", `${tableKey}:chunk:${index}`]);
  }
  await upstashPipeline(commands);
}

async function countBucketRows(tableKey, bucketCount) {
  const commands = [];
  for (let index = 0; index < bucketCount; index++) {
    commands.push(["HLEN", `${tableKey}:rows:${index}`]);
  }

  const counts = await upstashPipeline(commands);
  return counts.reduce((sum, count) => sum + Number(count || 0), 0);
}

async function syncTable(db, tableName, options) {
  const normalizedTable = normalizeName(tableName);
  const tableKey = keyFor("table", normalizedTable);
  const metaKey = `${tableKey}:meta`;
  const legacyRowsKey = `${tableKey}:rows`;
  const fetchBatch = options.fetchBatch;
  const chunkRows = options.chunkRows;
  const bucketCount = options.bucketCount;
  const indexColumn = options.indexColumns[normalizedTable] || null;
  const dateFilter = options.dateFilters[tableName.toUpperCase()] || null;
  const whereClause = dateFilter ? `WHERE "${dateFilter.column}" >= '${dateFilter.from}'` : "";
  const columns = await getTableColumns(db, tableName);
  const primaryKeys = await getPrimaryKeys(db, tableName);
  const useMergeMode = options.mergeMode || Boolean(dateFilter);
  const previousMeta = await upstashCommand(["GET", metaKey]).then((value) => {
    try {
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  });

  if (useMergeMode && !options.dryRun && previousMeta?.storageMode !== "hash-merge-buckets") {
    await upstashCommand(["DEL", legacyRowsKey]);
  }

  let skip = 0;
  let totalRows = 0;
  let chunkIndex = 0;
  let currentChunk = [];

  process.stdout.write(`  ${tableName} -> ${normalizedTable}${dateFilter ? ` [>= ${dateFilter.from}]` : ""}: `);

  async function flushChunk() {
    if (currentChunk.length === 0) return;
    if (!options.dryRun) {
      if (useMergeMode) {
        const commandsByBucket = new Map();
        for (const item of currentChunk) {
          const index = bucketIndex(item.id, bucketCount);
          const rowsKey = `${tableKey}:rows:${index}`;
          const commands = commandsByBucket.get(rowsKey) || [];
          commands.push(["HSET", rowsKey, item.id, JSON.stringify(item.row)]);
          if (indexColumn && item.row[indexColumn] != null && item.row[indexColumn] !== "") {
            commands.push(["SADD", `${tableKey}:index:${indexColumn}:${item.row[indexColumn]}`, item.id]);
          }
          commandsByBucket.set(rowsKey, commands);
        }

        for (const commands of commandsByBucket.values()) {
          await upstashPipeline(commands);
        }
      } else {
        await upstashCommand(["SET", `${tableKey}:chunk:${chunkIndex}`, JSON.stringify(currentChunk)]);
      }
    }
    chunkIndex++;
    currentChunk = [];
    process.stdout.write(".");
  }

  while (true) {
    const rows = await fbQuery(
      db,
      `SELECT FIRST ${fetchBatch} SKIP ${skip} * FROM "${tableName}" ${whereClause}`
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      const normalizedRow = normalizeRow(row);
      currentChunk.push(
        useMergeMode
          ? { id: rowIdentity(row, primaryKeys), row: normalizedRow }
          : normalizedRow
      );
      totalRows++;
      if (currentChunk.length >= chunkRows) await flushChunk();
    }

    if (rows.length < fetchBatch) break;
    skip += rows.length;
  }

  await flushChunk();

  const meta = {
    source: "firebird",
    table: tableName,
    key: normalizedTable,
    storageMode: useMergeMode ? "hash-merge-buckets" : "snapshot-chunks",
    rowsKeyPattern: useMergeMode ? `${tableKey}:rows:{bucket}` : null,
    bucketCount: useMergeMode ? bucketCount : null,
    indexColumn: useMergeMode ? indexColumn : null,
    columns,
    primaryKeys,
    syncedRowCount: totalRows,
    chunkCount: chunkIndex,
    chunkRows,
    dateFilter,
    syncedAt: timestamp(),
  };

  if (!options.dryRun) {
    if (useMergeMode) {
      meta.totalStoredRows = await countBucketRows(tableKey, bucketCount);
    }

    await upstashPipeline([
      ["SET", metaKey, JSON.stringify(meta)],
      ["SADD", keyFor("tables"), normalizedTable],
      ["SET", keyFor("sync", "last_run"), JSON.stringify({
        ok: true,
        table: tableName,
        at: meta.syncedAt,
      })],
    ]);
    if (!useMergeMode) {
      await clearOldChunks(tableKey, Number(previousMeta?.chunkCount || 0), chunkIndex);
    }
  }

  const storedLabel = meta.totalStoredRows != null ? `, ${meta.totalStoredRows.toLocaleString("pt-BR")} armazenada(s)` : "";
  console.log(` ${totalRows.toLocaleString("pt-BR")} linha(s), ${chunkIndex} lote(s)${storedLabel}${options.dryRun ? " [dry-run]" : ""}`);
  return totalRows;
}

async function runOnce() {
  requiredEnv([
    "FIREBIRD_HOST",
    "FIREBIRD_DATABASE",
    "FIREBIRD_PASSWORD",
  ]);
  if (!process.env.UPSTASH_REDIS_REST_URL && !process.env.KV_REST_API_URL) {
    throw new Error("Variavel ausente no .env.local: UPSTASH_REDIS_REST_URL ou KV_REST_API_URL");
  }
  if (!process.env.UPSTASH_REDIS_REST_TOKEN && !process.env.KV_REST_API_TOKEN) {
    throw new Error("Variavel ausente no .env.local: UPSTASH_REDIS_REST_TOKEN ou KV_REST_API_TOKEN");
  }

  const dryRun = args.includes("--dry-run");
  const tableArg = getTableArg();
  const dateFilters = parseDateFilters();
  const dateTablesOnly = args.includes("--date-tables-only") || envIsTrue("SYNC_DATE_TABLES_ONLY");
  const filterList = tableArg ? [tableArg] : parseList(process.env.SYNC_TABLES);
  const tablesToSync = dateTablesOnly && !tableArg ? Object.keys(dateFilters) : filterList;
  const fbOptions = {
    host: process.env.FIREBIRD_HOST,
    port: Number(process.env.FIREBIRD_PORT || 3050),
    database: process.env.FIREBIRD_DATABASE,
    user: process.env.FIREBIRD_USER || "SYSDBA",
    password: process.env.FIREBIRD_PASSWORD,
    lowercase_keys: false,
  };

  log("");
  log("=== Firebird -> Upstash Sync ===");
  log(`Firebird : ${fbOptions.host}:${fbOptions.port} / ${fbOptions.database}`);
  log(`Upstash  : ${upstashConfig().url}`);
  log(`Prefixo  : ${upstashConfig().prefix}`);
  log(`Tabelas  : ${tablesToSync.length > 0 ? tablesToSync.join(", ") : "todas"}`);
  if (dateTablesOnly && !tableArg) log("Modo     : somente tabelas com filtro de data");
  if (dryRun) log("Modo     : dry-run");

  const db = await fbConnect(fbOptions);
  try {
    if (!dryRun) {
      await upstashCommand(["PING"]);
      log("Upstash  : OK");
    }

    const tables = await getTableNames(db, tablesToSync);
    if (tables.length === 0) {
      log("Nenhuma tabela encontrada para sincronizar.");
      return;
    }

    const options = {
      dryRun,
      fetchBatch: Number(process.env.SYNC_FETCH_BATCH || 1000),
      chunkRows: Number(process.env.SYNC_CHUNK_ROWS || 1000),
      bucketCount: Number(process.env.SYNC_BUCKET_COUNT || 64),
      mergeMode: String(process.env.SYNC_MERGE_MODE || "true").toLowerCase() !== "false",
      indexColumns: parseIndexColumns(),
      dateFilters,
    };

    let ok = 0;
    let failed = 0;
    let totalRows = 0;
    const startedAt = Date.now();

    for (const table of tables) {
      try {
        totalRows += await syncTable(db, table, options);
        ok++;
      } catch (error) {
        failed++;
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

    if (!dryRun) {
      await upstashCommand(["SET", keyFor("sync", "last_summary"), JSON.stringify(summary)]);
    }

    log(`Concluido: ${ok} tabela(s) OK, ${failed} erro(s), ${totalRows.toLocaleString("pt-BR")} linha(s).`);
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
