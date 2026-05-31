import { EPHEMERAL } from "../../lib/ephemeral.js";
import {
  buildTicketPanelComponents,
  buildTicketPanelEmbed,
} from "../../lib/ticket-panel.js";
import {
  closeTicketChannel,
  createTicketChannel,
  isTicketStaff,
} from "../../services/tickets.js";
import { getTicketByChannel } from "../../services/tickets-store.js";

export async function handleTicketInteraction(interaction) {
  if (interaction.isButton() && interaction.customId === "kovari:ticket:create") {
    await interaction.deferReply(EPHEMERAL);
    try {
      const { channel, number } = await createTicketChannel(
        interaction.guild,
        interaction.member,
      );
      await interaction.editReply({
        content: `✓ Ticket created: ${channel} (#${String(number).padStart(4, "0")})`,
      });
    } catch (err) {
      await interaction.editReply({ content: err.message });
    }
    return true;
  }

  if (interaction.isButton() && interaction.customId === "kovari:ticket:close") {
    await interaction.deferReply(EPHEMERAL);
    const ticket = getTicketByChannel(interaction.channelId);
    if (!ticket) {
      await interaction.editReply({ content: "Not a ticket channel." });
      return true;
    }

    const isOwner = ticket.userId === interaction.user.id;
    if (!isOwner && !isTicketStaff(interaction.member)) {
      await interaction.editReply({
        content: "Only the ticket owner or staff can close this ticket.",
      });
      return true;
    }

    try {
      await closeTicketChannel(interaction.channel, interaction.user.toString());
      await interaction.editReply({ content: "Closing ticket…" });
    } catch (err) {
      await interaction.editReply({ content: err.message });
    }
    return true;
  }

  return false;
}

export function buildTicketPanelMessage(guild) {
  return {
    embeds: [buildTicketPanelEmbed(guild)],
    components: buildTicketPanelComponents(),
  };
}
