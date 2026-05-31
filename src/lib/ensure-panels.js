import { buildVerificationPanelMessage } from "./verification-panel.js";
import { buildWaitingRoomPanelMessage } from "./waiting-room-panel.js";
import { config } from "../config.js";
import { buildOfficialLinksPanelMessage } from "../services/official-links.js";
import { listOfficialLinks } from "../services/official-links-store.js";
import { buildRoleClaimPanelMessage } from "../services/role-claims.js";
import { listRoleEntries } from "../services/role-claims-store.js";

async function channelHasBotPanel(channel, client, buttonCustomId) {
  const messages = await channel.messages.fetch({ limit: 30 });

  for (const message of messages.values()) {
    if (message.author.id !== client.user.id) continue;

    for (const row of message.components) {
      for (const component of row.components) {
        const id = component.customId;
        if (!id) continue;
        if (id === buttonCustomId) return true;
        if (buttonCustomId.endsWith(":") && id.startsWith(buttonCustomId)) return true;
      }
    }
  }

  return false;
}

export async function ensureVerificationPanels(client) {
  const guild = config.guildId
    ? await client.guilds.fetch(config.guildId).catch(() => null)
    : client.guilds.cache.first();

  if (!guild) return;

  if (config.verificationChannelId) {
    const channel = await guild.channels
      .fetch(config.verificationChannelId)
      .catch(() => null);

    if (channel?.isTextBased()) {
      const exists = await channelHasBotPanel(channel, client, "kovari:verify");
      if (!exists) {
        await channel.send(buildVerificationPanelMessage(guild));
        console.log(`Posted verify panel in #${channel.name}`);
      }
    }
  }

  if (config.waitingRoomChannelId) {
    const channel = await guild.channels
      .fetch(config.waitingRoomChannelId)
      .catch(() => null);

    if (channel?.isTextBased()) {
      const messages = await channel.messages.fetch({ limit: 30 });
      const hasPanel = [...messages.values()].some(
        (m) =>
          m.author.id === client.user.id &&
          m.embeds[0]?.title?.includes("Waiting Room"),
      );

      if (!hasPanel) {
        await channel.send(buildWaitingRoomPanelMessage(guild));
        console.log(`Posted waiting room panel in #${channel.name}`);
      }
    }
  }

  if (config.roleClaimChannelId && listRoleEntries().length > 0) {
    const channel = await guild.channels
      .fetch(config.roleClaimChannelId)
      .catch(() => null);

    if (channel?.isTextBased()) {
      const hasRolePanel = await channelHasBotPanel(
        channel,
        client,
        "kovari:roleclaim:",
      );

      if (!hasRolePanel) {
        await channel.send(buildRoleClaimPanelMessage(guild));
        console.log(`Posted role claim panel in #${channel.name}`);
      }
    }
  }

  if (config.officialLinksChannelId && listOfficialLinks().length > 0) {
    const channel = await guild.channels
      .fetch(config.officialLinksChannelId)
      .catch(() => null);

    if (channel?.isTextBased()) {
      const messages = await channel.messages.fetch({ limit: 30 });
      const hasPanel = [...messages.values()].some(
        (m) =>
          m.author.id === client.user.id &&
          m.embeds[0]?.title?.includes("Official Links"),
      );

      if (!hasPanel) {
        await channel.send(buildOfficialLinksPanelMessage(guild));
        console.log(`Posted official links panel in #${channel.name}`);
      }
    }
  }
}
