import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const filePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../data/official-links.json",
);

let cache = null;

function defaultEntries() {
  const entries = [];
  if (config.officialXUrl) {
    entries.push({
      label: "X (Twitter)",
      url: config.officialXUrl,
      emoji: "🐦",
    });
  }
  return entries;
}

export function loadOfficialLinks() {
  if (cache) return cache;

  mkdirSync(dirname(filePath), { recursive: true });

  if (!existsSync(filePath)) {
    cache = { entries: defaultEntries() };
    saveOfficialLinks(cache);
    return cache;
  }

  const stored = JSON.parse(readFileSync(filePath, "utf8"));
  cache = {
    entries:
      Array.isArray(stored.entries) && stored.entries.length > 0
        ? stored.entries
        : defaultEntries(),
  };
  return cache;
}

export function saveOfficialLinks(data) {
  cache = data;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function listOfficialLinks() {
  return [...loadOfficialLinks().entries];
}

export function addOfficialLink(entry) {
  const data = loadOfficialLinks();
  const idx = data.entries.findIndex((e) => e.url === entry.url);
  if (idx >= 0) data.entries[idx] = entry;
  else data.entries.push(entry);
  saveOfficialLinks(data);
  return entry;
}
