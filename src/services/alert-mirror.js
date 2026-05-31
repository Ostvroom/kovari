import { EmbedBuilder } from "discord.js";
import { config } from "../config.js";

const KOVARI_ALERT_COLOR = 0xfee75c;
const seenSourceMessages = new Set();
const SEEN_MAX = 500;

function rememberSourceMessage(id) {
  seenSourceMessages.add(id);
  if (seenSourceMessages.size > SEEN_MAX) {
    const first = seenSourceMessages.values().next().value;
    seenSourceMessages.delete(first);
  }
}

function cleanDescription(text) {
  if (!text) return text;
  const lines = text.split("\n");
  const filtered = lines.filter((line) => {
    // Strip gas fee lines (💰 🧮 ⛽ 🪙 + Ξ/$)
    if (/^[💰🧮⛽🪙]/.test(line) && /[Ξ$]/.test(line)) return false;
    // Strip progress / supply bar lines (numbers + "/" + block chars + "%")
    if (/[\d\s,]+\/[\d\s,]+.*[█░▓▒]/.test(line) && /%/.test(line)) return false;
    // Strip standalone progress bar lines
    if (/^\s*[█░▓▒\s]+\s*\d+%?\s*$/.test(line)) return false;
    return true;
  });
  return filtered.join("\n").trim() || text;
}

function isGasOrProgressField(field) {
  const name = field.name?.toLowerCase() || "";
  const value = field.value || "";
  if (/gas|fee|progress|minted|supply|progress bar/.test(name)) return true;
  if (/[\d\s,]+\/[\d\s,]+.*[█░▓▒]/.test(value) && /%/.test(value)) return true;
  if (/^[💰🧮⛽🪙]/.test(value) && /[Ξ$]/.test(value)) return true;
  return false;
}

/** Rebuild another bot's embed with Kovari branding (same text, new look). */
export function rebrandEmbed(sourceEmbed, guild) {
  const embed = new EmbedBuilder().setColor(KOVARI_ALERT_COLOR);

  if (sourceEmbed.data.title) embed.setTitle(sourceEmbed.data.title);
  if (sourceEmbed.data.description) {
    embed.setDescription(cleanDescription(sourceEmbed.data.description));
  }
  if (sourceEmbed.data.url) embed.setURL(sourceEmbed.data.url);
  if (sourceEmbed.data.fields?.length) {
    const fields = sourceEmbed.data.fields
      .slice(0, 25)
      .filter((f) => !isGasOrProgressField(f))
      .map((f) => ({
        name: f.name,
        value: f.value,
        inline: f.inline ?? false,
      }));
    if (fields.length) embed.addFields(fields);
  }
  if (sourceEmbed.data.image?.url) embed.setImage(sourceEmbed.data.image.url);
  else if (sourceEmbed.data.thumbnail?.url) embed.setThumbnail(sourceEmbed.data.thumbnail.url);

  embed.setFooter({
    text: "Kovari Alerts",
    iconURL: guild.iconURL({ size: 32 }) ?? undefined,
  });
  embed.setTimestamp(sourceEmbed.data.timestamp ? new Date(sourceEmbed.data.timestamp) : new Date());

  return embed;
}

/**
 * Easiest mirror: other bot posts in a private channel → Kovari reposts rebranded embed in public channel.
 * No extra API calls — only reads Discord.
 */
export async function tryMirrorAlert(message) {
  if (!config.alertMirrorEnabled) return;
  if (!config.alertMirrorPairs.length) return;
  if (message.author.id === message.client.user.id) return;
  if (seenSourceMessages.has(message.id)) return;

  const pair = config.alertMirrorPairs.find((p) => p.source === message.channel.id);
  if (!pair) return;

  const watchBots = config.alertMirrorBotIds;
  if (watchBots.length && !watchBots.includes(message.author.id)) return;
  if (!message.embeds.length) return;

  const target = await message.client.channels
    .fetch(pair.target)
    .catch(() => null);
  if (!target?.isTextBased()) {
    console.warn("[kovari] alert mirror: target channel not found for pair", pair);
    return;
  }

  const guild = target.guild ?? message.guild;
  const embeds = message.embeds.slice(0, 10).map((e) => rebrandEmbed(e, guild));
  const content = message.content?.trim() || null;
  const ping = config.alertMirrorPingRoleId ? `<@&${config.alertMirrorPingRoleId}>` : null;

  try {
    await target.send({
      content: [ping, content].filter(Boolean).join("\n") || undefined,
      embeds,
      allowedMentions: config.alertMirrorPingRoleId
        ? { roles: [config.alertMirrorPingRoleId] }
        : { parse: [] },
    });
    rememberSourceMessage(message.id);
  } catch (err) {
    console.error("[kovari] alert mirror failed:", err.message);
  }
}
