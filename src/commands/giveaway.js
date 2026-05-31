import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { EPHEMERAL } from "../lib/ephemeral.js";
import { resolveOptionalImage } from "../lib/image-url.js";
import {
  buildGiveawayComponents,
  buildGiveawayEmbed,
  createGiveawayRecord,
  finalizeGiveaway,
} from "../services/giveaways.js";
import { isPointsAdmin, saveGiveaway } from "../services/points.js";
import { logGiveawayStarted } from "../services/bot-log.js";

export const data = new SlashCommandBuilder()
  .setName("giveaway")
  .setDescription("Point-entry giveaways & raffles")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("start")
      .setDescription("Start a giveaway (admin)")
      .addStringOption((o) => o.setName("prize").setDescription("Prize").setRequired(true))
      .addIntegerOption((o) =>
        o.setName("cost").setDescription("Points to enter").setRequired(true).setMinValue(0),
      )
      .addIntegerOption((o) =>
        o
          .setName("winners")
          .setDescription("Number of winners")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(20),
      )
      .addIntegerOption((o) =>
        o
          .setName("minutes")
          .setDescription("Duration in minutes")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(10080),
      )
      .addStringOption((o) =>
        o
          .setName("description")
          .setDescription("Short description (shown on card; defaults to prize)"),
      )
      .addBooleanOption((o) =>
        o.setName("follow_x").setDescription("Require follow on X"),
      )
      .addStringOption((o) =>
        o
          .setName("x_url")
          .setDescription("X profile URL (default: OFFICIAL_X_URL in .env)"),
      )
      .addBooleanOption((o) =>
        o.setName("join_discord").setDescription("Require join Discord"),
      )
      .addStringOption((o) =>
        o
          .setName("invite_url")
          .setDescription("Discord invite (partner server; omit = this server)"),
      )
      .addStringOption((o) =>
        o.setName("image_url").setDescription("Optional banner image URL"),
      )
      .addAttachmentOption((o) =>
        o.setName("image").setDescription("Optional image upload"),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("end")
      .setDescription("End early & draw winners in this channel (admin)")
      .addStringOption((o) =>
        o.setName("id").setDescription("Giveaway ID from embed footer").setRequired(true),
      ),
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "start") {
    if (!isPointsAdmin(interaction.member)) {
      await interaction.reply({ content: "Admin only.", ...EPHEMERAL });
      return;
    }

    const prize = interaction.options.getString("prize", true);
    const description = interaction.options.getString("description") ?? prize;
    const cost = interaction.options.getInteger("cost", true);
    const winnerCount = interaction.options.getInteger("winners", true);
    const minutes = interaction.options.getInteger("minutes", true);
    const imageUrl = resolveOptionalImage(interaction);
    const followX = interaction.options.getBoolean("follow_x") ?? false;
    const xUrl =
      interaction.options.getString("x_url")?.trim() ||
      config.officialXUrl ||
      null;
    const joinDiscord = interaction.options.getBoolean("join_discord") ?? false;
    const inviteUrl = interaction.options.getString("invite_url")?.trim() || null;

    const giveaway = createGiveawayRecord({
      prize,
      description,
      cost,
      winnerCount,
      durationMinutes: minutes,
      channelId: interaction.channel.id,
      guildId: interaction.guild.id,
      messageId: null,
      hostId: interaction.user.id,
      imageUrl,
      rules: {
        followX,
        xUrl: followX ? xUrl : null,
        joinDiscord,
        inviteUrl: joinDiscord ? inviteUrl : null,
      },
    });

    const msg = await interaction.channel.send({
      embeds: [buildGiveawayEmbed(giveaway, interaction.guild)],
      components: buildGiveawayComponents(giveaway),
    });

    giveaway.messageId = msg.id;
    saveGiveaway(giveaway);

    await logGiveawayStarted(interaction.guild, interaction.user.toString(), giveaway);

    await interaction.reply({
      content: `Raffle **#${giveaway.id}** is live. Winners will be drawn here when time ends.`,
      ...EPHEMERAL,
    });
    return;
  }

  if (sub === "end") {
    if (!isPointsAdmin(interaction.member)) {
      await interaction.reply({ content: "Admin only.", ...EPHEMERAL });
      return;
    }

    const id = interaction.options.getString("id", true).trim();
    try {
      await interaction.deferReply({ ...EPHEMERAL });
      const g = await finalizeGiveaway(
        interaction.client,
        id,
        interaction.user.toString(),
      );

      const winnerText =
        g.winnerIds.length > 0
          ? g.winnerIds.map((w) => `<@${w}>`).join(", ")
          : "_No entries_";

      await interaction.editReply({
        content: `Raffle **#${g.id}** ended. Winners announced above.\n${winnerText}`,
      });
    } catch (err) {
      if (interaction.deferred) {
        await interaction.editReply({ content: err.message });
      } else {
        await interaction.reply({ content: err.message, ...EPHEMERAL });
      }
    }
  }
}
