import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { config } from "../config.js";

async function resolveLogChannel(guild, channelId) {
  if (!channelId || !guild) return null;
  let channel = guild.channels.cache.get(channelId) ?? null;
  if (!channel) {
    channel = await guild.channels.fetch(channelId).catch(() => null);
  }
  if (!channel?.isTextBased?.()) {
    console.warn(`[kovari] log channel ${channelId} not found or not text-based`);
    return null;
  }
  const me = guild.members.me;
  if (me) {
    const perms = channel.permissionsFor(me);
    const ok =
      perms?.has(PermissionFlagsBits.ViewChannel) &&
      perms?.has(PermissionFlagsBits.SendMessages) &&
      (!channel.isThread?.() || perms.has(PermissionFlagsBits.SendMessagesInThreads));
    if (!ok) {
      console.warn(`[kovari] missing permission to log in channel ${channelId}`);
      return null;
    }
  }
  return channel;
}

async function sendLogToChannel(guild, channelId, embed, { fallback } = {}) {
  const channel = await resolveLogChannel(guild, channelId);
  if (!channel) return null;
  try {
    return await channel.send({ embeds: [embed] });
  } catch (err) {
    if (fallback) {
      try {
        return await channel.send({ content: fallback.slice(0, 2000) });
      } catch (err2) {
        console.error("[kovari] log fallback failed:", err2.message);
        return null;
      }
    }
    console.error("[kovari] log embed failed:", err.message);
    return null;
  }
}

export async function sendBotLog(guild, embed) {
  return sendLogToChannel(guild, config.botLogChannelId, embed);
}

export async function sendPointsLog(guild, embed, options) {
  return sendLogToChannel(guild, config.pointsLogChannelId, embed, options);
}

export function buildLogEmbed({
  title,
  color = 0x5865f2,
  description,
  fields = [],
  footer,
}) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description.slice(0, 4096));
  if (fields.length) embed.addFields(fields.slice(0, 25));
  embed.setFooter({ text: footer ?? "Kovari" });
  return embed;
}

export async function botLog(guild, options) {
  return sendBotLog(guild, buildLogEmbed(options));
}

/** Unique channel ids for raid events (bot-logs + dedicated raid log channel). */
function raidLogChannelIds() {
  return [
    ...new Set(
      [config.botLogChannelId, config.raidLogChannelId].filter(Boolean),
    ),
  ];
}

/** Post the same raid embed to bot-logs and RAID_LOG_CHANNEL_ID. */
export async function raidLog(guild, options) {
  const embed = buildLogEmbed(options);
  const fallback = options.fallback;
  const ids = raidLogChannelIds();
  if (!ids.length) return [];

  const results = await Promise.all(
    ids.map((id) => sendLogToChannel(guild, id, embed, { fallback })),
  );
  return results;
}

export async function logRaidPosted(guild, raid, adminUser) {
  return raidLog(guild, {
    title: "⚔️ Raid posted",
    color: 0x1d9bf0,
    description: [
      `**By:** ${adminUser}`,
      `**Raid:** #${raid.id}`,
      `**Tweet:** [Open](${raid.tweetUrl})`,
    ].join("\n"),
  });
}

export async function logRaidJoined(guild, userId, raid, username) {
  return raidLog(guild, {
    title: "👤 Raid joined",
    color: 0x5865f2,
    description: [
      `**Member:** <@${userId}>`,
      `**X:** @${username}`,
      `**Raid:** #${raid.id}`,
    ].join("\n"),
  });
}

export async function logRaidVerified(guild, discordUserId, participant, raid, member) {
  const verified = participant.verified ?? {};
  const parts = [];
  if (verified.retweet) parts.push("🔁 Retweet ✓");
  if (verified.reply) parts.push("💬 Reply ✓");
  return raidLog(guild, {
    title: "✅ Raid verified",
    color: 0x57f287,
    description: [
      `**Member:** ${member ?? `<@${discordUserId}>`}`,
      `**X:** [@${participant.username}](https://x.com/${participant.username})`,
      `**Verified:** ${parts.join(" · ") || "—"}`,
      `**Raid:** #${raid.id}`,
      `**Tweet:** [Open](${raid.tweetUrl})`,
    ].join("\n"),
  });
}

export async function logRaidFailed(
  guild,
  discordUserId,
  participant,
  raid,
  reason,
  verification,
  member,
) {
  const partial = {
    retweet: Boolean(verification?.retweet),
    reply: Boolean(verification?.reply),
  };
  const status = [
    `🔁 Retweet ${partial.retweet ? "✓" : "✗"}`,
    `💬 Reply ${partial.reply ? "✓" : "✗"}`,
  ].join(" · ");
  return raidLog(guild, {
    title: "❌ Raid failed",
    color: 0xed4245,
    description: [
      `**Member:** ${member ?? `<@${discordUserId}>`}`,
      `**X:** @${participant.username}`,
      `**Checked:** ${status}`,
      `**Reason:** ${reason}`,
      `**Raid:** #${raid.id}`,
    ].join("\n"),
  });
}

export async function logRaidEnded(guild, raidId, adminUser) {
  return raidLog(guild, {
    title: "⏹️ Raid ended",
    color: 0x95a5a6,
    description: `**Raid:** #${raidId}\n**By:** ${adminUser}`,
  });
}

export async function logXConnected(guild, userId, username) {
  return botLog(guild, {
    title: "🔗 X account linked",
    color: 0x1d9bf0,
    description: `**Member:** <@${userId}>\n**X:** @${username}`,
  });
}

export async function logTicketOpened(guild, userId, channel, number) {
  return botLog(guild, {
    title: "🎫 Ticket opened",
    color: 0x57f287,
    description: [
      `**Member:** <@${userId}>`,
      `**Channel:** ${channel}`,
      `**ID:** ticket-${String(number).padStart(4, "0")}`,
    ].join("\n"),
  });
}

export async function logTicketClosed(guild, ticket, closedBy) {
  return botLog(guild, {
    title: "🔒 Ticket closed",
    color: 0xed4245,
    description: [
      `**Ticket:** ticket-${String(ticket.number).padStart(4, "0")}`,
      `**Owner:** <@${ticket.userId}>`,
      `**Closed by:** ${closedBy}`,
    ].join("\n"),
  });
}

export async function logShopPurchase(guild, userId, item, balance) {
  return botLog(guild, {
    title: "🛒 Shop purchase",
    color: 0xfee75c,
    description: [
      `**Member:** <@${userId}>`,
      `**Item:** ${item.name} (\`${item.id}\`)`,
      `**Cost:** ${item.cost} pts`,
      `**Stock left:** ${item.stock != null ? item.stock : "unlimited"}`,
      `**Balance:** ${balance} pts`,
    ].join("\n"),
  });
}

export async function logShopItemAdded(guild, adminUser, item) {
  return botLog(guild, {
    title: "➕ Shop item added",
    color: 0xfee75c,
    description: [
      `**By:** ${adminUser}`,
      `**Item:** ${item.name} (\`${item.id}\`)`,
      `**Cost:** ${item.cost} pts`,
      item.stock != null ? `**Stock:** ${item.stock}` : "**Stock:** unlimited",
      item.imageUrl ? "**Image:** yes" : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });
}

export async function logGiveawayStarted(guild, adminUser, giveaway) {
  return botLog(guild, {
    title: "🎉 Giveaway started",
    color: 0xeb459e,
    description: [
      `**By:** ${adminUser}`,
      `**Prize:** ${giveaway.prize}`,
      `**Cost:** ${giveaway.cost} pts`,
      `**Winners:** ${giveaway.winnerCount}`,
      `**ID:** #${giveaway.id}`,
    ].join("\n"),
  });
}

export async function logGiveawayEntry(guild, userId, giveaway, entryCount) {
  return botLog(guild, {
    title: "🎟️ Giveaway entry",
    color: 0xeb459e,
    description: [
      `**Member:** <@${userId}>`,
      `**Giveaway:** #${giveaway.id} — ${giveaway.prize}`,
      `**Spent:** ${giveaway.cost} pts`,
      `**Entries:** ${entryCount}`,
    ].join("\n"),
  });
}

export async function logGiveawayEnded(guild, giveaway, endedBy) {
  const winners =
    giveaway.winnerIds?.length > 0
      ? giveaway.winnerIds.map((id) => `<@${id}>`).join(", ")
      : "_None_";
  return botLog(guild, {
    title: "🏁 Giveaway ended",
    color: 0xeb459e,
    description: [
      `**By:** ${endedBy}`,
      `**Giveaway:** #${giveaway.id}`,
      `**Prize:** ${giveaway.prize}`,
      `**Entries:** ${giveaway.entries.length}`,
      `**Winners:** ${winners}`,
    ].join("\n"),
  });
}

export async function logPointsEarned(
  guild,
  { userId, amount, balance, reason, channelId, jumpUrl },
) {
  const reasonLabel =
    reason === "message"
      ? "Message"
      : reason === "reaction"
        ? "Reaction"
        : reason === "raid"
          ? "Raid"
          : reason;

  const lines = [
    `**Member:** <@${userId}>`,
    `**Earned:** +${amount} pts`,
    `**Balance:** ${balance} pts`,
    `**Source:** ${reasonLabel}`,
  ];
  if (channelId) lines.push(`**Channel:** <#${channelId}>`);
  if (jumpUrl) lines.push(`[Jump to message](${jumpUrl})`);

  const description = lines.join("\n");
  const embed = buildLogEmbed({
    title: "💰 Points earned",
    color: 0xfee75c,
    description,
  });
  return sendPointsLog(guild, embed, {
    fallback: `💰 <@${userId}> +${amount} pts (${reasonLabel}) · balance **${balance}**`,
  });
}

export async function logPointsAdjust(guild, adminUser, targetUser, amount, action) {
  const embed = buildLogEmbed({
    title: action === "give" ? "➕ Points given" : "➖ Points removed",
    color: action === "give" ? 0x57f287 : 0xe67e22,
    description: [
      `**By:** ${adminUser}`,
      `**Member:** ${targetUser}`,
      `**Amount:** ${amount} pts`,
    ].join("\n"),
  });
  await sendPointsLog(guild, embed);
  return sendBotLog(guild, embed);
}

export async function logLinkRemoved(guild, userId, channelId, reason) {
  return botLog(guild, {
    title: "🔗 Link removed",
    color: 0xe67e22,
    description: [
      `**Member:** <@${userId}>`,
      `**Channel:** <#${channelId}>`,
      `**Reason:** ${reason}`,
    ].join("\n"),
  });
}
