import { SlashCommandBuilder } from "discord.js";
import { EPHEMERAL } from "../lib/ephemeral.js";
import {
  getShopItem,
  listShopItems,
} from "../services/points.js";
import {
  buildShopItemEmbed,
  buildShopListEmbed,
  buildShopPanelMessage,
  purchaseShopItem,
} from "../services/shop.js";

export const data = new SlashCommandBuilder()
  .setName("shop")
  .setDescription("Spend points in the marketplace")
  .addSubcommand((sub) => sub.setName("list").setDescription("View shop items"))
  .addSubcommand((sub) =>
    sub
      .setName("view")
      .setDescription("View one item (with image if set)")
      .addStringOption((o) =>
        o.setName("id").setDescription("Item ID from /shop list").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("buy")
      .setDescription("Buy an item")
      .addStringOption((o) =>
        o.setName("id").setDescription("Item ID from /shop list").setRequired(true),
      ),
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "list") {
    await interaction.reply({
      embeds: [buildShopListEmbed(interaction.guild)],
      ...EPHEMERAL,
    });
    return;
  }

  if (sub === "view") {
    const id = interaction.options.getString("id", true).trim();
    const item = getShopItem(id);
    if (!item) {
      await interaction.reply({ content: "Item not found.", ...EPHEMERAL });
      return;
    }
    await interaction.reply({
      embeds: [buildShopItemEmbed(interaction.guild, item)],
      ...EPHEMERAL,
    });
    return;
  }

  if (sub === "buy") {
    const id = interaction.options.getString("id", true).trim();
    try {
      const { item, balance } = await purchaseShopItem(interaction.member, id);
      await interaction.reply({
        content: `Purchased **${item.name}** for **${item.cost}** pts. Balance: **${balance}**.`,
        embeds: [buildShopItemEmbed(interaction.guild, item)],
        ...EPHEMERAL,
      });
    } catch (err) {
      await interaction.reply({ content: err.message, ...EPHEMERAL });
    }
  }
}
