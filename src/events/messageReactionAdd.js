import { config } from "../config.js";
import { tryAwardReactionPoints } from "../services/points.js";

export const name = "messageReactionAdd";
export const once = false;

function isMainGuild(guildId) {
  if (!config.guildId) return true;
  return guildId === config.guildId;
}

export async function execute(reaction, user) {
  if (user.bot) return;

  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch {
    return;
  }

  if (!reaction.message.guild || !isMainGuild(reaction.message.guild.id)) return;

  try {
    tryAwardReactionPoints(user, reaction.message);
  } catch (err) {
    console.error("[kovari] messageReactionAdd error:", err);
  }
}
