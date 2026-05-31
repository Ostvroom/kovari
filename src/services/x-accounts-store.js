import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const filePath = join(dirname(fileURLToPath(import.meta.url)), "../../data/x-accounts.json");
let cache = null;

export function loadXAccounts() {
  if (cache) return cache;
  mkdirSync(dirname(filePath), { recursive: true });
  if (!existsSync(filePath)) {
    cache = { users: {} };
    saveXAccounts(cache);
    return cache;
  }
  cache = JSON.parse(readFileSync(filePath, "utf8"));
  if (!cache.users) cache.users = {};
  return cache;
}

export function saveXAccounts(data) {
  cache = data;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function getXAccount(discordUserId) {
  return loadXAccounts().users[String(discordUserId)] ?? null;
}

export function setXAccount(discordUserId, username, meta = {}) {
  const data = loadXAccounts();
  const clean = (meta.username ?? username).trim().replace(/^@/, "");
  data.users[String(discordUserId)] = {
    username: clean,
    userId: meta.userId ?? null,
    connectedAt: new Date().toISOString(),
  };
  saveXAccounts(data);
  return data.users[String(discordUserId)];
}

export function removeXAccount(discordUserId) {
  const data = loadXAccounts();
  delete data.users[String(discordUserId)];
  saveXAccounts(data);
}

export function isUsernameTaken(username, exceptDiscordId) {
  const target = username.trim().replace(/^@/, "").toLowerCase();
  for (const [id, acc] of Object.entries(loadXAccounts().users)) {
    if (id === String(exceptDiscordId)) continue;
    if (acc.username.toLowerCase() === target) return true;
  }
  return false;
}
