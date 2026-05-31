import { SlashCommandBuilder } from "discord.js";
import { EPHEMERAL } from "../lib/ephemeral.js";
import { buildCaptchaReply } from "../services/captcha.js";
import { assertVerificationConfigured } from "../services/verification.js";

export const data = new SlashCommandBuilder()
  .setName("verify")
  .setDescription("Complete the captcha to continue");

export async function execute(interaction) {
  try {
    assertVerificationConfigured();
  } catch (err) {
    await interaction.reply({ content: err.message, ...EPHEMERAL });
    return;
  }

  await interaction.reply({ ...buildCaptchaReply(interaction.user.id), ...EPHEMERAL });
}
