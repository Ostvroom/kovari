import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../../data");
const filePath = join(dataDir, "link-protection.json");

/** @typedef {'full' | 'medium' | 'default'} LinkProtectionLevel */

let cache = null;

function seedFromEnv() {
  const channels = {};
  for (const id of config.linkFullChannelIds) channels[id] = "full";
  for (const id of config.linkMediumChannelIds) {
    if (!channels[id]) channels[id] = "medium";
  }
  return channels;
}

export function loadLinkProtection() {
  if (cache) return cache;

  mkdirSync(dataDir, { recursive: true });
  const envSeed = seedFromEnv();

  if (!existsSync(filePath)) {
    cache = { channels: envSeed };
    saveLinkProtection(cache);
    return cache;
  }

  const stored = JSON.parse(readFileSync(filePath, "utf8"));
  cache = {
    channels: { ...envSeed, ...stored.channels },
  };
  return cache;
}

export function saveLinkProtection(data) {
  cache = data;
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/** @returns {LinkProtectionLevel} */
export function getChannelLevel(channelId) {
  const level = loadLinkProtection().channels[channelId];
  if (level === "full" || level === "medium") return level;
  return "default";
}

/** @param {LinkProtectionLevel} level */
export function setChannelLevel(channelId, level) {
  const data = loadLinkProtection();
  data.channels[channelId] = level;
  saveLinkProtection(data);
  return level;
}

export function clearChannelLevel(channelId) {
  const data = loadLinkProtection();
  delete data.channels[channelId];
  saveLinkProtection(data);
}

export function listChannelLevels() {
  return { ...loadLinkProtection().channels };
}
