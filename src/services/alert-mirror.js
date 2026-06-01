import { EmbedBuilder } from "discord.js";
import { config } from "../config.js";

const KOVARI_ALERT_COLOR = 0xfee75c;
const seenSourceMessages = new Set();
const SEEN_MAX = 500;

// Batching: combine alerts for the same collection within a window
const BATCH_WINDOW_MS = 15_000;
const BATCH_MAX_SIZE = 10;
const pendingBatches = new Map();

function rememberSourceMessage(id) {
  seenSourceMessages.add(id);
  if (seenSourceMessages.size > SEEN_MAX) {
    const first = seenSourceMessages.values().next().value;
    seenSourceMessages.delete(first);
  }
}

function getCollectionKey(embed) {
  const title = embed.data.title || "";
  // "Lobster #2322" -> "lobster"
  return title.replace(/\s*#\d+.*$/, "").trim().toLowerCase();
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

  // Strip exact gas/fee/gwei field names only
  if (/^\s*(gas|fee|gwei)\s*$/.test(name)) return true;

  // Strip progress bars in values (e.g., "████░░░░ 45%" or "5,234 / 10,000 ████████░░ 45%")
  if (/[\d\s,]+\/[\d\s,]+.*[█░▓▒]/.test(value) && /%/.test(value)) return true;
  if (/^\s*[█░▓▒\s]+\s*\d+%?\s*$/.test(value)) return true;

  // Strip currency lines with emojis
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
    iconURL: guild?.iconURL({ size: 32 }) ?? undefined,
  });
  embed.setTimestamp(sourceEmbed.data.timestamp ? new Date(sourceEmbed.data.timestamp) : new Date());

  return embed;
}

async function sendSingleAlert(message, guild, pair) {
  const target = await message.client.channels
    .fetch(pair.target)
    .catch(() => null);
  if (!target?.isTextBased()) {
    console.warn("[kovari] alert mirror: target channel not found for pair", pair);
    return;
  }

  const embeds = message.embeds.slice(0, 10).map((e) => rebrandEmbed(e, target.guild ?? message.guild));
  const content = message.content?.trim() || null;
  const pingRoleId = pair.roleId || config.alertMirrorPingRoleId || null;
  const ping = pingRoleId ? `<@&${pingRoleId}>` : null;

  try {
    await target.send({
      content: [ping, content].filter(Boolean).join("\n") || undefined,
      embeds,
      allowedMentions: pingRoleId
        ? { roles: [pingRoleId] }
        : { parse: [] },
    });
    rememberSourceMessage(message.id);
  } catch (err) {
    console.error("[kovari] alert mirror failed:", err.message);
  }
}

async function flushBatch(batchKey) {
  const batch = pendingBatches.get(batchKey);
  if (!batch) return;
  pendingBatches.delete(batchKey);

  const { messages, pair } = batch;
  if (messages.length === 0) return;

  console.log(`[kovari] flushBatch ${batchKey}: ${messages.length} messages`);
  for (let i = 0; i < messages.length; i++) {
    console.log(`  msg ${i}: embeds=${messages[i].message.embeds?.length}, title="${messages[i].message.embeds[0]?.data?.title}"`);
  }

  const target = await messages[0].message.client.channels
    .fetch(pair.target)
    .catch(() => null);
  if (!target?.isTextBased()) {
    console.warn("[kovari] batch flush: target channel not found", pair);
    return;
  }

  const guild = target.guild ?? messages[0].message.guild;
  const pingRoleId = pair.roleId || config.alertMirrorPingRoleId || null;
  const ping = pingRoleId ? `<@&${pingRoleId}>` : null;

  // Single alert: send normally
  if (messages.length === 1) {
    const { message } = messages[0];
    const embeds = message.embeds.slice(0, 10).map((e) => rebrandEmbed(e, guild));
    const content = message.content?.trim() || null;
    try {
      await target.send({
        content: [ping, content].filter(Boolean).join("\n") || undefined,
        embeds,
        allowedMentions: pingRoleId ? { roles: [pingRoleId] } : { parse: [] },
      });
      rememberSourceMessage(message.id);
    } catch (err) {
      console.error("[kovari] alert mirror failed:", err.message);
    }
    return;
  }

  // Multiple alerts: combine into one message with up to 10 embeds
  const allEmbeds = messages
    .slice(0, BATCH_MAX_SIZE)
    .flatMap(({ message }) => message.embeds.slice(0, 10).map((e) => rebrandEmbed(e, guild)))
    .slice(0, 10);

  console.log(`[kovari] flushBatch ${batchKey}: sending ${allEmbeds.length} embeds in one message`);

  const collectionName = getCollectionKey(messages[0].message.embeds[0]);
  const header = `**${messages.length} ${collectionName} alerts** — combined`;

  try {
    await target.send({
      content: [ping, header].filter(Boolean).join("\n") || undefined,
      embeds: allEmbeds,
      allowedMentions: pingRoleId ? { roles: [pingRoleId] } : { parse: [] },
    });
    for (const { message } of messages) {
      rememberSourceMessage(message.id);
    }
  } catch (err) {
    console.error("[kovari] batch alert mirror failed:", err.message);
  }
}

function queueBatch(pair, batchKey, message) {
  const existing = pendingBatches.get(batchKey);
  if (existing) {
    existing.messages.push({ message });
    clearTimeout(existing.timeout);
    existing.timeout = setTimeout(() => flushBatch(batchKey), BATCH_WINDOW_MS);
    return;
  }

  const batch = {
    messages: [{ message }],
    pair,
    timeout: setTimeout(() => flushBatch(batchKey), BATCH_WINDOW_MS),
  };
  pendingBatches.set(batchKey, batch);
}

/**
 * Easiest mirror: other bot posts in a private channel → Kovari reposts rebranded embed in public channel.
 * Alerts for the same collection within 15s are batched into one message.
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

  const collectionKey = getCollectionKey(message.embeds[0]);
  const batchKey = `${pair.source}:${pair.target}:${collectionKey}`;

  queueBatch(pair, batchKey, message);
}
