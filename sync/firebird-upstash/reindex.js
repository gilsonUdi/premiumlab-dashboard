#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const MAX_PIPELINE_COMMANDS = 200;
const MAX_PIPELINE_BYTES = 512 * 1024;
const HASH_SCAN_COUNT = 250;
const DEFAULT_INDEX_COLUMNS = [
  "pedid:peddtemis:date",
  "pedid:pedcodigo:orderCode",
  "pedid:id_pedido:number",
  "pedid:clicodigo:number",
  "requi:reqdata:date",
  "requi:pdccodigo:orderCode",
  "requi:dptcodigo:number",
  "acoped:id_pedido:number",
  "pdprd:id_pedido:number",
  "pdser:id_pedido:number",
].join(",");

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

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}

function normalizePrimaryKeyName(name) {
  return normalizeName(name);
}

function requiredEnv(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Variaveis ausentes no .env.local: ${missing.join(", ")}`);
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

function upstashConfig() {
  const url = cleanEnvValue(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL);
  const token = cleanEnvValue(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN);

  return {
    url: url.replace(/\/+$/, ""),
    token,
    prefix: cleanEnvValue(process.env.UPSTASH_KEY_PREFIX || "premium:premium-lab").replace(/:+$/, ""),
  };
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

function tableKey(table) {
  return `${upstashConfig().prefix}:table:${normalizeName(table)}`;
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

function parseIndexColumns() {
  const grouped = {};
  for (const item of parseList(process.env.SYNC_INDEX_COLUMNS || DEFAULT_INDEX_COLUMNS)) {
    const [table, column, mode] = item.split(":").map((part) => part.trim());
    const normalizedTable = normalizeName(table);
    const normalizedColumn = normalizeName(column);
    if (!normalizedTable || !normalizedColumn) continue;
    if (!grouped[normalizedTable]) grouped[normalizedTable] = [];
    grouped[normalizedTable].push({
      column: normalizedColumn,
      mode: normalizeName(mode || "raw") || "raw",
    });
  }
  return grouped;
}

function extractDateToken(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const match = String(value).trim().match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function normalizeIntegerToken(value) {
  if (value == null) return "";
  const text = String(value).trim();
  if (!text) return "";

  if (/^\d+\.0+$/.test(text)) {
    return text.replace(/\.0+$/, "").replace(/^0+/, "") || "0";
  }

  const numeric = Number(text);
  if (Number.isFinite(numeric) && Number.isInteger(numeric)) {
    return String(numeric).replace(/^0+/, "") || "0";
  }

  return text.replace(/^0+/, "") || "0";
}

function normalizeIndexValue(value, mode) {
  switch (mode) {
    case "date":
      return extractDateToken(value);
    case "number":
    case "ordercode":
      return normalizeIntegerToken(value);
    default:
      return String(value ?? "").trim();
  }
}

function rowIdentity(row, primaryKeys) {
  const keys = primaryKeys.length > 0 ? primaryKeys : Object.keys(row).sort();
  const identity = keys.map((key) => row[key]).join("|");
  if (primaryKeys.length > 0) return identity;
  return crypto.createHash("sha1").update(JSON.stringify(row)).digest("hex");
}

function chunkArray(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function flushCommands(commands) {
  if (commands.length === 0) return;
  await upstashPipeline(commands.splice(0, commands.length));
}

async function scanHashValues(hashKey) {
  const values = [];
  let cursor = "0";

  while (true) {
    const [result] = await upstashPipeline([["HSCAN", hashKey, cursor, "COUNT", HASH_SCAN_COUNT]]);
    const nextCursor = String(result?.[0] ?? "0");
    const flatEntries = result?.[1] || [];

    for (let index = 1; index < flatEntries.length; index += 2) {
      values.push(flatEntries[index]);
    }

    if (nextCursor === "0") break;
    cursor = nextCursor;
  }

  return values;
}

async function getTableMeta(table) {
  const [meta] = await upstashPipeline([["GET", `${tableKey(table)}:meta`]]);
  return parseJson(meta, null);
}

async function syncTableIndexes(table, configs) {
  const meta = await getTableMeta(table);
  if (!meta) throw new Error(`Meta nao encontrada para ${table}`);
  if (meta.storageMode !== "hash-merge-buckets") {
    throw new Error(`Tabela ${table} nao esta em hash-merge-buckets`);
  }

  const primaryKeys = (meta.primaryKeys || []).map(normalizePrimaryKeyName);
  const commands = [];
  let pendingBytes = 0;
  let totalRows = 0;
  const key = tableKey(table);
  const bucketCount = Number(meta.bucketCount || 64);

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const bucketValues = await scanHashValues(`${key}:rows:${bucket}`);
    const rows = bucketValues.map((value) => parseJson(value, null)).filter(Boolean);
    totalRows += rows.length;

    for (const row of rows) {
      const rowId = rowIdentity(row, primaryKeys);
      for (const config of configs) {
        const indexValue = normalizeIndexValue(row[config.column], config.mode);
        if (!indexValue) continue;
        const command = ["SADD", `${key}:index:${config.column}:${indexValue}`, rowId];
        const commandBytes = JSON.stringify(command).length;
        commands.push(command);
        pendingBytes += commandBytes;

        if (commands.length >= MAX_PIPELINE_COMMANDS || pendingBytes >= MAX_PIPELINE_BYTES) {
          await flushCommands(commands);
          pendingBytes = 0;
        }
      }
    }
  }

  await flushCommands(commands);

  meta.indexColumns = configs;
  meta.indexedAt = new Date().toISOString();
  await upstashPipeline([["SET", `${tableKey(table)}:meta`, JSON.stringify(meta)]]);

  console.log(`${table}: ${totalRows.toLocaleString("pt-BR")} linha(s), ${configs.length} indice(s)`);
}

async function main() {
  requiredEnv(["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]);

  const allIndexConfigs = parseIndexColumns();
  const selectedTable = normalizeName(args[args.indexOf("--table") + 1] || "");
  const targetEntries = Object.entries(allIndexConfigs).filter(([table]) => !selectedTable || table === selectedTable);

  if (targetEntries.length === 0) {
    throw new Error("Nenhuma tabela configurada em SYNC_INDEX_COLUMNS para reindexar.");
  }

  console.log(`Upstash: ${upstashConfig().url}`);
  console.log(`Prefixo: ${upstashConfig().prefix}`);

  for (const [table, configs] of targetEntries) {
    await syncTableIndexes(table, configs);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
