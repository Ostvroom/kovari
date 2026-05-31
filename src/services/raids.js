import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { config } from "../config.js";
import { fetchTweetDetails, extractTweetId, normalizeTweetUrl } from "./tweet.js";
import { getXAccount, isUsernameTaken, setXAccount } from "./x-accounts-store.js";
import { buildRaidPanelComponents } from "../lib/raid-panel.js";
import { getRaid, newRaidId, saveRaid } from "./raids-store.js";

function tweetFromRaid(raid) {
  const meta = raid.tweetMeta ?? {};
  return {
    text: meta.text ?? "",
    url: raid.tweetUrl,
    author: meta.author ?? "Unknown",
    username: meta.username ?? "",
    imageUrl: meta.imageUrl ?? null,
  };
}

export function isRaidAdmin(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (
    config.adminRoleIds.length > 0 &&
    member.roles.cache.some((r) => config.adminRoleIds.includes(r.id))
  ) {
    return true;
  }
  return false;
}

export function buildRaidEmbed(guild, raid, tweet) {
  const participantCount = Object.keys(raid.participants ?? {}).length;
  const completed = Object.values(raid.participants ?? {}).filter(
    (p) => p.completedAt,
  ).length;

  const embed = new EmbedBuilder()
    .setColor(0x1d9bf0)
    .setTitle("⚔️ X Raid — Engage now!")
    .setDescription(
      [
        tweet.text ? `> ${tweet.text.slice(0, 350)}${tweet.text.length > 350 ? "…" : ""}` : "_Tweet loaded — open on X to engage._",
        "",
        "• **Join raid** — link your X once, then follow the steps",
        "• **Retweet** or **reply** on the tweet",
        "• **Submit raid** when done",
        "",
        `👥 Raiders: **${participantCount}** joined · **${completed}** submitted`,
      ].join("\n"),
    )
    .setURL(tweet.url)
    .setFooter({ text: `${guild.name} • Raid #${raid.id}` });

  if (tweet.author) {
    embed.setAuthor({
      name: `@${tweet.username || tweet.author}`,
      iconURL: guild.iconURL({ size: 64 }) ?? undefined,
    });
  }

  const banner =
    tweet.imageUrl ??
    config.raidBannerUrl ??
    config.welcomeBannerUrl ??
    null;
  if (banner) embed.setImage(banner);

  return embed;
}

export async function createRaid({ tweetUrl, createdBy, channelId, messageId }) {
  const tweetId = extractTweetId(tweetUrl);
  if (!tweetId) throw new Error("Invalid tweet URL. Use a full x.com/status/… link.");

  const tweet = await fetchTweetDetails(tweetId);
  const raid = {
    id: newRaidId(),
    tweetId,
    tweetUrl: tweet.url,
    channelId,
    messageId: messageId ?? null,
    createdBy,
    createdAt: new Date().toISOString(),
    active: true,
    participants: {},
    tweetMeta: {
      text: tweet.text,
      author: tweet.author,
      username: tweet.username,
      imageUrl: tweet.imageUrl,
    },
  };
  saveRaid(raid);
  return { raid, tweet };
}

export async function connectXUser(discordUserId, username) {
  const clean = username.trim().replace(/^@/, "");
  if (!/^[a-zA-Z0-9_]{1,15}$/i.test(clean)) {
    throw new Error("Invalid X username (letters, numbers, underscore only).");
  }

  const { validateXUsername } = await import("./x-verify.js");
  const profile = await validateXUsername(clean);

  if (isUsernameTaken(profile.username, discordUserId)) {
    throw new Error(`@${profile.username} is already linked to another Discord account.`);
  }

  return setXAccount(discordUserId, clean, {
    username: profile.username,
    userId: profile.id,
  });
}

export function raidJoinInstructions(raid, x) {
  return [
    `You're in raid **#${raid.id}** as **@${x.username}**.`,
    "",
    `1. [Open the tweet](${raid.tweetUrl})`,
    "2. **Retweet** or **reply** on X",
    "3. **Submit raid** on this panel",
  ].join("\n");
}

export function joinRaid(raidId, discordUserId) {
  const raid = getRaid(raidId);
  if (!raid || !raid.active) throw new Error("This raid is no longer active.");

  const x = getXAccount(discordUserId);
  if (!x) {
    throw new Error("Link your X account first — click **Join raid**.");
  }

  if (!raid.participants) raid.participants = {};
  raid.participants[String(discordUserId)] = {
    username: x.username,
    joinedAt: new Date().toISOString(),
    actions: [],
  };
  saveRaid(raid);
  return { raid, x };
}

export async function logRaidJoin(guild, discordUserId, raid, username) {
  const { logRaidJoined } = await import("./bot-log.js");
  return logRaidJoined(guild, discordUserId, raid, username);
}

export async function submitRaid(raidId, discordUserId) {
  const raid = getRaid(raidId);
  if (!raid || !raid.active) throw new Error("This raid is no longer active.");

  const p = raid.participants?.[String(discordUserId)];
  if (!p) throw new Error("Click **Join raid** first, then submit.");

  if (p.completedAt) {
    return { success: true, raid, participant: p, already: true };
  }

  const xAcc = getXAccount(discordUserId);
  const { verifyRaidEngagement } = await import("./x-verify.js");
  const verification = await verifyRaidEngagement(
    p.username,
    raid.tweetId,
    xAcc?.userId ?? null,
  );

  if (!verification.ok) {
    return {
      success: false,
      raid,
      participant: p,
      verification,
      error: verification.error ?? "Retweet or reply on the tweet, then try again.",
    };
  }

  const actions = [];
  if (verification.retweet) actions.push("retweet");
  if (verification.reply) actions.push("reply");
  if (verification.like) actions.push("like");

  p.completedAt = new Date().toISOString();
  p.actions = actions;
  p.verified = {
    retweet: Boolean(verification.retweet),
    reply: Boolean(verification.reply),
    like: Boolean(verification.like),
    at: new Date().toISOString(),
  };
  saveRaid(raid);
  return { success: true, raid, participant: p, already: false, verification };
}

/** Update the public raid panel message with current join/submit counts. */
export async function refreshRaidPanel(client, raid) {
  if (!raid?.channelId || !raid?.messageId) return;

  const channel = await client.channels.fetch(raid.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const message = await channel.messages.fetch(raid.messageId).catch(() => null);
  if (!message) return;

  const guild = message.guild ?? (await client.guilds.fetch(channel.guildId).catch(() => null));
  if (!guild) return;

  const embed = buildRaidEmbed(guild, raid, tweetFromRaid(raid));
  const components = buildRaidPanelComponents(raid);

  await message.edit({
    content: message.content,
    embeds: [embed],
    components,
    allowedMentions: message.allowedMentions,
  });
}

export function endRaid(raidId) {
  const raid = getRaid(raidId);
  if (!raid) throw new Error("Raid not found.");
  raid.active = false;
  raid.endedAt = new Date().toISOString();
  saveRaid(raid);
  return raid;
}

function verificationStatusLines(verified, { failed = false } = {}) {
  const actionLabels = {
    retweet: "🔁 Retweet",
    reply: "💬 Reply",
  };
  const mark = (ok) => (ok ? "✓" : failed ? "✗" : "—");
  const parts = [
    `${actionLabels.retweet} ${mark(verified.retweet)}`,
    `${actionLabels.reply} ${mark(verified.reply)}`,
  ];
  return parts.join(" · ");
}

export function buildRaidLogEmbed(guild, raid, discordUser, participant, member) {
  const verified = participant.verified ?? {};
  const actionText = verificationStatusLines(verified);

  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("📋 Raid log — verified")
    .setDescription(
      [
        `**Member:** ${member ?? discordUser}`,
        `**X account:** [@${participant.username}](https://x.com/${participant.username})`,
        `**Verified:** ${actionText}`,
        `**Tweet:** [Open post](${raid.tweetUrl})`,
      ].join("\n"),
    )
    .setFooter({ text: `Raid #${raid.id} • ${guild.name}` })
    .setTimestamp();
}

export function buildRaidFailLogEmbed(
  guild,
  raid,
  discordUser,
  participant,
  reason,
  verification,
  member,
) {
  const partial = {
    retweet: Boolean(verification?.retweet),
    reply: Boolean(verification?.reply),
  };
  const status = verificationStatusLines(partial, { failed: true });

  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("📋 Raid log — failed")
    .setDescription(
      [
        `**Member:** ${member ?? discordUser}`,
        `**X account:** [@${participant.username}](https://x.com/${participant.username})`,
        `**Checked:** ${status}`,
        `**Reason:** ${reason}`,
        `**Tweet:** [Open post](${raid.tweetUrl})`,
      ].join("\n"),
    )
    .setFooter({ text: `Raid #${raid.id} • ${guild.name}` })
    .setTimestamp();
}

export async function postRaidLog(client, guild, raid, discordUserId, participant) {
  const member = await guild.members.fetch(discordUserId).catch(() => null);
  const { logRaidVerified } = await import("./bot-log.js");
  return logRaidVerified(guild, discordUserId, participant, raid, member);
}

export async function postRaidFailLog(
  guild,
  raid,
  discordUserId,
  participant,
  reason,
  verification,
) {
  const member = await guild.members.fetch(discordUserId).catch(() => null);
  const { logRaidFailed } = await import("./bot-log.js");
  return logRaidFailed(
    guild,
    discordUserId,
    participant,
    raid,
    reason,
    verification,
    member,
  );
}
