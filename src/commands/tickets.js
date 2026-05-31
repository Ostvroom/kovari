import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { EPHEMERAL } from "../lib/ephemeral.js";
import { buildTicketPanelMessage } from "../events/handlers/ticket-buttons.js";
import { closeTicketChannel, isTicketStaff, saveTicketPanel, saveTicketSetup } from "../services/tickets.js";
import { getTicketByChannel, loadTickets } from "../services/tickets-store.js";

export const data = new SlashCommandBuilder()
  .setName("tickets")
  .setDescription("Kovari support tickets (admins)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("setup")
      .setDescription("Set ticket category and staff role")
      .addChannelOption((option) =>
        option
          .setName("category")
          .setDescription("Category for new tickets (e.g. SUPPORT)")
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(true),
      )
      .addRoleOption((option) =>
        option.setName("staff_role").setDescription("Role that can see all tickets"),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("panel").setDescription("Post the Kovari ticket panel in this channel"),
  )
  .addSubcommand((sub) =>
    sub.setName("close").setDescription("Close the current ticket channel"),
  )
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Show ticket system configuration"),
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "setup") {
    const category = interaction.options.getChannel("category", true);
    const staffRole = interaction.options.getRole("staff_role");
    const staffRoleIds = staffRole
      ? [...new Set([...loadTickets().staffRoleIds, staffRole.id])]
      : loadTickets().staffRoleIds;

    saveTicketSetup({ categoryId: category.id, staffRoleIds });

    await interaction.reply({
      content: [
        `Ticket category: **${category.name}**`,
        staffRole ? `Staff role: ${staffRole}` : "_No new staff role added_",
        "",
        "Run `/tickets panel` in your support channel.",
      ].join("\n"),
      ...EPHEMERAL,
    });
    return;
  }

  if (sub === "panel") {
    const msg = await interaction.channel.send(buildTicketPanelMessage(interaction.guild));
    saveTicketPanel(interaction.channel.id, msg.id);
    await interaction.reply({
      content: "Kovari ticket panel posted.",
      ...EPHEMERAL,
    });
    return;
  }

  if (sub === "close") {
    const ticket = getTicketByChannel(interaction.channelId);
    if (!ticket) {
      await interaction.reply({
        content: "Use this inside a ticket channel, or press **Close ticket** there.",
        ...EPHEMERAL,
      });
      return;
    }
    if (!isTicketStaff(interaction.member) && ticket.userId !== interaction.user.id) {
      await interaction.reply({ content: "You cannot close this ticket.", ...EPHEMERAL });
      return;
    }
    await closeTicketChannel(interaction.channel, interaction.user.toString());
    await interaction.reply({ content: "Closing ticket…", ...EPHEMERAL });
    return;
  }

  if (sub === "status") {
    const data = loadTickets();
    await interaction.reply({
      content: [
        "**Kovari tickets**",
        `Category: ${data.categoryId ? `<#${data.categoryId}>` : "_not set_"}`,
        `Staff roles: ${data.staffRoleIds.length ? data.staffRoleIds.map((id) => `<@&${id}>`).join(", ") : "_none_"}`,
        `Open tickets: **${Object.keys(data.open).length}**`,
        `Next number: **${data.counter + 1}**`,
        data.panelChannelId
          ? `Panel: <#${data.panelChannelId}>`
          : "Panel: _not posted_",
      ].join("\n"),
      ...EPHEMERAL,
    });
  }
}
