import { EmbedBuilder } from "discord.js";
import { config, formatWelcome } from "../config.js";
import { applyWaitingState } from "../services/verification.js";

export const name = "guildMemberAdd";
export const once = false;

function resolveBannerUrl(guild) {
  if (config.welcomeBannerUrl) return config.welcomeBannerUrl;
  return (
    guild.bannerURL({ size: 1024 }) ?? guild.iconURL({ size: 1024 }) ?? null
  );
}

function isMainGuild(guildId) {
  if (!config.guildId) return true;
  return guildId === config.guildId;
}

export async function execute(member) {
  if (!isMainGuild(member.guild.id)) return;

  try {
    await applyWaitingState(member);
  } catch (err) {
    console.warn(`Verification waiting role failed for ${member.user.tag}:`, err.message);
  }

  const text = formatWelcome(config.welcomeMessage, member);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Welcome to ${member.guild.name}`)
    .setDescription(text)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: `Member #${member.guild.memberCount}` })
    .setTimestamp();

  const bannerUrl = resolveBannerUrl(member.guild);
  if (bannerUrl) embed.setImage(bannerUrl);

  if (config.welcomeChannelId) {
    const channel = await member.guild.channels
      .fetch(config.welcomeChannelId)
      .catch(() => null);

    if (channel?.isTextBased()) {
      await channel.send({ embeds: [embed] });
      return;
    }

    console.warn(
      `WELCOME_CHANNEL_ID is set but channel ${config.welcomeChannelId} was not found or is not text-based.`,
    );
  }

  try {
    await member.send({ embeds: [embed] });
  } catch {
    console.warn(
      `Could not DM welcome to ${member.user.tag} (DMs closed or blocked).`,
    );
  }
}
