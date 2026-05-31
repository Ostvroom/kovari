import { EPHEMERAL } from "../../lib/ephemeral.js";
import { buildGiveawayComponents, buildGiveawayEmbed } from "../../services/giveaways.js";
import { enterGiveaway, getGiveaway } from "../../services/points.js";
import {
  buildShopItemEmbed,
  purchaseShopItem,
  refreshShopPanelMessage,
} from "../../services/shop.js";

export async function handlePointsInteraction(interaction) {
  if (interaction.isButton() && interaction.customId.startsWith("kovari:shop:buy:")) {
    const itemId = interaction.customId.split(":")[3];
    await interaction.deferReply(EPHEMERAL);

    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const { item, balance } = await purchaseShopItem(member, itemId);
      await refreshShopPanelMessage(interaction.message);
      await interaction.editReply({
        content: `Purchased **${item.name}** for **${item.cost}** pts. Balance: **${balance}**.`,
        embeds: [buildShopItemEmbed(interaction.guild, item)],
      });
    } catch (err) {
      await interaction.editReply({ content: err.message });
    }
    return true;
  }

  if (
    !interaction.isButton() ||
    !interaction.customId.startsWith("kovari:giveaway:enter:")
  ) {
    return false;
  }

  const giveawayId = interaction.customId.split(":")[3];
  await interaction.deferReply(EPHEMERAL);

  try {
    const g = enterGiveaway(giveawayId, interaction.user.id);
    const { logGiveawayEntry } = await import("../../services/bot-log.js");
    await logGiveawayEntry(
      interaction.guild,
      interaction.user.id,
      g,
      g.entries.length,
    );
    await interaction.message.edit({
      embeds: [buildGiveawayEmbed(g, interaction.guild)],
      components: buildGiveawayComponents(g),
    });
    await interaction.editReply({
      content: `You're in! **${g.cost}** points spent. Entries: **${g.entries.length}**. Good luck.`,
    });
  } catch (err) {
    await interaction.editReply({ content: err.message });
  }

  return true;
}
