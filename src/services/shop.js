import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { config } from "../config.js";
import { applyEmbedImage } from "../lib/image-url.js";
import {
  decrementShopStock,
  formatShopStock,
  getShopItem,
  isShopOutOfStock,
  isShopUnlimitedStock,
  listShopItems,
  removePoints,
  addPoints,
} from "./points.js";

const MAX_SHOP_BUTTONS = 25;
const PANEL_COLOR = 0xfee75c;

function shopBannerUrl() {
  return (
    config.shopBannerUrl ??
    config.roleClaimBannerUrl ??
    config.welcomeBannerUrl ??
    null
  );
}

function formatStockLine(item) {
  if (isShopOutOfStock(item)) return "Sold out";
  return formatShopStock(item);
}

/** Compact product line for panel / list. */
function formatItemLine(item) {
  const lines = [`**${item.name}** \`${item.id}\` — **${item.cost}** pts · ${formatStockLine(item)}`];
  if (item.description) lines.push(`> ${item.description}`);
  if (item.roleId) lines.push(`> Reward: <@&${item.roleId}>`);
  return lines.join("\n");
}

function formatCatalogBlock(items) {
  if (!items.length) return "_No items in stock._";
  return items.map(formatItemLine).join("\n\n").slice(0, 3500);
}

export async function purchaseShopItem(member, itemId) {
  const item = getShopItem(itemId);
  if (!item) throw new Error("Item not found.");
  if (isShopOutOfStock(item)) {
    throw new Error("This item is **sold out**.");
  }

  const balance = removePoints(member.id, item.cost);

  try {
    if (item.roleId) {
      const role = member.guild.roles.cache.get(item.roleId);
      if (!role) throw new Error("Shop role is missing on this server. Contact an admin.");
      if (member.roles.cache.has(item.roleId)) {
        throw new Error("You already have this reward.");
      }
      if (role.position >= member.guild.members.me.roles.highest.position) {
        throw new Error("Bot cannot assign this role — move the bot role higher.");
      }
      await member.roles.add(role, "Kovari shop purchase");
    }

    if (!isShopUnlimitedStock(item)) {
      decrementShopStock(itemId);
    }

    const { logShopPurchase } = await import("./bot-log.js");
    await logShopPurchase(member.guild, member.id, item, balance);

    return { item: getShopItem(itemId) ?? item, balance };
  } catch (err) {
    addPoints(member.id, item.cost);
    throw err;
  }
}

export function buildShopItemEmbed(guild, item) {
  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle(item.name)
    .setDescription(
      [
        item.description || null,
        `**${item.cost}** points · ${formatStockLine(item)}`,
        item.roleId ? `Reward: <@&${item.roleId}>` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .setFooter({ text: `${guild.name}` });

  applyEmbedImage(embed, item.imageUrl);
  embed.setFooter({ text: `${guild.name} · ID: ${item.id}` });
  return embed;
}

export function buildShopListEmbed(guild) {
  const items = listShopItems();
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Marketplace")
    .setDescription(formatCatalogBlock(items))
    .setFooter({ text: `${guild.name} · ${items.length} item(s)` });
}

/** Clean single-card shop panel. */
export function buildShopPanelEmbed(guild) {
  const items = listShopItems();
  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setAuthor({
      name: guild.name,
      iconURL: guild.iconURL({ size: 64 }) ?? undefined,
    })
    .setTitle("Marketplace")
    .setDescription(
      [
        "Earn points in chat, reactions, and raids.",
        "Check balance: `/points balance`",
        "",
        "───────────────",
        "",
        formatCatalogBlock(items),
        "",
        "───────────────",
        "",
        items.length ? "**Select an item below to purchase.**" : "_Admins: `/shop add`_",
      ].join("\n"),
    )
    .setFooter({ text: "Kovari Shop" });

  const banner = shopBannerUrl();
  if (banner) embed.setImage(banner);

  return embed;
}

function shopBuyButtonLabel(item) {
  const soldOut = isShopOutOfStock(item);
  const base = `${item.name} · ${item.cost}p`;
  if (soldOut) {
    const prefix = "Sold out · ";
    return `${prefix}${item.name}`.slice(0, 80);
  }
  return base.slice(0, 80);
}

export function buildShopPanelComponents() {
  const items = listShopItems();
  const rows = [];
  let current = new ActionRowBuilder();

  for (const item of items.slice(0, MAX_SHOP_BUTTONS)) {
    const soldOut = isShopOutOfStock(item);
    const button = new ButtonBuilder()
      .setCustomId(`kovari:shop:buy:${item.id}`)
      .setLabel(shopBuyButtonLabel(item))
      .setStyle(soldOut ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(soldOut);

    current.addComponents(button);

    if (current.components.length === 5) {
      rows.push(current);
      current = new ActionRowBuilder();
    }
  }

  if (current.components.length > 0) rows.push(current);
  return rows;
}

export function buildShopPanelMessage(guild) {
  return {
    embeds: [buildShopPanelEmbed(guild)],
    components: buildShopPanelComponents(),
  };
}

/** Refresh a posted shop panel message after stock changes. */
export async function refreshShopPanelMessage(message) {
  if (!message.guild) return;
  await message.edit(buildShopPanelMessage(message.guild));
}
