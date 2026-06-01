import { PermissionFlagsBits } from "discord.js";
import { config } from "../config.js";

// Message history per user: guildId:userId -> [{ timestamp, content, channelId }]
const messageHistory = new Map();
const HISTORY_MAX = 50;
const HISTORY_TTL_MS = 60_000; // keep last 60 seconds

// Muted users: guildId:userId -> unmuteTimestamp
const mutedUsers = new Map();

function key(guildId, userId) {
  return `${guildId}:${userId}`;
}

function cleanupHistory() {
  const now = Date.now();
  for (const [k, msgs] of messageHistory) {
    const filtered = msgs.filter((m) => now - m.timestamp < HISTORY_TTL_MS);
    if (filtered.length === 0) messageHistory.delete(k);
    else messageHistory.set(k, filtered);
  }
}

setInterval(cleanupHistory, 30_000);

function canBypass(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (config.adminRoleIds.some((id) => member.roles.cache.has(id))) return true;
  return false;
}

/**
 * Check if a message is spammy.
 * Returns { spam: boolean, reason: string, action: "delete" | "warn" | "mute" }
 */
export function checkSpam(message) {
  if (message.author.bot) return { spam: false };
  if (!message.guild) return { spam: false };
  if (canBypass(message.member)) return { spam: false };

  const k = key(message.guild.id, message.author.id);
  const now = Date.now();

  // Check if user is currently muted
  const mutedUntil = mutedUsers.get(k);
  if (mutedUntil && now < mutedUntil) {
    return { spam: true, reason: "Currently muted for spam", action: "delete" };
  }
  if (mutedUntil && now >= mutedUntil) {
    mutedUsers.delete(k);
  }

  const history = messageHistory.get(k) ?? [];
  history.push({
    timestamp: now,
    content: message.content.trim().toLowerCase(),
    channelId: message.channel.id,
  });
  if (history.length > HISTORY_MAX) history.shift();
  messageHistory.set(k, history);

  const recent = history.filter((m) => now - m.timestamp < 10_000);

  // Rule 1: 5+ messages in 10 seconds
  if (recent.length >= 5) {
    mutedUsers.set(k, now + 300_000); // 5 min mute
    return { spam: true, reason: "5+ messages in 10 seconds", action: "mute" };
  }

  // Rule 2: 3+ identical messages in 10 seconds
  const contentCounts = {};
  for (const m of recent) {
    contentCounts[m.content] = (contentCounts[m.content] || 0) + 1;
  }
  for (const [content, count] of Object.entries(contentCounts)) {
    if (count >= 3 && content.length > 0) {
      mutedUsers.set(k, now + 300_000);
      return { spam: true, reason: "Repeated identical message", action: "mute" };
    }
  }

  // Rule 3: 3+ messages with only links / very short spam
  const linkOnly = recent.filter((m) => m.content.length < 15 && /https?:\/\//.test(m.content));
  if (linkOnly.length >= 3) {
    mutedUsers.set(k, now + 300_000);
    return { spam: true, reason: "Repeated link spam", action: "mute" };
  }

  // Rule 4: Caps spam (70%+ caps in messages over 15 chars)
  if (message.content.length > 15) {
    const caps = (message.content.match(/[A-Z]/g) || []).length;
    if (caps / message.content.length > 0.7) {
      return { spam: true, reason: "Excessive caps", action: "warn" };
    }
  }

  return { spam: false };
}

export async function enforceSpamAction(message, verdict) {
  if (!verdict.spam) return;

  // Try to delete the spam message
  try {
    await message.delete();
  } catch {}

  const member = message.member;

  if (verdict.action === "mute" && member) {
    // Try to timeout the member (Discord timeout = 5 min)
    try {
      await member.timeout(300_000, "Auto-mute: spam detected");
    } catch {
      // Fallback: just log
    }
  }

  // Log to bot log channel if configured
  if (config.botLogChannelId) {
    try {
      const { botLog } = await import("./bot-log.js");
      await botLog(message.guild, {
        title: "🛡️ Anti-Spam Triggered",
        color: 0xed4245,
        description: [
          `**User:** ${message.author}`,
          `**Channel:** ${message.channel}`,
          `**Reason:** ${verdict.reason}`,
          `**Action:** ${verdict.action}`,
          `**Content:** ${message.content.slice(0, 200)}`,
        ].join("\n"),
      });
    } catch {}
  }
}
