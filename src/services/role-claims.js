import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { applyButtonEmoji } from "../lib/button-emoji.js";
import { config } from "../config.js";
import { listRoleEntries, loadRoleClaims } from "./role-claims-store.js";

const MAX_BUTTONS = 25;

export function buildRoleClaimEmbed(guild) {
  const { bannerUrl } = loadRoleClaims();
  const entries = listRoleEntries();

  const roleLines =
    entries.length === 0
      ? ["_No roles configured yet._ Admins: `/roles add`"]
      : entries.map((e) => {
          const desc = e.description ? ` — ${e.description}` : "";
          return `• ${e.emoji ? `${e.emoji} ` : ""}\`${e.label}\`${desc}`;
        });

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`🎭 Choose your roles`)
    .setDescription(
      [
        "Customize your server experience — click a button below to **toggle** a role on or off.",
        "",
        ...roleLines,
        "",
        "💡 _Click the same button again to remove a role._",
      ].join("\n"),
    )
    .setThumbnail(guild.iconURL({ size: 256 }))
    .setFooter({ text: `${guild.name} • Self-assign roles` });

  const image =
    bannerUrl ?? config.roleClaimBannerUrl ?? config.welcomeBannerUrl ?? null;
  if (image) embed.setImage(image);

  return embed;
}

export function buildRoleClaimComponents() {
  const entries = listRoleEntries();
  const rows = [];

  let current = new ActionRowBuilder();

  for (const entry of entries.slice(0, MAX_BUTTONS)) {
    const button = new ButtonBuilder()
      .setCustomId(`kovari:roleclaim:${entry.roleId}`)
      .setLabel(entry.label.slice(0, 80))
      .setStyle(ButtonStyle.Secondary);

    applyButtonEmoji(button, entry.emoji);

    current.addComponents(button);

    if (current.components.length === 5) {
      rows.push(current);
      current = new ActionRowBuilder();
    }
  }

  if (current.components.length > 0) rows.push(current);

  return rows;
}

export function buildRoleClaimPanelMessage(guild) {
  return {
    embeds: [buildRoleClaimEmbed(guild)],
    components: buildRoleClaimComponents(),
  };
}

export function getRoleClaimBlockReason(member, role) {
  const bot = member.guild.members.me;
  if (!bot) return "Bot member not ready. Try again in a moment.";

  if (!bot.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return "I need the **Manage Roles** permission. Re-invite the bot with that permission.";
  }

  if (role.managed) {
    return `**${role.name}** is managed by an integration and can't be self-assigned.`;
  }

  const botTop = bot.roles.highest;
  if (role.position >= botTop.position) {
    return `Drag the **${botTop.name}** bot role **above** **${role.name}** in Server Settings → Roles.`;
  }

  if (member.id === member.guild.ownerId) {
    return "The server owner can't use self-role buttons. Test with a normal member account.";
  }

  const memberTop = member.roles.highest;
  if (memberTop.position >= botTop.position) {
    return `Your highest role (**${memberTop.name}**) is above the bot. I can only manage members **below** the bot role — test with a regular member account.`;
  }

  if (!member.manageable) {
    return "Discord won't let me edit your roles. Move the bot role higher or use a member account without admin roles above the bot.";
  }

  return null;
}

export async function toggleClaimRole(member, roleId) {
  const entries = listRoleEntries();
  const entry = entries.find((e) => e.roleId === roleId);
  if (!entry) {
    throw new Error("This role is no longer on the panel. Ask an admin to refresh it.");
  }

  const role = member.guild.roles.cache.get(roleId);
  if (!role) {
    throw new Error("That role was deleted. An admin should update the panel.");
  }

  const block = getRoleClaimBlockReason(member, role);
  if (block) throw new Error(block);

  const has = member.roles.cache.has(roleId);

  if (has) {
    await member.roles.remove(roleId);
    return { action: "removed", role, entry };
  }

  await member.roles.add(roleId);
  return { action: "added", role, entry };
}
