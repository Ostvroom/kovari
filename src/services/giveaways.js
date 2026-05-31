import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { config } from "../config.js";
import { applyEmbedImage } from "../lib/image-url.js";
import { newGiveawayId } from "./points-store.js";
import {
  enterGiveaway,
  getGiveaway,
  pickGiveawayWinners,
  saveGiveaway,
} from "./points.js";

/** Kovari gold — matches shop / brand (not third-party blue). */
const GIVEAWAY_COLOR = 0xfee75c;
const GIVEAWAY_ENDED_COLOR = 0x4e5058;
const GIVEAWAY_WON_COLOR = 0x57f287;

function normalizeRules(giveaway) {
  const r = giveaway.rules ?? {};
  return {
    followX: Boolean(r.followX),
    xUrl: r.xUrl?.trim() || config.officialXUrl || null,
    joinDiscord: Boolean(r.joinDiscord),
    inviteUrl: r.inviteUrl?.trim() || null,
    extra: Array.isArray(r.extra) ? r.extra.filter(Boolean) : [],
  };
}

function requirementsBlock(giveaway, guild) {
  const rules = normalizeRules(giveaway);
  const lines = [];

  if (rules.followX && rules.xUrl) {
    lines.push(`Follow on X — [${formatXLabel(rules.xUrl)}](${rules.xUrl})`);
  } else if (rules.followX) {
    lines.push("Follow the project on **X** (link in server official channels)");
  }

  if (rules.joinDiscord) {
    if (rules.inviteUrl) {
      lines.push(`Join Discord — [Open invite](${rules.inviteUrl})`);
    } else {
      lines.push(`Be a member of **${guild.name}**`);
    }
  }

  if (giveaway.cost > 0) {
    lines.push(`Pay **${giveaway.cost}** points to enter (once)`);
  } else {
    lines.push("Free entry");
  }

  lines.push("One entry per account");
  lines.push("Enter before time runs out");

  for (const line of rules.extra) {
    lines.push(line);
  }

  return lines.map((l) => `• ${l}`).join("\n");
}

function formatXLabel(url) {
  try {
    const path = new URL(url).pathname.replace(/^\//, "");
    return path ? `@${path}` : "X";
  } catch {
    return "X";
  }
}

export function buildGiveawayEmbed(giveaway, guild) {
  const ends = Math.floor(new Date(giveaway.endsAt).getTime() / 1000);
  const entries = giveaway.entries?.length ?? 0;
  const hostMention = giveaway.hostId ? `<@${giveaway.hostId}>` : "Staff";
  const blurb = giveaway.description?.trim() || giveaway.prize;

  if (giveaway.ended) {
    const hasWinners = (giveaway.winnerIds?.length ?? 0) > 0;
    const embed = new EmbedBuilder()
      .setColor(hasWinners ? GIVEAWAY_WON_COLOR : GIVEAWAY_ENDED_COLOR)
      .setTitle(giveaway.prize)
      .setDescription(
        [
          `Hosted by ${hostMention}`,
          "",
          "**Description**",
          blurb,
          "",
          hasWinners ? "**Winners**" : "**Status**",
          hasWinners
            ? giveaway.winnerIds.map((id) => `• <@${id}>`).join("\n")
            : "• Ended with no entries",
        ].join("\n"),
      )
      .addFields(
        { name: "Type", value: "Raffle", inline: true },
        { name: "Entries", value: String(entries), inline: true },
        { name: "Ended", value: `<t:${ends}:R>`, inline: true },
      )
      .setFooter({
        text: "Rules not followed may result in a reroll · Kovari Giveaways",
        iconURL: guild.iconURL({ size: 32 }) ?? undefined,
      })
      .setTimestamp(new Date(giveaway.endsAt));

    applyEmbedImage(embed, giveaway.imageUrl);
    return embed;
  }

  const embed = new EmbedBuilder()
    .setColor(GIVEAWAY_COLOR)
    .setTitle(giveaway.prize)
    .setDescription(
      [
        `Hosted by ${hostMention}`,
        "",
        "**Description**",
        blurb,
        "",
        "**Requirements**",
        requirementsBlock(giveaway, guild),
      ].join("\n"),
    )
    .addFields(
      { name: "Type", value: "Raffle", inline: true },
      { name: "Spots", value: String(giveaway.winnerCount), inline: true },
      { name: "Ends", value: `<t:${ends}:R>`, inline: true },
      { name: "Entries", value: String(entries), inline: true },
      {
        name: "Cost",
        value: giveaway.cost > 0 ? `${giveaway.cost} pts` : "Free",
        inline: true,
      },
    )
    .setFooter({
      text: "Rules not followed may result in a reroll · Kovari Giveaways",
      iconURL: guild.iconURL({ size: 32 }) ?? undefined,
    })
    .setTimestamp();

  applyEmbedImage(embed, giveaway.imageUrl);
  return embed;
}

export function buildGiveawayComponents(giveaway) {
  if (giveaway.ended) return [];

  const joinLabel =
    giveaway.cost > 0 ? `Join Giveaway · ${giveaway.cost}p` : "Join Giveaway";

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`kovari:giveaway:enter:${giveaway.id}`)
        .setLabel(joinLabel.slice(0, 80))
        .setStyle(ButtonStyle.Success),
    ),
  ];
}

export function createGiveawayRecord({
  prize,
  description = "",
  cost,
  winnerCount,
  durationMinutes,
  channelId,
  guildId,
  messageId,
  hostId,
  imageUrl = null,
  rules = {},
}) {
  const endsAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
  return saveGiveaway({
    id: newGiveawayId(),
    prize,
    description: description || prize,
    cost,
    winnerCount,
    endsAt,
    channelId,
    guildId,
    messageId,
    hostId,
    imageUrl,
    rules,
    entries: [],
    ended: false,
    winnerIds: [],
  });
}

export function endGiveawayRecord(giveawayId) {
  const g = getGiveaway(giveawayId);
  if (!g) throw new Error("Giveaway not found.");
  if (g.ended) throw new Error("Giveaway already ended.");

  const winnerIds = pickGiveawayWinners(giveawayId, g.winnerCount);
  g.ended = true;
  g.winnerIds = winnerIds;
  saveGiveaway(g);
  return g;
}

/** Edit raffle message + announce winners in the same channel. */
export async function finalizeGiveaway(client, giveawayId, endedBy = "Timer") {
  const g = endGiveawayRecord(giveawayId);

  let channel = null;
  for (const guild of client.guilds.cache.values()) {
    const ch = await guild.channels.fetch(g.channelId).catch(() => null);
    if (ch?.isTextBased()) {
      channel = ch;
      break;
    }
  }
  if (!channel) return g;

  const guild = channel.guild;
  if (!g.guildId) {
    g.guildId = guild.id;
    saveGiveaway(g);
  }
  if (g.messageId) {
    const msg = await channel.messages.fetch(g.messageId).catch(() => null);
    if (msg) {
      await msg.edit({
        embeds: [buildGiveawayEmbed(g, guild)],
        components: buildGiveawayComponents(g),
      });
    }
  }

  const winnerLine =
    g.winnerIds.length > 0
      ? g.winnerIds.map((id) => `<@${id}>`).join(" ")
      : null;

  if (winnerLine) {
    await channel.send({
      content: [
        `**Giveaway ended** — ${g.prize}`,
        "",
        `Congratulations ${winnerLine}!`,
        "",
        `_Ended by ${endedBy} · ${g.entries.length} entr${g.entries.length === 1 ? "y" : "ies"}_`,
      ].join("\n"),
      allowedMentions: { users: g.winnerIds },
    });
  } else {
    await channel.send({
      content: [
        `**Giveaway ended** — ${g.prize}`,
        "",
        "_No entries — no winners drawn._",
        "",
        `_Ended by ${endedBy}_`,
      ].join("\n"),
    });
  }

  const { logGiveawayEnded } = await import("./bot-log.js");
  await logGiveawayEnded(guild, g, endedBy);

  return g;
}

export { enterGiveaway };
