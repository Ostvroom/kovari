import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { EPHEMERAL } from "../lib/ephemeral.js";
import {
  clearChannelLevel,
  getChannelLevel,
  listChannelLevels,
  setChannelLevel,
} from "../services/link-protection-store.js";
import { levelLabel } from "../services/link-filter.js";

export const data = new SlashCommandBuilder()
  .setName("links")
  .setDescription("Configure link protection per channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("Set protection level for this channel")
      .addStringOption((option) =>
        option
          .setName("level")
          .setDescription("full | medium | default")
          .setRequired(true)
          .addChoices(
            { name: "Full — no links", value: "full" },
            { name: "Medium — Twitter + Discord invites", value: "medium" },
            { name: "Default — Twitter/X only", value: "default" },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("clear")
      .setDescription("Remove custom level (use server default rules)"),
  )
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Show this channel's link protection"),
  )
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("List all configured channels"),
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "set") {
    const level = interaction.options.getString("level", true);
    setChannelLevel(interaction.channel.id, level);
    await interaction.reply({
      content: `Link protection for ${interaction.channel} set to **${levelLabel(level)}**.`,
      ...EPHEMERAL,
    });
    return;
  }

  if (sub === "clear") {
    clearChannelLevel(interaction.channel.id);
    await interaction.reply({
      content: `Custom protection removed. ${interaction.channel} uses **${levelLabel("default")}**.`,
      ...EPHEMERAL,
    });
    return;
  }

  if (sub === "status") {
    const level = getChannelLevel(interaction.channel.id);
    await interaction.reply({
      content: [
        `**Channel:** ${interaction.channel}`,
        `**Level:** ${levelLabel(level)}`,
        `**Admins** (Administrator or \`ADMIN_ROLE_IDS\`) bypass all link rules.`,
      ].join("\n"),
      ...EPHEMERAL,
    });
    return;
  }

  if (sub === "list") {
    const channels = listChannelLevels();
    const entries = Object.entries(channels);

    if (entries.length === 0) {
      await interaction.reply({
        content: "No channels configured. Use `/links set` in each channel.",
        ...EPHEMERAL,
      });
      return;
    }

    const lines = entries.map(
      ([id, level]) => `• <#${id}> — ${levelLabel(level)}`,
    );

    await interaction.reply({
      content: `**Link protection channels:**\n${lines.join("\n")}`,
      ...EPHEMERAL,
    });
  }
}
