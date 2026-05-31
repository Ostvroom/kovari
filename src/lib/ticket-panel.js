import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { config } from "../config.js";
import { applyButtonEmoji } from "./button-emoji.js";

export function buildTicketPanelEmbed(guild) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎫 Kovari Support")
    .setDescription(
      [
        "Need help? Open a private ticket and our team will assist you.",
        "",
        "Click **Create ticket** below — only you and staff can see your channel.",
      ].join("\n"),
    )
    .setFooter({ text: `${guild.name} • Kovari ticketing` });

  const banner =
    config.ticketBannerUrl ??
    config.verificationBannerUrl ??
    config.welcomeBannerUrl ??
    null;
  if (banner) embed.setImage(banner);

  return embed;
}

export function buildTicketPanelComponents() {
  const btn = new ButtonBuilder()
    .setCustomId("kovari:ticket:create")
    .setLabel("Create ticket")
    .setStyle(ButtonStyle.Secondary);
  applyButtonEmoji(btn, "📩");

  return [new ActionRowBuilder().addComponents(btn)];
}

export function buildTicketChannelComponents() {
  const btn = new ButtonBuilder()
    .setCustomId("kovari:ticket:close")
    .setLabel("Close ticket")
    .setStyle(ButtonStyle.Danger);

  return [new ActionRowBuilder().addComponents(btn)];
}
