import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { buildCaptchaReply, checkCaptchaAnswer } from "../services/captcha.js";
import { EPHEMERAL } from "../lib/ephemeral.js";
import { handleRaidInteraction } from "./handlers/raid-buttons.js";
import { handleTicketInteraction } from "./handlers/ticket-buttons.js";
import { handlePointsInteraction } from "./handlers/points-buttons.js";
import { toggleClaimRole } from "../services/role-claims.js";
import {
  assertVerificationConfigured,
  buildFaqEmbed,
  completeAccessCode,
  completeCaptcha,
} from "../services/verification.js";

export const name = "interactionCreate";
export const once = false;

async function safeEditCaptchaMessage(interaction, content) {
  await interaction.editReply({
    content,
    embeds: [],
    components: [],
  });
}

export async function execute(interaction) {
  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(err);
      const payload = { content: "Something went wrong running that command.", ...EPHEMERAL };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
    return;
  }

  if (await handleRaidInteraction(interaction)) return;
  if (await handleTicketInteraction(interaction)) return;
  if (await handlePointsInteraction(interaction)) return;

  if (interaction.isButton() && interaction.customId === "kovari:faq") {
    await interaction.reply({
      embeds: [buildFaqEmbed(interaction.guild)],
      ...EPHEMERAL,
    });
    return;
  }

  if (interaction.isButton() && interaction.customId === "kovari:waitingroom_enter") {
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId("kovari:waitingroom_code")
        .setTitle("Waiting room access code")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("code")
              .setLabel("Access code")
              .setStyle(TextInputStyle.Short)
              .setMinLength(4)
              .setMaxLength(64)
              .setRequired(true),
          ),
        ),
    );
    return;
  }

  if (
    interaction.isModalSubmit() &&
    interaction.customId === "kovari:waitingroom_code"
  ) {
    await interaction.deferReply(EPHEMERAL);

    try {
      assertVerificationConfigured();
      const code = interaction.fields.getTextInputValue("code");
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const result = await completeAccessCode(member, code);
      await interaction.editReply({ content: result.message });
    } catch (err) {
      console.error(err);
      await interaction.editReply({
        content: err.message ?? "Could not verify that code.",
      });
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("kovari:roleclaim:")) {
    const roleId = interaction.customId.split(":")[2];
    await interaction.deferReply(EPHEMERAL);

    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const result = await toggleClaimRole(member, roleId);
      const verb = result.action === "added" ? "Added" : "Removed";
      await interaction.editReply({
        content: `${verb} ${result.role} — you ${result.action === "added" ? "now have" : "no longer have"} this role.`,
      });
    } catch (err) {
      console.error(err);
      await interaction.editReply({
        content: err.message ?? "Could not update your role.",
      });
    }
    return;
  }

  if (interaction.isButton() && interaction.customId === "kovari:verify") {
    try {
      assertVerificationConfigured();
      await interaction.reply({ ...buildCaptchaReply(interaction.user.id), ...EPHEMERAL });
    } catch (err) {
      await interaction.reply({ content: err.message, ...EPHEMERAL }).catch(() => {});
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("kovari:captcha:")) {
    // Must ack within 3s — role changes run after defer
    await interaction.deferUpdate();

    const choice = interaction.customId.split(":")[2];
    const result = checkCaptchaAnswer(interaction.user.id, choice);

    if (!result.ok) {
      await safeEditCaptchaMessage(interaction, result.message);
      return;
    }

    try {
      assertVerificationConfigured();
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const access = await completeCaptcha(member);
      await safeEditCaptchaMessage(interaction, access.message);
    } catch (err) {
      console.error(err);
      await safeEditCaptchaMessage(
        interaction,
        err.message ?? "Verification failed. Contact an admin.",
      );
    }
  }
}
