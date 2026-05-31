import { PermissionFlagsBits } from "discord.js";
import { config } from "../config.js";
import { alertPointsEarned } from "./points-notify.js";
import {
  getMergedPointsConfig,
  getUserRecord,
  loadPoints,
  savePoints,
} from "./points-store.js";

const messageCooldowns = new Map();
const reactionCooldowns = new Map();

export function isPointsAdmin(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return config.adminRoleIds.some((id) => member.roles.cache.has(id));
}

export function getPointsConfig() {
  return getMergedPointsConfig();
}

/** Channel id + parent (threads) for earn/log eligibility. */
export function resolveEarnChannelIds(channel) {
  if (!channel) return [];
  const ids = [channel.id];
  if (channel.parentId) ids.push(channel.parentId);
  return ids;
}

export function channelEarnsPoints(channel) {
  const channelIds = typeof channel === "string" ? [channel] : resolveEarnChannelIds(channel);

  if (config.pointsEarnChannelIds.length) {
    return channelIds.some((id) => config.pointsEarnChannelIds.includes(id));
  }
  const { enabledChannelIds } = getPointsConfig();
  if (!enabledChannelIds?.length) return true;
  return channelIds.some((id) => enabledChannelIds.includes(id));
}

export function getBalance(userId) {
  return getUserRecord(userId).balance;
}

export function getLeaderboard(limit = 10) {
  const data = loadPoints();
  return Object.entries(data.users)
    .map(([id, u]) => ({ userId: id, balance: u.balance, lifetime: u.lifetime }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, limit);
}

export function addPoints(userId, amount, reason = "") {
  if (amount <= 0) return getBalance(userId);
  const data = loadPoints();
  const key = String(userId);
  if (!data.users[key]) {
    data.users[key] = { balance: 0, lifetime: 0 };
  }
  const user = data.users[key];
  user.balance += amount;
  user.lifetime += amount;
  savePoints(data);
  return user.balance;
}

export function removePoints(userId, amount) {
  if (amount <= 0) return getBalance(userId);
  const data = loadPoints();
  const user = getUserRecord(userId);
  if (user.balance < amount) {
    throw new Error(`Not enough points. You have **${user.balance}**, need **${amount}**.`);
  }
  user.balance -= amount;
  savePoints(data);
  return user.balance;
}

function cooldownKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

export function tryAwardMessagePoints(message) {
  if (!message.guild || message.author.bot || message.system) return null;
  if (!channelEarnsPoints(message.channel)) return null;
  const text = (message.content ?? "").trim();
  const cfg = getPointsConfig();
  if (text.length < cfg.minMessageLength) return null;

  const key = cooldownKey(message.guild.id, message.author.id);
  const now = Date.now();
  const cd = Math.max(0, Number(cfg.messageCooldownSec) || 0) * 1000;
  const last = messageCooldowns.get(key);
  if (last != null && cd > 0 && now - last < cd) return null;

  messageCooldowns.set(key, now);
  const pts = cfg.messagePoints;
  const balance = addPoints(message.author.id, pts, "message");
  void alertPointsEarned({
    guild: message.guild,
    userId: message.author.id,
    amount: pts,
    balance,
    reason: "message",
    channelId: message.channel.id,
    jumpUrl: message.url,
    sourceMessage: message,
  }).catch((err) => console.error("[kovari] points alert failed:", err));
  return { points: pts, balance };
}

export function tryAwardReactionPoints(user, message) {
  if (!message.guild || user.bot) return null;
  if (!channelEarnsPoints(message.channel)) return null;
  if (message.author?.id === user.id) return null;

  const cfg = getPointsConfig();
  const key = cooldownKey(message.guild.id, user.id);
  const now = Date.now();
  const cd = Math.max(0, Number(cfg.reactionCooldownSec) || 0) * 1000;
  const last = reactionCooldowns.get(key);
  if (last != null && cd > 0 && now - last < cd) return null;

  reactionCooldowns.set(key, now);
  const pts = cfg.reactionPoints;
  const balance = addPoints(user.id, pts, "reaction");
  void alertPointsEarned({
    guild: message.guild,
    userId: user.id,
    amount: pts,
    balance,
    reason: "reaction",
    channelId: message.channel.id,
    jumpUrl: message.url,
    sourceMessage: message,
  }).catch((err) => console.error("[kovari] points alert failed:", err));
  return { points: pts, balance };
}

export function awardRaidPoints(userId, guild = null) {
  const pts = getPointsConfig().raidPoints;
  const balance = addPoints(userId, pts, "raid");
  if (guild) {
    void alertPointsEarned({
      guild,
      userId,
      amount: pts,
      balance,
      reason: "raid",
    }).catch((err) => console.error("[kovari] points alert failed:", err));
  }
  return { points: pts, balance };
}

export function updatePointsConfig(patch) {
  const data = loadPoints();
  data.config = { ...data.config, ...patch };
  savePoints(data);
  return data.config;
}

export function listShopItems() {
  return loadPoints().shop;
}

export function getShopItem(itemId) {
  return loadPoints().shop.find((i) => i.id === itemId) ?? null;
}

export function addShopItem(item) {
  const data = loadPoints();
  data.shop.push(item);
  savePoints(data);
  return item;
}

export function removeShopItem(itemId) {
  const data = loadPoints();
  const idx = data.shop.findIndex((i) => i.id === itemId);
  if (idx === -1) return false;
  data.shop.splice(idx, 1);
  savePoints(data);
  return true;
}

/** null/undefined stock = unlimited */
export function isShopUnlimitedStock(item) {
  return item.stock == null;
}

export function isShopOutOfStock(item) {
  if (isShopUnlimitedStock(item)) return false;
  return item.stock <= 0;
}

export function formatShopStock(item) {
  if (isShopUnlimitedStock(item)) return "Unlimited";
  if (item.stock <= 0) return "Sold out";
  return `${item.stock} available`;
}

export function decrementShopStock(itemId) {
  const data = loadPoints();
  const item = data.shop.find((i) => i.id === itemId);
  if (!item || isShopUnlimitedStock(item)) return item;
  if (item.stock <= 0) throw new Error("This item is sold out.");
  item.stock -= 1;
  savePoints(data);
  return item;
}

export function getGiveaway(id) {
  return loadPoints().giveaways[id] ?? null;
}

export function saveGiveaway(giveaway) {
  const data = loadPoints();
  data.giveaways[giveaway.id] = giveaway;
  savePoints(data);
  return giveaway;
}

export function deleteGiveaway(id) {
  const data = loadPoints();
  delete data.giveaways[id];
  savePoints(data);
}

export function enterGiveaway(giveawayId, userId) {
  const g = getGiveaway(giveawayId);
  if (!g || g.ended) throw new Error("This giveaway has ended.");
  if (g.entries.includes(String(userId))) {
    throw new Error("You already entered this giveaway.");
  }
  if (g.cost > 0) removePoints(userId, g.cost);
  g.entries.push(String(userId));
  saveGiveaway(g);
  return g;
}

export function pickGiveawayWinners(giveawayId, count) {
  const g = getGiveaway(giveawayId);
  if (!g) throw new Error("Giveaway not found.");
  const pool = [...g.entries];
  if (!pool.length) return [];
  const winners = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i += 1) {
    const idx = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(idx, 1)[0]);
  }
  return winners;
}
