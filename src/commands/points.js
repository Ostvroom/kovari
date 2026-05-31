import { SlashCommandBuilder } from "discord.js";
import { EPHEMERAL } from "../lib/ephemeral.js";
import {
  getBalance,
  getLeaderboard,
  getPointsConfig,
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
  }
}
