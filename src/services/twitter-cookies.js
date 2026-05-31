import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const COOKIE_FILE_CANDIDATES = [
  () => process.env.TWITTER_COOKIES_FILE?.trim(),
  () => join(root, "data", "twitter-cookies.json"),
  () => join(root, "twitter-cookies.json"),
  () => join(root, "cookies.json"),
];

function normalizeToDict(data) {
  if (!data) return null;
  if (Array.isArray(data)) {
    const out = {};
    for (const c of data) {
      if (c?.name != null && c?.value != null) out[c.name] = String(c.value);
    }
    return Object.keys(out).length ? out : null;
  }
  if (typeof data === "object") {
    const out = {};
    for (const [k, v] of Object.entries(data)) {
      if (v != null && v !== "") out[k] = String(v);
    }
    return Object.keys(out).length ? out : null;
  }
  return null;
}

function parseCookieString(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("[")) {
    try {
      return normalizeToDict(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }
  const out = {};
  for (const part of trimmed.split(";")) {
    const p = part.trim();
    const eq = p.indexOf("=");
    if (eq > 0) {
      const key = p.slice(0, eq).trim();
      const val = p.slice(eq + 1).trim();
      if (key) out[key] = val;
    }
  }
  return Object.keys(out).length ? out : null;
}

function readCookieFile(filePath) {
  const abs = resolve(filePath);
  if (!existsSync(abs)) return null;
  const raw = readFileSync(abs, "utf8").trim();
  if (!raw) return null;
  try {
    return normalizeToDict(JSON.parse(raw));
  } catch {
    return parseCookieString(raw);
  }
}

/** Load cookies from file or .env; cache on process.env for Python subprocess. */
export function loadTwitterCookies() {
  for (const pick of COOKIE_FILE_CANDIDATES) {
    const path = pick();
    if (!path) continue;
    const dict = readCookieFile(path);
    if (dict) {
      process.env.TWITTER_COOKIES = JSON.stringify(
        Object.entries(dict).map(([name, value]) => ({ name, value })),
      );
      return { dict, source: resolve(path) };
    }
  }

  const fromEnv = parseCookieString(process.env.TWITTER_COOKIES ?? "");
  if (fromEnv) {
    process.env.TWITTER_COOKIES = JSON.stringify(
      Object.entries(fromEnv).map(([name, value]) => ({ name, value })),
    );
    return { dict: fromEnv, source: ".env" };
  }

  return null;
}

let loaded = false;

export function ensureTwitterCookies() {
  if (loaded) return loadTwitterCookies();
  loaded = true;
  const result = loadTwitterCookies();
  if (result) {
    console.log(
      `[kovari] X cookies loaded (${Object.keys(result.dict).length} keys) from ${result.source}`,
    );
  }
  return result;
}
