import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { EPHEMERAL } from "../lib/ephemeral.js";
import { buildRaidPanelComponents } from "../lib/raid-panel.js";
import {
  buildRaidEmbed,
  createRaid,
  endRaid,
  isRaidAdmin,
} from "../services/raids.js";
import { listActiveRaids, saveRaid } from "../services/raids-store.js";

export const data = new SlashCommandBuilder()
  .setName("raid")
  .setDescription("X raid system (admins)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("post")
      .setDescription("Post a raid for a tweet")
      .addStringOption((option) =>
        option
          .setName("url")
          .setDescription("Tweet URL (x.com/.../status/...)")
          .setRequired(true),
      )
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel to post in (default: this channel)"),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("end")
      .setDescription("End a raid by ID")
      .addStringOption((option) =>
        option.setName("id").setDescription("Raid ID from the embed footer").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("List active raids"),
  );

export async function execute(interaction) {
  if (!isRaidAdmin(interaction.member)) {
    await interaction.reply({
      content: "You need Administrator or a configured admin role.",
      ...EPHEMERAL,
    });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "post") {
    await interaction.deferReply(EPHEMERAL);

    const url = interaction.options.getString("url", true);
    const channel =
      interaction.options.getChannel("channel") ?? interaction.channel;

    if (!channel?.isTextBased()) {
      await interaction.editReply({ content: "Invalid channel." });
      return;
    }

    try {
      const { raid, tweet } = await createRaid({
        tweetUrl: url,
        createdBy: interaction.user.id,
        channelId: channel.id,
      });

      const embed = buildRaidEmbed(interaction.guild, raid, tweet);
      const components = buildRaidPanelComponents(raid);
      const ping = config.raidPingRoleId
        ? `<@&${config.raidPingRoleId}>`
        : null;
      const msg = await channel.send({
        content: ping,
        embeds: [embed],
        components,
        allowedMentions: config.raidPingRoleId
          ? { roles: [config.raidPingRoleId] }
          : undefined,
      });

      raid.messageId = msg.id;
      saveRaid(raid);

      const { logRaidPosted } = await import("../services/bot-log.js");
      await logRaidPosted(interaction.guild, raid, interaction.user.toString());

      const logChannels = [
        ...new Set(
          [config.botLogChannelId, config.raidLogChannelId].filter(Boolean),
        ),
      ];
      const logHint =
        logChannels.length > 0
          ? logChannels.map((id) => `<#${id}>`).join(" + ")
          : "_set BOT_LOG_CHANNEL_ID / RAID_LOG_CHANNEL_ID in .env_";

      await interaction.editReply({
        content: `Raid **#${raid.id}** posted in ${channel}. Logs → ${logHint}.`,
      });
    } catch (err) {
      await interaction.editReply({
        content: err.message ?? "Failed to create raid.",
      });
    }
    return;
  }

  if (sub === "end") {
    const id = interaction.options.getString("id", true);
    try {
      endRaid(id);
      const { logRaidEnded } = await import("../services/bot-log.js");
      await logRaidEnded(interaction.guild, id, interaction.user.toString());
      await interaction.reply({ content: `Raid **#${id}** ended.`, ...EPHEMERAL });
    } catch (err) {
      await interaction.reply({ content: err.message, ...EPHEMERAL });
    }
    return;
  }

  if (sub === "list") {
    const active = listActiveRaids();
    if (active.length === 0) {
      await interaction.reply({ content: "No active raids.", ...EPHEMERAL });
      return;
    }
    const lines = active.map(
      (r) => `• **#${r.id}** — <#${r.channelId}> — [tweet](${r.tweetUrl})`,
    );
    await interaction.reply({
      content: `**Active raids:**\n${lines.join("\n")}`,
      ...EPHEMERAL,
    });
  }
}
