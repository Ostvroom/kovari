import { PermissionFlagsBits } from "discord.js";
import { config } from "../config.js";
import { getChannelLevel } from "./link-protection-store.js";

const HTTP_URL =
  /https?:\/\/[^\s<>'"`,\])}]+/gi;
const BARE_DISCORD_INVITE =
  /(?:^|[\s(])((?:discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[a-zA-Z0-9-]+)/gi;
const DANGEROUS_PROTOCOL = /(?:javascript|data|vbscript|file|blob):/i;

const TWITTER_HOSTS = new Set([
  "twitter.com",
  "x.com",
  "t.co",
  "mobile.twitter.com",
  "www.twitter.com",
  "www.x.com",
]);

export function canBypassLinks(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (
    config.adminRoleIds.length > 0 &&
    member.roles.cache.some((r) => config.adminRoleIds.includes(r.id))
  ) {
    return true;
  }
  return false;
}

function normalizeHost(rawUrl) {
  try {
    const withScheme = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const host = new URL(withScheme).hostname.toLowerCase();
    return host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isTwitterUrl(rawUrl) {
  const host = normalizeHost(rawUrl);
  if (!host) return false;
  if (TWITTER_HOSTS.has(host)) return true;
  return host.endsWith(".twitter.com") || host.endsWith(".x.com");
}

function isDiscordInvite(raw) {
  const text = raw.toLowerCase();
  return (
    /(?:https?:\/\/)?(?:www\.)?discord\.gg\/[a-z0-9-]+/i.test(text) ||
    /(?:https?:\/\/)?(?:www\.)?discord\.com\/invite\/[a-z0-9-]+/i.test(text) ||
    /(?:https?:\/\/)?(?:www\.)?discordapp\.com\/invite\/[a-z0-9-]+/i.test(text) ||
    /^discord\.gg\/[a-z0-9-]+/i.test(text)
  );
}

function isDangerous(raw) {
  return DANGEROUS_PROTOCOL.test(raw);
}

/** @returns {{ raw: string, kind: 'http' | 'discord_invite' }[]} */
export function extractLinks(content) {
  const found = [];
  const seen = new Set();

  for (const match of content.matchAll(HTTP_URL)) {
    const raw = match[0].replace(/[.,;:!?)]+$/, "");
    if (!seen.has(raw.toLowerCase())) {
      seen.add(raw.toLowerCase());
      found.push({ raw, kind: "http" });
    }
  }

  for (const match of content.matchAll(BARE_DISCORD_INVITE)) {
    const raw = match[1] ?? match[0];
    const key = raw.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      found.push({ raw, kind: "discord_invite" });
    }
  }

  return found;
}

function linkAllowedForLevel(link, level) {
  const { raw, kind } = link;

  if (isDangerous(raw)) {
    return { allowed: false, reason: "blocked unsafe link type" };
  }

  if (level === "full") {
    return { allowed: false, reason: "links are not allowed in this channel" };
  }

  const twitter = kind === "http" && isTwitterUrl(raw);
  const discord = isDiscordInvite(raw);

  if (level === "medium") {
    if (twitter || discord) return { allowed: true };
    return {
      allowed: false,
      reason: "only **Twitter/X** and **Discord invite** links are allowed here",
    };
  }

  // default — twitter only
  if (twitter) return { allowed: true };
  if (discord) {
    return {
      allowed: false,
      reason: "Discord invites are not allowed (Twitter/X links only)",
    };
  }

  return {
    allowed: false,
    reason: "only **Twitter/X** links are allowed",
  };
}

export function checkMessageContent(content, channelId) {
  const links = extractLinks(content);
  if (links.length === 0) {
    return { allowed: true, links: [] };
  }

  const level = getChannelLevel(channelId);

  for (const link of links) {
    const verdict = linkAllowedForLevel(link, level);
    if (!verdict.allowed) {
      return {
        allowed: false,
        links,
        level,
        blocked: link.raw,
        reason: verdict.reason,
      };
    }
  }

  return { allowed: true, links, level };
}

export function levelLabel(level) {
  if (level === "full") return "Full — no links";
  if (level === "medium") return "Medium — Twitter + Discord invites";
  return "Default — Twitter/X only";
}
