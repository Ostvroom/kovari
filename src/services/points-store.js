import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const filePath = join(dirname(fileURLToPath(import.meta.url)), "../../data/points.json");
let cache = null;

const defaultConfig = () => ({
  messagePoints: 2,
  messageCooldownSec: 60,
  reactionPoints: 1,
  reactionCooldownSec: 45,
  raidPoints: 25,
  minMessageLength: 3,
  enabledChannelIds: [],
});

const defaultData = () => ({
  config: defaultConfig(),
  users: {},
  shop: [],
  giveaways: {},
});

export function loadPoints() {
  if (cache) return cache;
  mkdirSync(dirname(filePath), { recursive: true });
  if (!existsSync(filePath)) {
    cache = defaultData();
    savePoints(cache);
    return cache;
  }
  cache = { ...defaultData(), ...JSON.parse(readFileSync(filePath, "utf8")) };
  cache.config = { ...defaultConfig(), ...cache.config };
  if (!cache.users) cache.users = {};
  if (!cache.shop) cache.shop = [];
  if (!cache.giveaways) cache.giveaways = {};
  return cache;
}

export function savePoints(data) {
  cache = data;
  mkdirSync(dirname(filePath), { recursive: true });
  try {
    writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("[kovari] Failed to save points.json:", err);
  }
}

export function getMergedPointsConfig() {
  const data = loadPoints();
  return { ...defaultConfig(), ...data.config };
}

export function newShopId() {
  return randomBytes(3).toString("hex");
}

export function newGiveawayId() {
  return randomBytes(4).toString("hex");
}

export function getUserRecord(userId) {
  const data = loadPoints();
  const key = String(userId);
  if (!data.users[key]) {
    data.users[key] = { balance: 0, lifetime: 0 };
  }
  return data.users[key];
}

export function listOpenGiveaways() {
  const data = loadPoints();
  return Object.values(data.giveaways).filter((g) => g && !g.ended);
}
