import { config } from "../config.js";
import { tryMirrorAlert } from "../services/alert-mirror.js";
import { moderateMessage } from "../services/link-moderation.js";
import { tryAwardMessagePoints } from "../services/points.js";

export const name = "messageCreate";
export const once = false;

function isMainGuild(guildId) {
  if (!config.guildId) return true;
  return guildId === config.guildId;
}

export async function execute(message) {
  try {
    await tryMirrorAlert(message);

    // Only moderate and award points in the main guild
    if (!message.guild || message.author.bot) return;
    if (isMainGuild(message.guild.id)) {
      await moderateMessage(message);
      tryAwardMessagePoints(message);
    }
  } catch (err) {
    console.error("[kovari] messageCreate error:", err);
  }
}
