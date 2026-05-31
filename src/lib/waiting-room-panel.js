import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import {
  buildWaitingRoomPanelEmbed,
  isServerLocked,
} from "../services/verification.js";

export function buildWaitingRoomPanelMessage(guild) {
  const components = [];

  if (isServerLocked()) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("kovari:waitingroom_enter")
          .setLabel("Enter Code")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🔑"),
      ),
    );
  }

  return {
    embeds: [buildWaitingRoomPanelEmbed(guild)],
    components,
  };
}
