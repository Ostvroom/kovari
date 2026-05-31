import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { config } from "../config.js";
import {
  addWlRequest,
  addWlVote,
  getWlRequest,
  getWlVoteCounts,
  removeWlRequest,
} from "./wl-requests-store.js";

const TWITTER_URL_RE = /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/[^\s]+/gi;

export function extractTwitterUrls(text) {
  if (!text) return [];
  return [...text.matchAll(TWITTER_URL_RE)].map((m) => m[0]);
}

export function normalizeTweetUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/+/, "").split("/");
    // /username/status/1234567890 or /i/web/status/1234567890
    if (path.length >= 3 && path[1] === "status") {
      return `https://x.com/${path[0]}/status/${path[2]}`;
    }
    if (path.length >= 2 && path[0] === "i" && path[1] === "web" && path[2] === "status") {
      return `https://x.com/i/web/status/${path[3]}`;
    }
    return url;
  } catch {
    return url;
  }
}

export function buildWlRequestEmbed({ user, tweetUrl, upvotes, downvotes }) {
  const embed = new EmbedBuilder()
    .setColor(0x1d9bf0)
    .setTitle("🎫 WL Request")
    .setDescription(
      [
        `**Requester:** ${user}`,
        `**Project:** [Open on X](${tweetUrl})`,
        "",
        `👍 **${upvotes}** · 👎 **${downvotes}**`,
      ].join("\n"),
    )
    .setFooter({ text: "Vote below — majority decides" })
    .setTimestamp();
  return embed;
}

export function buildWlRequestComponents(tweetUrl) {
  const encoded = Buffer.from(tweetUrl).toString("base64url");
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`kovari:wl:up:${encoded}`)
      .setLabel("👍 Upvote")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`kovari:wl:down:${encoded}`)
      .setLabel("👎 Downvote")
      .setStyle(ButtonStyle.Danger),
  );
}

export async function handleWlRequest(message) {
  if (!config.wlRequestChannelId) return false;
  if (message.channel.id !== config.wlRequestChannelId) return false;
  if (message.author.bot) return false;

  const urls = extractTwitterUrls(message.content);
  if (!urls.length) return false;

  const tweetUrl = normalizeTweetUrl(urls[0]);
  const existing = getWlRequest(tweetUrl);

  // Duplicate detection
  if (existing) {
    try {
      await message.delete();
    } catch {}
    try {
      await message.channel.send({
        content: `${message.author} This project was already requested. See the original request below.`,
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setDescription(
              `Duplicate request detected. The original request is [here](https://discord.com/channels/${message.guild.id}/${message.channel.id}/${existing.messageId}).`,
            ),
        ],
        allowedMentions: { users: [message.author.id] },
      });
    } catch {}
    return true;
  }

  // Delete original and post embed
  try {
    await message.delete();
  } catch {}

  const counts = getWlVoteCounts(tweetUrl);
  const embed = buildWlRequestEmbed({
    user: message.author.toString(),
    tweetUrl,
    upvotes: counts.up,
    downvotes: counts.down,
  });
  const components = buildWlRequestComponents(tweetUrl);

  const posted = await message.channel.send({
    content: `WL Request from ${message.author}`,
    embeds: [embed],
    components: [components],
    allowedMentions: { users: [message.author.id] },
  });

  addWlRequest(tweetUrl, { messageId: posted.id, userId: message.author.id });
  return true;
}

export async function handleWlVote(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith("kovari:wl:")) return false;

  const [, , type, encoded] = interaction.customId.split(":");
  const tweetUrl = Buffer.from(encoded, "base64url").toString("utf8");
  const req = getWlRequest(tweetUrl);

  if (!req) {
    await interaction.reply({ content: "Request not found.", ephemeral: true });
    return true;
  }

  const updated = addWlVote(tweetUrl, interaction.user.id, type);
  const counts = getWlVoteCounts(tweetUrl);

  // Update embed
  const embed = buildWlRequestEmbed({
    user: `<@${updated.userId}>`,
    tweetUrl,
    upvotes: counts.up,
    downvotes: counts.down,
  });
  const components = buildWlRequestComponents(tweetUrl);

  await interaction.update({ embeds: [embed], components: [components] });
  return true;
}
