import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const filePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../data/waiting-codes.json",
);

let cache = null;

const defaultData = () => ({
  /** code (lowercase) → { userId, createdAt, used } */
  codes: {},
  /** userId → code (lowercase) */
  byUser: {},
});

export function loadWaitingCodes() {
  if (cache) return cache;
  mkdirSync(dirname(filePath), { recursive: true });
  if (!existsSync(filePath)) {
    cache = defaultData();
    saveWaitingCodes(cache);
    return cache;
  }
  cache = { ...defaultData(), ...JSON.parse(readFileSync(filePath, "utf8")) };
  if (!cache.codes) cache.codes = {};
  if (!cache.byUser) cache.byUser = {};
  return cache;
}

export function saveWaitingCodes(data) {
  cache = data;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function normalizeCode(input) {
  return String(input).trim().toLowerCase();
}

/** Create a personal code for this user (replaces any previous unused code). */
export function issueWaitingRoomCode(userId, customCode) {
  const data = loadWaitingCodes();
  const key = String(userId);
  const old = data.byUser[key];
  if (old) delete data.codes[old];

  const code = customCode ? normalizeCode(customCode) : randomBytes(4).toString("hex");
  if (code.length < 4 || code.length > 32) {
    throw new Error("Code must be 4–32 characters.");
  }
  const existing = data.codes[code];
  if (existing && existing.userId !== key && !existing.used) {
    throw new Error("That code is already assigned to someone else.");
  }

  data.codes[code] = {
    userId: key,
    createdAt: new Date().toISOString(),
    used: false,
  };
  data.byUser[key] = code;
  saveWaitingCodes(data);
  return code;
}

export function getWaitingRoomCodeForUser(userId) {
  const data = loadWaitingCodes();
  const code = data.byUser[String(userId)];
  if (!code) return null;
  const record = data.codes[code];
  if (!record || record.used) return null;
  return code;
}

export function countActiveWaitingCodes() {
  const data = loadWaitingCodes();
  return Object.values(data.codes).filter((r) => r && !r.used).length;
}

/**
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function redeemWaitingRoomCode(userId, input) {
  const code = normalizeCode(input);
  if (code.length < 4) {
    return { ok: false, message: "Invalid access code." };
  }

  const data = loadWaitingCodes();
  const record = data.codes[code];
  if (!record) {
    return { ok: false, message: "Invalid access code." };
  }
  if (record.used) {
    return { ok: false, message: "This code was already used." };
  }
  if (record.userId !== String(userId)) {
    return {
      ok: false,
      message: "This code is not yours. Use the code staff gave **you**.",
    };
  }

  record.used = true;
  delete data.byUser[record.userId];
  saveWaitingCodes(data);
  return { ok: true };
}

export function clearWaitingRoomCode(userId) {
  const data = loadWaitingCodes();
  const key = String(userId);
  const code = data.byUser[key];
  if (code) delete data.codes[code];
  delete data.byUser[key];
  saveWaitingCodes(data);
}
