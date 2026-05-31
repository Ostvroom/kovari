import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

export function buildXConnectModal(raidId) {
  return new ModalBuilder()
    .setCustomId(`kovari:raid:x_modal:${raidId}`)
    .setTitle("Link your X account")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("username")
          .setLabel("X username (without @)")
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(15)
          .setRequired(true)
          .setPlaceholder("yourhandle"),
      ),
    );
}

export function parseXModalRaidId(customId) {
  const parts = customId.split(":");
  return parts.length >= 4 ? parts[3] : null;
}
