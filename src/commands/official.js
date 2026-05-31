import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { EPHEMERAL } from "../lib/ephemeral.js";
import { buildOfficialLinksPanelMessage } from "../services/official-links.js";
import { addOfficialLink, listOfficialLinks } from "../services/official-links-store.js";

export const data = new SlashCommandBuilder()
  .setName("official")
  .setDescription("Official links panel (admins)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("panel")
      .setDescription("Post the official links panel in this channel"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a link button to the panel")
      .addStringOption((option) =>
        option.setName("label").setDescription("Button label").setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("url")
          .setDescription("https://...")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option.setName("emoji").setDescription("Optional emoji"),
      ),
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "add") {
    const label = interaction.options.getString("label", true);
    let url = interaction.options.getString("url", true).trim();
    const emoji = interaction.options.getString("emoji") ?? "";

    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    try {
      new URL(url);
    } catch {
      await interaction.reply({ content: "Invalid URL.", ...EPHEMERAL });
      return;
    }

    addOfficialLink({ label, url, emoji });
    await interaction.reply({
      content: `Added **${label}**. Run \`/official panel\` to refresh the panel.`,
      ...EPHEMERAL,
    });
    return;
  }

  if (sub === "panel") {
    const entries = listOfficialLinks();
    if (entries.length === 0) {
      await interaction.reply({
        content:
          "No links yet. Set `OFFICIAL_X_URL` in `.env` or use `/official add`.",
        ...EPHEMERAL,
      });
      return;
    }

    await interaction.reply({ content: "Official links panel posted.", ...EPHEMERAL });
    await interaction.channel.send(buildOfficialLinksPanelMessage(interaction.guild));
  }
}
