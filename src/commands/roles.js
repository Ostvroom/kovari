import {
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { EPHEMERAL } from "../lib/ephemeral.js";
import {
  buildRoleClaimPanelMessage,
  getRoleClaimBlockReason,
} from "../services/role-claims.js";
import {
  addRoleEntry,
  listRoleEntries,
  removeRoleEntry,
  setRoleClaimBanner,
} from "../services/role-claims-store.js";

export const data = new SlashCommandBuilder()
  .setName("roles")
  .setDescription("Self-assign role panel (admins)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("panel")
      .setDescription("Post the role claim panel in this channel"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add or update a role on the panel")
      .addRoleOption((option) =>
        option.setName("role").setDescription("Role to assign").setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("label")
          .setDescription("Button label")
          .setRequired(true)
          .setMaxLength(80),
      )
      .addStringOption((option) =>
        option
          .setName("emoji")
          .setDescription("Button emoji (optional)")
          .setMaxLength(32),
      )
      .addStringOption((option) =>
        option
          .setName("description")
          .setDescription("Short line on the embed (optional)")
          .setMaxLength(120),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a role from the panel")
      .addRoleOption((option) =>
        option.setName("role").setDescription("Role to remove").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("List roles on the panel"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("setbanner")
      .setDescription("Set panel banner image URL")
      .addStringOption((option) =>
        option
          .setName("url")
          .setDescription("Direct image URL (empty to clear)")
          .setRequired(false),
      ),
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "panel") {
    const entries = listRoleEntries();
    if (entries.length === 0) {
      await interaction.reply({
        content:
          "Add roles first with `/roles add role:@Role label:News emoji:📢 description:Get pings`",
        ...EPHEMERAL,
      });
      return;
    }

    await interaction.reply({ content: "Role panel posted.", ...EPHEMERAL });
    await interaction.channel.send(buildRoleClaimPanelMessage(interaction.guild));
    return;
  }

  if (sub === "add") {
    const role = interaction.options.getRole("role", true);
    const label = interaction.options.getString("label", true);
    const emoji = interaction.options.getString("emoji") ?? "";
    const description = interaction.options.getString("description") ?? "";

    const entries = listRoleEntries();
    if (entries.length >= 25 && !entries.some((e) => e.roleId === role.id)) {
      await interaction.reply({
        content: "Maximum **25** roles per panel. Remove one with `/roles remove` first.",
        ...EPHEMERAL,
      });
      return;
    }

    const probe = await interaction.guild.members.fetch(interaction.user.id);
    const block = getRoleClaimBlockReason(probe, role);
    const hierarchyWarn = block
      ? `\n⚠️ **Hierarchy:** ${block}`
      : "\n✅ Bot can assign this role to normal members.";

    addRoleEntry({
      roleId: role.id,
      label,
      emoji,
      description,
    });

    await interaction.reply({
      content: `Added **${label}** (\`${role.name}\`) to the panel. Run \`/roles panel\` to post or refresh.${hierarchyWarn}`,
      ...EPHEMERAL,
    });
    return;
  }

  if (sub === "remove") {
    const role = interaction.options.getRole("role", true);
    removeRoleEntry(role.id);
    await interaction.reply({
      content: `Removed \`${role.name}\` from the panel. Repost with \`/roles panel\` if needed.`,
      ...EPHEMERAL,
    });
    return;
  }

  if (sub === "list") {
    const entries = listRoleEntries();
    if (entries.length === 0) {
      await interaction.reply({ content: "No roles on the panel yet.", ...EPHEMERAL });
      return;
    }

    const lines = entries.map(
      (e, i) =>
        `${i + 1}. <@&${e.roleId}> — \`${e.label}\`${e.description ? ` — ${e.description}` : ""}`,
    );

    await interaction.reply({
      content: `**Role panel (${entries.length}/25):**\n${lines.join("\n")}`,
      ...EPHEMERAL,
    });
    return;
  }

  if (sub === "setbanner") {
    const url = interaction.options.getString("url");
    setRoleClaimBanner(url);
    await interaction.reply({
      content: url
        ? "Panel banner updated. Repost with `/roles panel`."
        : "Panel banner cleared.",
      ...EPHEMERAL,
    });
  }
}
