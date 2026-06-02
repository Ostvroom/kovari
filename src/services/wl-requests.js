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

function extractUsernameFromUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/+/, "").split("/");
    if (path.length >= 1) return path[0];
  } catch {}
  return null;
}

function formatAccountAge(joinedStr) {
  if (!joinedStr) return "Unknown";
  const joined = new Date(joinedStr);
  if (isNaN(joined.getTime())) return "Unknown";
  const now = new Date();
  let years = now.getFullYear() - joined.getFullYear();
  let months = now.getMonth() - joined.getMonth();
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years > 0) return `${years} yr${years !== 1 ? "s" : ""}${months > 0 ? ` ${months} mo` : ""}`;
  if (months > 0) return `${months} mo`;
  const days = Math.floor((now - joined) / (1000 * 60 * 60 * 24));
  return `${days} day${days !== 1 ? "s" : ""}`;
}

async function fetchXProfile(username) {
  const input = username.trim().replace(/^@/, "");
  if (!input) return null;
  try {
    const res = await fetch(
      `https://api.fxtwitter.com/${encodeURIComponent(input)}`,
      { headers: { "User-Agent": "KovariBot/1.0" } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.code !== 200 || !data.user) return null;
    const u = data.user;
    return {
      username: u.screen_name || input,
      displayName: u.name || input,
      description: u.description || "",
      followers: u.followers ?? u.followers_count ?? 0,
      following: u.following ?? u.friends_count ?? 0,
      image: u.avatar ?? u.profile_image_url_https ?? u.profile_image_url ?? null,
      banner: u.banner ?? u.profile_banner_url ?? null,
      verified: u.verified || false,
      joined: u.joined ?? u.created_at ?? null,
    };
  } catch {
    return null;
  }
}

export function buildWlRequestEmbed({ user, tweetUrl, upvotes, downvotes, profile }) {
  const lines = [
    `**Requester:** ${user}`,
    `**Link:** [Open on X](${tweetUrl})`,
    "",
    `👍 **${upvotes}** · 👎 **${downvotes}**`,
  ];

  const embed = new EmbedBuilder()
    .setColor(0x1d9bf0)
    .setTitle(profile ? `🎫 WL Request — ${profile.displayName}` : "🎫 WL Request")
    .setDescription(lines.join("\n"))
    .setFooter({ text: "Vote below — majority decides" })
    .setTimestamp();

  if (profile) {
    if (profile.image) embed.setThumbnail(profile.image.replace("_normal", "_400x400"));
    if (profile.banner) embed.setImage(profile.banner);
    embed.addFields(
      { name: "Handle", value: `@${profile.username}`, inline: true },
      { name: "Followers", value: String(profile.followers).replace(/\B(?=(\d{3})+(?!\d))/g, ","), inline: true },
      { name: "Account age", value: formatAccountAge(profile.joined), inline: true },
    );
    if (profile.description) {
      embed.addFields({ name: "Bio", value: profile.description.slice(0, 300) });
    }
  }

  return embed;
}

export function buildWlRequestComponents(tweetUrl) {
  const encoded = Buffer.from(tweetUrl).toString("base64url");
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`kovari:wl:up:${encoded}`)
      .setLabel("🔥 Strongly want it")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`kovari:wl:down:${encoded}`)
      .setLabel("⭐ Good")
      .setStyle(ButtonStyle.Primary),
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

  const username = extractUsernameFromUrl(tweetUrl);
  const profile = username ? await fetchXProfile(username) : null;

  const counts = getWlVoteCounts(tweetUrl);
  const embed = buildWlRequestEmbed({
    user: message.author.toString(),
    tweetUrl,
    upvotes: counts.up,
    downvotes: counts.down,
    profile,
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

  // Re-fetch profile to keep embed fresh
  const username = extractUsernameFromUrl(tweetUrl);
  const profile = username ? await fetchXProfile(username) : null;

  const embed = buildWlRequestEmbed({
    user: `<@${updated.userId}>`,
    tweetUrl,
    upvotes: counts.up,
    downvotes: counts.down,
    profile,
  });
  const components = buildWlRequestComponents(tweetUrl);

  await interaction.update({ embeds: [embed], components: [components] });
  return true;
}
