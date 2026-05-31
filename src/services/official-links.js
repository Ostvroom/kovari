import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { applyButtonEmoji } from "../lib/button-emoji.js";
import { config } from "../config.js";
import { listOfficialLinks } from "./official-links-store.js";

export function buildOfficialLinksEmbed(guild) {
  const entries = listOfficialLinks();

  const liveLines = entries.map(
    (e) => `• ${e.emoji ? `${e.emoji} ` : ""}**${e.label}** — ${e.url}`,
  );

  const embed = new EmbedBuilder()
    .setColor(0x1d9bf0)
    .setTitle("🔗 Official Links")
    .setDescription(
      [
        "Official **Kovari** links — tap a button below to open.",
        "",
        ...(liveLines.length > 0 ? liveLines : ["_No links configured yet._"]),
        "",
        "⏳ _More links coming soon…_",
      ].join("\n"),
    )
    .setThumbnail(guild.iconURL({ size: 256 }))
    .setFooter({ text: `${guild.name} • Official only` });

  const banner =
    config.officialLinksBannerUrl ??
    config.welcomeBannerUrl ??
    guild.bannerURL({ size: 1024 }) ??
    null;
  if (banner) embed.setImage(banner);

  return embed;
}

export function buildOfficialLinksComponents() {
  const entries = listOfficialLinks();
  const rows = [];
  let row = new ActionRowBuilder();

  for (const entry of entries.slice(0, 25)) {
    try {
      const button = new ButtonBuilder()
        .setLabel(entry.label.slice(0, 80))
        .setStyle(ButtonStyle.Link)
        .setURL(entry.url);
      applyButtonEmoji(button, entry.emoji);
      row.addComponents(button);
    } catch {
      continue;
    }

    if (row.components.length === 5) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
  }

  if (row.components.length > 0) rows.push(row);
  return rows;
}

export function buildOfficialLinksPanelMessage(guild) {
  return {
    embeds: [buildOfficialLinksEmbed(guild)],
    components: buildOfficialLinksComponents(),
  };
}
