import { EmbedBuilder } from "discord.js";
import { config } from "../config.js";

/**
 * Send a log embed to the bot log channel.
 * @param {import("discord.js").Guild} guild
 * @param {{ title: string, color: number, description: string }} options
 */
export async function botLog(guild, { title, color, description }) {
  if (!config.botLogChannelId || !guild) return;
  try {
    const channel = await guild.channels.fetch(config.botLogChannelId).catch(() => null);
    if (!channel?.isTextBased()) return;
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color)
      .setDescription(description)
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  } catch {
    // silently fail
  }
}
