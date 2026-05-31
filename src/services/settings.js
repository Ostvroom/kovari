import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../../data");
const settingsPath = join(dataDir, "settings.json");

let cache = null;

export function getSettingsPath() {
  return settingsPath;
}

export function loadSettings(defaults) {
  if (cache) return cache;

  mkdirSync(dataDir, { recursive: true });

  if (!existsSync(settingsPath)) {
    cache = structuredClone(defaults);
    saveSettings(cache);
    return cache;
  }

  const stored = JSON.parse(readFileSync(settingsPath, "utf8"));
  const merged = { ...defaults.verification, ...stored.verification };

  if (merged.serverLocked === undefined && merged.waitingRoomLocked !== undefined) {
    merged.serverLocked = merged.waitingRoomLocked;
  }
  if (merged.accessCode === undefined && merged.waitingRoomCode !== undefined) {
    merged.accessCode = merged.waitingRoomCode;
  }

  cache = { verification: merged };
  return cache;
}

export function saveSettings(next) {
  cache = next;
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(next, null, 2));
}

export function patchVerification(defaults, patch) {
  cache = null;
  const current = loadSettings(defaults);
  current.verification = { ...current.verification, ...patch };
  saveSettings(current);
  return current.verification;
}
