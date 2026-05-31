import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { config } from "../config.js";
import { loadSettings, patchVerification } from "./settings.js";
import {
  countActiveWaitingCodes,
  clearWaitingRoomCode,
  getWaitingRoomCodeForUser,
  issueWaitingRoomCode,
  redeemWaitingRoomCode,
} from "./waiting-codes-store.js";

export { countActiveWaitingCodes };

function defaults() {
  return {
    verification: {
      enabled: config.verificationEnabled,
      serverLocked: config.serverLocked,
      accessCode: config.accessCode,
    },
  };
}

export function getVerificationSettings() {
  return loadSettings(defaults()).verification;
}

export function isVerificationEnabled() {
  return getVerificationSettings().enabled;
}

/** Server locked = captcha → waiting role; code → full access */
export function isServerLocked() {
  return getVerificationSettings().serverLocked;
}

export function setVerificationEnabled(enabled) {
  return patchVerification(defaults(), { enabled });
}

export function setServerLocked(locked) {
  patchVerification(defaults(), { serverLocked: locked });
  return locked;
}

export function hasVerifiedRole(member) {
  return Boolean(
    config.verifiedRoleId && member.roles.cache.has(config.verifiedRoleId),
  );
}

export function hasWaitingRoomRole(member) {
  return Boolean(
    config.waitingRoomRoleId &&
      member.roles.cache.has(config.waitingRoomRoleId),
  );
}

export function hasPassedCaptcha(member) {
  return hasVerifiedRole(member) || hasWaitingRoomRole(member);
}

async function assertBotCanManageRole(member, roleId, label) {
  const role = member.guild.roles.cache.get(roleId);
  if (!role) {
    throw new Error(`${label} role not found. Check your .env role ID.`);
  }
  if (role.position >= member.guild.members.me.roles.highest.position) {
    throw new Error(
      `Bot role must be above the ${label} role in Server Settings → Roles.`,
    );
  }
  return role;
}

async function stripGateRoles(member) {
  if (config.unverifiedRoleId) {
    await member.roles.remove(config.unverifiedRoleId).catch(() => {});
  }
}

export async function grantVerified(member) {
  await assertBotCanManageRole(member, config.verifiedRoleId, "verified");

  await stripGateRoles(member);
  if (config.waitingRoomRoleId) {
    await member.roles.remove(config.waitingRoomRoleId).catch(() => {});
  }

  clearWaitingRoomCode(member.id);
  await member.roles.add(config.verifiedRoleId);
}

function waitingRoomChannelHint() {
  return config.waitingRoomChannelId
    ? `<#${config.waitingRoomChannelId}>`
    : "the waiting room channel";
}

/** DM personal access code; returns {ok, error?}. */
export async function sendPersonalAccessCodeDm(member, code) {
  const hint = waitingRoomChannelHint();
  try {
    await member.send({
      content: [
        `Your **personal** access code for **${member.guild.name}**:`,
        "",
        `\`${code}\``,
        "",
        `Go to ${hint} → **Enter Code**.`,
        "_This code works once and only for your account._",
      ].join("\n"),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function grantWaitingRoom(member) {
  if (!config.waitingRoomRoleId) {
    throw new Error("Set WAITING_ROOM_ROLE_ID in .env first.");
  }

  await assertBotCanManageRole(member, config.waitingRoomRoleId, "waiting");

  await stripGateRoles(member);
  await member.roles.remove(config.verifiedRoleId).catch(() => {});
  await member.roles.add(config.waitingRoomRoleId);
}

/**
 * Admin assigns a personal code (manual approval). Does not auto-DM unless requested.
 */
export async function giveWaitingRoomCode(member, { customCode, dm = false } = {}) {
  if (!hasWaitingRoomRole(member)) {
    throw new Error("Member must pass captcha first (waiting room role).");
  }

  const code = issueWaitingRoomCode(member.id, customCode);
  if (!dm) return { code, dmOk: false, dmError: null };

  const result = await sendPersonalAccessCodeDm(member, code);
  return { code, dmOk: result.ok, dmError: result.error ?? null };
}

export async function promoteWaitingMembersToVerified(guild) {
  if (!config.waitingRoomRoleId || !config.verifiedRoleId) return 0;

  const role = guild.roles.cache.get(config.waitingRoomRoleId);
  if (!role) return 0;

  let count = 0;
  for (const [, member] of role.members) {
    await grantVerified(member);
    count++;
  }
  return count;
}

export async function applyWaitingState(member) {
  if (!isVerificationEnabled()) return;
  if (!config.unverifiedRoleId) return;
  if (member.user.bot) return;
  if (hasPassedCaptcha(member)) return;

  await assertBotCanManageRole(member, config.unverifiedRoleId, "unverified");
  await member.roles.remove(config.verifiedRoleId).catch(() => {});
  await member.roles.remove(config.waitingRoomRoleId).catch(() => {});
  await member.roles.add(config.unverifiedRoleId);
}

/** Step 3: correct code → full server (verified), waiting role removed */
export async function completeAccessCode(member, code) {
  if (hasVerifiedRole(member)) {
    return {
      ok: true,
      message: "You already have full server access.",
      already: true,
    };
  }

  if (!isServerLocked()) {
    return {
      ok: false,
      message: "The server is **unlocked**. Complete the captcha in the verify channel instead.",
    };
  }

  if (!hasWaitingRoomRole(member)) {
    return {
      ok: false,
      message: "Complete the captcha in the verify channel first.",
    };
  }

  if (!getWaitingRoomCodeForUser(member.id)) {
    return {
      ok: false,
      message:
        "You don't have an access code yet. Wait for staff to approve you and send your code.",
    };
  }

  const redeem = redeemWaitingRoomCode(member.id, code);
  if (!redeem.ok) {
    return { ok: false, message: redeem.message };
  }

  await grantVerified(member);
  return {
    ok: true,
    message: "Code accepted. You now have **full access** to the server!",
  };
}

/** Step 1 or 2: captcha → verified (unlocked) or waiting role (locked) */
export async function completeCaptcha(member) {
  if (hasVerifiedRole(member)) {
    return {
      ok: true,
      message: "You already have full server access.",
      already: true,
    };
  }

  if (isServerLocked()) {
    if (hasWaitingRoomRole(member)) {
      const hint = waitingRoomChannelHint();
      const hasCode = Boolean(getWaitingRoomCodeForUser(member.id));
      return {
        ok: true,
        message: hasCode
          ? `You are in the waiting room. Enter the code staff gave you in ${hint}.`
          : `You are in the waiting room. Wait for staff to send you an access code, then use **Enter Code** in ${hint}.`,
        already: true,
      };
    }

    await grantWaitingRoom(member);
    const hint = waitingRoomChannelHint();
    return {
      ok: true,
      message: `Captcha passed. You are in the **waiting room**. Staff will send you a personal code when approved — then enter it in ${hint}.`,
    };
  }

  await grantVerified(member);
  return {
    ok: true,
    message: "Captcha passed. You now have **full access** to the server.",
  };
}

function resolveVerificationBanner(guild) {
  return (
    config.verificationBannerUrl ??
    config.welcomeBannerUrl ??
    guild.bannerURL({ size: 1024 }) ??
    null
  );
}

export function buildVerificationPanelEmbed(guild) {
  const settings = getVerificationSettings();

  const gateLine = settings.enabled
    ? "🔒 **Gate:** New members must pass captcha"
    : "🔓 **Gate:** Open";

  const accessLine = settings.serverLocked
    ? "⏳ **Server locked:** Captcha → waiting room → staff code for full access"
    : "✅ **Server unlocked:** Captcha → full server access";

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`👋 Welcome to ${guild.name}!`)
    .setDescription(
      [
        "Complete the quick **anti-bot captcha** below.",
        "",
        "• Click `Verify` to start",
        "• Click `FAQ` for help",
        "",
        gateLine,
        accessLine,
      ].join("\n"),
    )
    .setThumbnail(guild.iconURL({ size: 256 }))
    .setFooter({ text: `${guild.name} • Stay safe, stay human` });

  const bannerUrl = resolveVerificationBanner(guild);
  if (bannerUrl) embed.setImage(bannerUrl);

  return embed;
}

export function buildWaitingRoomPanelEmbed(guild) {
  const locked = isServerLocked();
  const statusIcon = locked ? "🔒" : "🔓";
  const statusText = locked
    ? "This server is currently **locked**."
    : "This server is currently **unlocked**.";

  const instructions = locked
    ? [
        "• Pass captcha first → you get **waiting room** access",
        "• Staff sends a **personal code** only to approved members",
        "• Got your code? Click `Enter Code` below (one use, only for you)",
      ]
    : [
        "• Complete the captcha in the verify channel for **full access**",
        "• No code is needed while the server is unlocked",
      ];

  const embed = new EmbedBuilder()
    .setColor(locked ? 0x5865f2 : 0x57f287)
    .setTitle(`${statusIcon} ${guild.name}'s Waiting Room`)
    .setDescription([statusText, "", ...instructions].join("\n"))
    .setThumbnail(guild.iconURL({ size: 256 }))
    .setFooter({ text: `${guild.name} • Waiting room` });

  const bannerUrl = resolveVerificationBanner(guild);
  if (bannerUrl) embed.setImage(bannerUrl);

  return embed;
}

export function buildFaqEmbed(guild) {
  const locked = isServerLocked();

  const accessNote = locked
    ? [
        "1. Pass captcha → **waiting** role",
        "2. Staff approves you and gives a **personal code**",
        "3. Enter your code in the waiting room → **full access**",
      ].join("\n")
    : "Pass the captcha in the verify channel → **full access** immediately.";

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("❓ Verification FAQ")
    .setDescription(
      [
        "**How do I get in?**",
        accessNote,
        "",
        "**Why a captcha?**",
        "Blocks automated bot accounts.",
        "",
        "**Wrong captcha answer?**",
        "Click `Verify` again for a new question.",
        "",
        "**Need help?**",
        "Contact a moderator.",
      ].join("\n"),
    )
    .setThumbnail(guild.iconURL({ size: 128 }))
    .setFooter({ text: guild.name });
}

export function isVerificationAdmin(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (
    config.adminRoleIds.length > 0 &&
    member.roles.cache.some((r) => config.adminRoleIds.includes(r.id))
  ) {
    return true;
  }
  return false;
}

export function assertVerificationConfigured() {
  if (!config.verifiedRoleId) {
    throw new Error("Set VERIFIED_ROLE_ID in .env first.");
  }
  if (!config.unverifiedRoleId) {
    throw new Error("Set UNVERIFIED_ROLE_ID in .env first.");
  }
  if (isServerLocked() && !config.waitingRoomRoleId) {
    throw new Error("Set WAITING_ROOM_ROLE_ID in .env (needed while server is locked).");
  }
  if (
    config.waitingRoomRoleId &&
    config.unverifiedRoleId &&
    config.waitingRoomRoleId === config.unverifiedRoleId
  ) {
    throw new Error(
      "WAITING_ROOM_ROLE_ID and UNVERIFIED_ROLE_ID must be two different roles.",
    );
  }
}

// Legacy aliases for panel button
export const isWaitingRoomLocked = isServerLocked;
export const completeWaitingRoomCode = completeAccessCode;
