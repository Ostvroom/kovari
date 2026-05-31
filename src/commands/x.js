import { SlashCommandBuilder } from "discord.js";
import { EPHEMERAL } from "../lib/ephemeral.js";
import { connectXUser } from "../services/raids.js";
import { getXAccount, removeXAccount } from "../services/x-accounts-store.js";

export const data = new SlashCommandBuilder()
  .setName("x")
  .setDescription("Link your X (Twitter) account for raids")
  .addSubcommand((sub) =>
    sub
      .setName("connect")
      .setDescription("Connect your X username")
      .addStringOption((option) =>
        option
          .setName("username")
          .setDescription("Your X handle (without @)")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("disconnect").setDescription("Remove your linked X account"),
  )
  .addSubcommand((sub) =>
    sub.setName("profile").setDescription("View your linked X account"),
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "connect") {
    const username = interaction.options.getString("username", true);
    try {
      const acc = await connectXUser(interaction.user.id, username);
      const { logXConnected } = await import("../services/bot-log.js");
      await logXConnected(interaction.guild, interaction.user.id, acc.username);
      await interaction.reply({
        content: `Connected **@${acc.username}** for raids. You can now join raids from the panel.`,
        ...EPHEMERAL,
      });
    } catch (err) {
      await interaction.reply({ content: err.message, ...EPHEMERAL });
    }
    return;
  }

  if (sub === "disconnect") {
    removeXAccount(interaction.user.id);
    await interaction.reply({
      content: "Your X account has been disconnected.",
      ...EPHEMERAL,
    });
    return;
  }

  if (sub === "profile") {
    const acc = getXAccount(interaction.user.id);
    if (!acc) {
      await interaction.reply({
        content: "No X linked yet. Click **Join raid** on a raid panel, or use `/x connect`.",
        ...EPHEMERAL,
      });
      return;
    }
    await interaction.reply({
      content: `Linked: [@${acc.username}](https://x.com/${acc.username}) since <t:${Math.floor(new Date(acc.connectedAt).getTime() / 1000)}:R>.`,
      ...EPHEMERAL,
    });
  }
}
