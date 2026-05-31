import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export function buildRaidPanelComponents(raid) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`kovari:raid:join:${raid.id}`)
        .setLabel("Join raid")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`kovari:raid:submit:${raid.id}`)
        .setLabel("Submit raid")
        .setStyle(ButtonStyle.Success),
    ),
  ];
}
