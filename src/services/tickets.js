import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { config } from "../config.js";
import { buildTicketChannelComponents } from "../lib/ticket-panel.js";
import {
  getOpenTicketForUser,
  getTicketByChannel,
  loadTickets,
  nextTicketNumber,
  registerOpenTicket,
  removeOpenTicket,
  setTicketSettings,
} from "./tickets-store.js";

export function isTicketStaff(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (config.adminRoleIds.some((id) => member.roles.cache.has(id))) return true;
  const data = loadTickets();
  return data.staffRoleIds.some((id) => member.roles.cache.has(id));
}

export function formatTicketName(num) {
  return `ticket-${String(num).padStart(4, "0")}`;
}

export function getStaffRoleIds() {
  const data = loadTickets();
  const ids = new Set([...config.adminRoleIds, ...data.staffRoleIds]);
  if (config.ticketStaffRoleIds?.length) {
    for (const id of config.ticketStaffRoleIds) ids.add(id);
  }
  return [...ids];
}

export async function createTicketChannel(guild, member) {
  const data = loadTickets();
  if (!data.categoryId) {
    throw new Error("Tickets are not set up yet. An admin must run `/tickets setup`.");
  }

  const existing = getOpenTicketForUser(member.id);
  if (existing) {
    const [, ticket] = existing;
    throw new Error(`You already have an open ticket: <#${ticket.channelId}>`);
  }

  const category = await guild.channels.fetch(data.categoryId).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) {
    throw new Error("Ticket category is missing. Run `/tickets setup` again.");
  }

  const num = nextTicketNumber();
  const name = formatTicketName(num);

  const overwrites = [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: member.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  for (const roleId of getStaffRoleIds()) {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `Kovari ticket #${num} • ${member.user.tag}`,
    permissionOverwrites: overwrites,
  });

  registerOpenTicket(channel.id, {
    number: num,
    userId: member.id,
    channelId: channel.id,
    createdAt: new Date().toISOString(),
  });

  const welcome = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`Ticket #${String(num).padStart(4, "0")}`)
    .setDescription(
      [
        `Hello ${member}, thanks for contacting **${guild.name}** support.`,
        "",
        "Describe your issue and a team member will respond soon.",
        "",
        "Staff or you can press **Close ticket** when finished.",
      ].join("\n"),
    )
    .setFooter({ text: "Kovari" })
    .setTimestamp();

  await channel.send({
    content: `${member}${getStaffRoleIds().map((id) => `<@&${id}>`).join(" ")}`.trim(),
    embeds: [welcome],
    components: buildTicketChannelComponents(),
    allowedMentions: { users: [member.id], roles: getStaffRoleIds() },
  });

  const { logTicketOpened } = await import("./bot-log.js");
  await logTicketOpened(guild, member.id, channel, num);

  return { channel, number: num };
}

export async function closeTicketChannel(channel, closedBy) {
  const ticket = getTicketByChannel(channel.id);
  if (!ticket) {
    throw new Error("This is not an active Kovari ticket channel.");
  }

  removeOpenTicket(channel.id);

  const { logTicketClosed } = await import("./bot-log.js");
  await logTicketClosed(channel.guild, ticket, closedBy);

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setDescription(`Ticket closed by ${closedBy}. This channel will be deleted in a few seconds.`)
    .setFooter({ text: "Kovari" });

  await channel.send({ embeds: [embed] });

  setTimeout(() => {
    channel.delete("Kovari ticket closed").catch(() => {});
  }, 5000);

  return ticket;
}

export function saveTicketPanel(channelId, messageId) {
  return setTicketSettings({ panelChannelId: channelId, panelMessageId: messageId });
}

export function saveTicketSetup({ categoryId, staffRoleIds }) {
  const patch = {};
  if (categoryId) patch.categoryId = categoryId;
  if (staffRoleIds?.length) patch.staffRoleIds = staffRoleIds;
  return setTicketSettings(patch);
}
