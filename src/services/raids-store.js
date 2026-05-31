import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const filePath = join(dirname(fileURLToPath(import.meta.url)), "../../data/raids.json");
let cache = null;

export function loadRaids() {
  if (cache) return cache;
  mkdirSync(dirname(filePath), { recursive: true });
  if (!existsSync(filePath)) {
    cache = { raids: {} };
    saveRaids(cache);
    return cache;
  }
  cache = JSON.parse(readFileSync(filePath, "utf8"));
  if (!cache.raids) cache.raids = {};
  return cache;
}

export function saveRaids(data) {
  cache = data;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function newRaidId() {
  return randomBytes(4).toString("hex");
}

export function getRaid(raidId) {
  return loadRaids().raids[raidId] ?? null;
}

export function saveRaid(raid) {
  const data = loadRaids();
  data.raids[raid.id] = raid;
  saveRaids(data);
  return raid;
}

export function listActiveRaids() {
  return Object.values(loadRaids().raids).filter((r) => r.active);
}
