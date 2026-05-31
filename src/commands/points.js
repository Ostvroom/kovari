import { SlashCommandBuilder } from "discord.js";
import { EPHEMERAL } from "../lib/ephemeral.js";
import {
  addPoints,
  getBalance,
  getLeaderboard,
  getPointsConfig,
  isPointsAdmin,
  removePoints,
  updatePointsConfig,
} from "../services/points.js";

export const data = new SlashCommandBuilder()
  .setName("points")
  .setDescription("Kovari points")
  .addSubcommand((sub) =>
    sub.setName("balance").setDescription("Your point balance"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("leaderboard")
      .setDescription("Top balances")
      .addIntegerOption((o) =>
        o.setName("limit").setDescription("How many (max 25)").setMinValue(5).setMaxValue(25),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("give")
      .setDescription("Give points to a member (admin)")
      .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
      .addIntegerOption((o) =>
        o.setName("amount").setDescription("Points").setRequired(true).setMinValue(1),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove points (admin)")
      .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
      .addIntegerOption((o) =>
        o.setName("amount").setDescription("Points").setRequired(true).setMinValue(1),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("config").setDescription("View or set earn rates (admin)"),
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "balance") {
    const bal = getBalance(interaction.user.id);
    const cfg = getPointsConfig();
    await interaction.reply({
      content: [
        `You have **${bal}** points.`,
        "",
        `_Earn: ${cfg.messagePoints}/msg · ${cfg.reactionPoints}/reaction · ${cfg.raidPoints}/raid_`,
      ].join("\n"),
      ...EPHEMERAL,
    });
    return;
  }

  if (sub === "leaderboard") {
    const limit = interaction.options.getInteger("limit") ?? 10;
    const top = getLeaderboard(limit);
    if (!top.length) {
      await interaction.reply({ content: "No points yet.", ...EPHEMERAL });
      return;
    }
    const lines = top.map(
      (row, i) => `**${i + 1}.** <@${row.userId}> — **${row.balance}** pts`,
    );
    await interaction.reply({
      content: `**Leaderboard**\n${lines.join("\n")}`,
    });
    return;
  }

  if (sub === "give" || sub === "remove" || sub === "config") {
    if (!isPointsAdmin(interaction.member)) {
      await interaction.reply({ content: "Admin only.", ...EPHEMERAL });
      return;
    }
  }

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
        "Edit rates in `data/points.json` or ask dev to add `/points set` later.",
      ].join("\n"),
      ...EPHEMERAL,
    });
  }
}
