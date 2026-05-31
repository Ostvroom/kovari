import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { buildVerificationPanelMessage } from "../lib/verification-panel.js";
import { buildWaitingRoomPanelMessage } from "../lib/waiting-room-panel.js";
import {
  assertVerificationConfigured,
  getVerificationSettings,
  isServerLocked,
  isVerificationAdmin,
  countActiveWaitingCodes,
  promoteWaitingMembersToVerified,
  giveWaitingRoomCode,
  setServerLocked,
  setVerificationEnabled,
} from "../services/verification.js";

export const data = new SlashCommandBuilder()
  .setName("verification")
  .setDescription("Manage captcha verification (admins)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("gate")
      .setDescription("Require captcha for new members")
      .addBooleanOption((option) =>
        option
          .setName("enabled")
          .setDescription("true = on, false = off")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("lock")
      .setDescription("Lock server (captcha → waiting) or unlock (captcha → full access)")
      .addBooleanOption((option) =>
        option
          .setName("enabled")
          .setDescription("true = locked, false = unlocked")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("givecode")
      .setDescription("Assign a personal access code to a member (manual approval)")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("Member in waiting room (after captcha)")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("code")
          .setDescription("Custom code (optional — auto-generated if empty)")
          .setMinLength(4)
          .setMaxLength(32),
      )
      .addBooleanOption((option) =>
        option
          .setName("dm")
          .setDescription("Also DM the code to the member (default: you share it manually)"),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Show verification status"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("panel")
      .setDescription("Post captcha panel in this channel (#verify)"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("waitingpanel")
      .setDescription("Post waiting room panel (#waiting-room)"),
  );

export async function execute(interaction) {
  if (!isVerificationAdmin(interaction.member)) {
    await interaction.reply({
      content: "You need Administrator or a configured admin role.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (
    sub === "gate" ||
    sub === "lock" ||
    sub === "givecode" ||
    sub === "panel" ||
    sub === "waitingpanel"
  ) {
    try {
      assertVerificationConfigured();
    } catch (err) {
      await interaction.reply({ content: err.message, flags: MessageFlags.Ephemeral });
      return;
    }
  }

  if (sub === "gate") {
    const enabled = interaction.options.getBoolean("enabled", true);
    setVerificationEnabled(enabled);
    await interaction.reply({
      content: enabled
        ? "Join gate **ON** — new members must pass captcha."
        : "Join gate **OFF** — new members are not held at the door.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "lock") {
    const locked = interaction.options.getBoolean("enabled", true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    setServerLocked(locked);

    let extra = "";
    if (!locked) {
      const promoted = await promoteWaitingMembersToVerified(interaction.guild);
      if (promoted > 0) {
        extra = ` Gave **${promoted}** waiting member(s) full access.`;
      }
    }

    await interaction.editReply({
      content: locked
        ? "Server **LOCKED** — captcha → waiting; staff `/verification givecode` → full access."
        : `Server **UNLOCKED** — captcha gives full access directly.${extra}`,
    });
    return;
  }

  if (sub === "givecode") {
    const user = interaction.options.getUser("user", true);
    const customCode = interaction.options.getString("code");
    const dm = interaction.options.getBoolean("dm") ?? false;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const member = await interaction.guild.members.fetch(user.id);
      const { code, dmOk, dmError } = await giveWaitingRoomCode(member, { customCode, dm });
      const lines = [
        `**Code for ${user}** (only they can use it, once):`,
        `\`${code}\``,
        "",
      ];
      if (dmOk) {
        lines.push("_Also sent to their DMs._");
      } else if (dm && dmError) {
        lines.push(`_⚠️ Could not DM: ${dmError}_`);
        lines.push("_Copy and send this to them manually._");
      } else {
        lines.push("_Copy and send this to them (ticket, DM, etc.)._");
      }
      await interaction.editReply({ content: lines.join("\n") });
    } catch (err) {
      await interaction.editReply({ content: err.message });
    }
    return;
  }

  if (sub === "status") {
    const settings = getVerificationSettings();
    const activeCodes = countActiveWaitingCodes();
    await interaction.reply({
      content: [
        `**Join gate:** ${settings.enabled ? "ON" : "OFF"}`,
        `**Server:** ${isServerLocked() ? "🔒 LOCKED" : "🔓 UNLOCKED"}`,
        `**Codes:** Personal (one per user) · **${activeCodes}** unused`,
        `**Unverified:** ${config.unverifiedRoleId ? `<@&${config.unverifiedRoleId}>` : "not set"}`,
        `**Waiting:** ${config.waitingRoomRoleId ? `<@&${config.waitingRoomRoleId}>` : "not set"}`,
        `**Verified (full):** ${config.verifiedRoleId ? `<@&${config.verifiedRoleId}>` : "not set"}`,
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "panel") {
    await interaction.reply({
      content: "Verify panel posted.",
      flags: MessageFlags.Ephemeral,
    });
    await interaction.channel.send(
      buildVerificationPanelMessage(interaction.guild),
    );
    return;
  }

  if (sub === "waitingpanel") {
    await interaction.reply({
      content: "Waiting room panel posted.",
      flags: MessageFlags.Ephemeral,
    });
    await interaction.channel.send(
      buildWaitingRoomPanelMessage(interaction.guild),
    );
  }
}
