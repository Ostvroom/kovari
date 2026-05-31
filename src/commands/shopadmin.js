import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { EPHEMERAL } from "../lib/ephemeral.js";
import {
  addShopItem,
  isPointsAdmin,
  listShopItems,
  removeShopItem,
} from "../services/points.js";
import { newShopId } from "../services/points-store.js";
import { resolveOptionalImage } from "../lib/image-url.js";
import {
  buildShopItemEmbed,
  buildShopPanelMessage,
} from "../services/shop.js";

export const data = new SlashCommandBuilder()
  .setName("shopadmin")
  .setDescription("Manage shop items (admins)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("panel")
      .setDescription("Post the marketplace panel in this channel"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add shop item")
      .addStringOption((o) => o.setName("name").setDescription("Name").setRequired(true))
      .addIntegerOption((o) =>
        o.setName("cost").setDescription("Point cost").setRequired(true).setMinValue(1),
      )
      .addIntegerOption((o) =>
        o
          .setName("stock")
          .setDescription("How many available (omit = unlimited)")
          .setMinValue(0),
      )
      .addStringOption((o) => o.setName("description").setDescription("Short description"))
      .addRoleOption((o) =>
        o.setName("role").setDescription("Role granted on purchase (optional)"),
      )
      .addStringOption((o) =>
        o.setName("image_url").setDescription("Optional image URL (https://…)"),
      )
      .addAttachmentOption((o) =>
        o.setName("image").setDescription("Optional image upload"),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove shop item")
      .addStringOption((o) => o.setName("id").setDescription("Item ID").setRequired(true)),
  );

export async function execute(interaction) {
  if (!isPointsAdmin(interaction.member)) {
    await interaction.reply({ content: "Admin only.", ...EPHEMERAL });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "panel") {
    const items = listShopItems();
    if (!items.length) {
      await interaction.reply({
        content: "Add items first with `/shopadmin add`, then post the panel.",
        ...EPHEMERAL,
      });
      return;
    }
    await interaction.channel.send(buildShopPanelMessage(interaction.guild));
    await interaction.reply({
      content: "Marketplace panel posted with buy buttons.",
      ...EPHEMERAL,
    });
    return;
  }

  if (sub === "add") {
    const name = interaction.options.getString("name", true);
    const cost = interaction.options.getInteger("cost", true);
    const description = interaction.options.getString("description") ?? "";
    const stockOpt = interaction.options.getInteger("stock");
    const stock = stockOpt == null ? null : stockOpt;
    const role = interaction.options.getRole("role");
    const imageUrl = resolveOptionalImage(interaction);
    const item = addShopItem({
      id: newShopId(),
      name,
      cost,
      description,
      stock,
      roleId: role?.id ?? null,
      imageUrl,
    });
    const { logShopItemAdded } = await import("../services/bot-log.js");
    await logShopItemAdded(interaction.guild, interaction.user.toString(), item);

    const stockNote =
      item.stock == null ? "unlimited stock" : `**${item.stock}** in stock`;
    await interaction.reply({
      content: `Added **${item.name}** (\`${item.id}\`) — **${item.cost}** pts, ${stockNote}.${imageUrl ? " (with image)" : ""} Repost \`/shop panel\` to refresh the channel panel.`,
      embeds: [buildShopItemEmbed(interaction.guild, item)],
      ...EPHEMERAL,
    });
    return;
  }

  if (sub === "remove") {
    const id = interaction.options.getString("id", true);
    if (!removeShopItem(id)) {
      await interaction.reply({ content: "Item not found.", ...EPHEMERAL });
      return;
    }
    await interaction.reply({ content: `Removed item \`${id}\`.`, ...EPHEMERAL });
  }
}
