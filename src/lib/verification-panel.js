import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { buildVerificationPanelEmbed } from "../services/verification.js";

export function buildVerificationPanelMessage(guild) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("kovari:verify")
      .setLabel("Verify")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId("kovari:faq")
      .setLabel("FAQ")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("❓"),
  );

  return {
    embeds: [buildVerificationPanelEmbed(guild)],
    components: [row],
  };
}
