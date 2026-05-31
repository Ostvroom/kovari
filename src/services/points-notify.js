import { PermissionFlagsBits } from "discord.js";
import { config } from "../config.js";
import { logPointsEarned } from "./bot-log.js";

const REASON_LABEL = {
  message: "message",
  reaction: "reaction",
  raid: "raid",
};

function alertReplyEnabled() {
  return (process.env.POINTS_ALERT_REPLY ?? "false").toLowerCase() === "true";
}

function canSendInChannel(channel, guild) {
  const me = guild?.members?.me;
  if (!me || !channel?.isTextBased?.()) return false;
  const perms = channel.permissionsFor(me);
  if (!perms) return false;
  const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  if (channel.isThread?.()) {
    needed.push(PermissionFlagsBits.SendMessagesInThreads);
  }
  return needed.every((p) => perms.has(p));
}

/** Visible alert on the message that earned points (reply in earn channel). */
export async function replyPointsEarned(message, { amount, balance, reason, userId }) {
  if (!alertReplyEnabled() || !message?.guild) return null;
  const channel = message.channel;
  if (!canSendInChannel(channel, message.guild)) return null;

  const label = REASON_LABEL[reason] ?? reason;
  const who = userId ? `<@${userId}> ` : "";
  const content = `${who}💰 +**${amount}** pts · balance **${balance}** _(${label})_`;

  try {
    return await message.reply({
      content,
      allowedMentions: { users: userId ? [userId] : [] },
    });
  } catch (err) {
    console.error("[kovari] points earn reply failed:", err.message);
    try {
      return await channel.send({
        content,
        allowedMentions: { users: userId ? [userId] : [] },
      });
    } catch (err2) {
      console.error("[kovari] points earn channel send failed:", err2.message);
      return null;
    }
  }
}

/** Staff log embed + optional reply on source message. */
export async function alertPointsEarned({
  guild,
  userId,
  amount,
  balance,
  reason,
  channelId,
  jumpUrl,
  sourceMessage,
}) {
  if (sourceMessage) {
    await replyPointsEarned(sourceMessage, { amount, balance, reason, userId });
  }

  const result = await logPointsEarned(guild, {
    userId,
    amount,
    balance,
    reason,
    channelId,
    jumpUrl,
  });

  if (!result && config.pointsLogChannelId) {
    console.warn(
      `[kovari] points log not delivered to channel ${config.pointsLogChannelId}`,
    );
  }

  return result;
}
