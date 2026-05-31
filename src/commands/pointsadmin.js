import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { EPHEMERAL } from "../lib/ephemeral.js";
import {
  addPoints,
  getPointsConfig,
  isPointsAdmin,
  removePoints,
} from "../services/points.js";

export const data = new SlashCommandBuilder()
  .setName("pointsadmin")
  .setDescription("Manage points (admins)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("give")
      .setDescription("Give points to a member")
      .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
      .addIntegerOption((o) =>
        o.setName("amount").setDescription("Points").setRequired(true).setMinValue(1),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove points")
      .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
      .addIntegerOption((o) =>
        o.setName("amount").setDescription("Points").setRequired(true).setMinValue(1),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("config").setDescription("View earn rates"),
  );

export async function execute(interaction) {
  if (!isPointsAdmin(interaction.member)) {
    await interaction.reply({ content: "Admin only.", ...EPHEMERAL });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "give") {
    const user = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);
    const balance = addPoints(user.id, amount);
    const { logPointsAdjust } = await import("../services/bot-log.js");
    await logPointsAdjust(
      interaction.guild,
      interaction.user.toString(),
      user.toString(),
      amount,
      "give",
    );
    await interaction.reply({
      content: `Gave **${amount}** pts to ${user}. New balance: **${balance}**.`,
      ...EPHEMERAL,
    });
    return;
  }

  if (sub === "remove") {
    const user = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);
    try {
      const balance = removePoints(user.id, amount);
      const { logPointsAdjust } = await import("../services/bot-log.js");
      await logPointsAdjust(
        interaction.guild,
        interaction.user.toString(),
        user.toString(),
        amount,
        "remove",
      );
      await interaction.reply({
        content: `Removed **${amount}** pts from ${user}. Balance: **${balance}**.`,
        ...EPHEMERAL,
      });
    } catch (err) {
      await interaction.reply({ content: err.message, ...EPHEMERAL });
    }
    return;
  }

  if (sub === "config") {
    const cfg = getPointsConfig();
    await interaction.reply({
      content: [
        "**Points config**",
        `Message: **${cfg.messagePoints}** (cooldown ${cfg.messageCooldownSec}s)`,
        `Reaction: **${cfg.reactionPoints}** (cooldown ${cfg.reactionCooldownSec}s)`,
        `Raid: **${cfg.raidPoints}**`,
        `Min message length: ${cfg.minMessageLength}`,
        cfg.enabledChannelIds?.length
          ? `Channels: ${cfg.enabledChannelIds.map((id) => `<#${id}>`).join(", ")}`
          : "Channels: all",
        "",
        "Edit rates in `data/points.json` or ask dev to add `/pointsadmin set` later.",
      ].join("\n"),
      ...EPHEMERAL,
    });
  }
}
