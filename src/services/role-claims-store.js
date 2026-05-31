import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const filePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../data/role-claims.json",
);

let cache = null;

function emptyStore() {
  return {
    bannerUrl: config.roleClaimBannerUrl ?? null,
    entries: [],
  };
}

export function loadRoleClaims() {
  if (cache) return cache;

  const dataDir = dirname(filePath);
  mkdirSync(dataDir, { recursive: true });

  if (!existsSync(filePath)) {
    cache = emptyStore();
    saveRoleClaims(cache);
    return cache;
  }

  const stored = JSON.parse(readFileSync(filePath, "utf8"));
  cache = {
    bannerUrl: stored.bannerUrl ?? config.roleClaimBannerUrl ?? null,
    entries: Array.isArray(stored.entries) ? stored.entries : [],
  };
  return cache;
}

export function saveRoleClaims(data) {
  cache = data;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function listRoleEntries() {
  return [...loadRoleClaims().entries];
}

export function addRoleEntry(entry) {
  const data = loadRoleClaims();
  const idx = data.entries.findIndex((e) => e.roleId === entry.roleId);
  if (idx >= 0) data.entries[idx] = entry;
  else data.entries.push(entry);
  saveRoleClaims(data);
  return entry;
}

export function removeRoleEntry(roleId) {
  const data = loadRoleClaims();
  data.entries = data.entries.filter((e) => e.roleId !== roleId);
  saveRoleClaims(data);
}

export function setRoleClaimBanner(url) {
  const data = loadRoleClaims();
  data.bannerUrl = url?.trim() || null;
  saveRoleClaims(data);
  return data.bannerUrl;
}
