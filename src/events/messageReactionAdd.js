import { tryAwardReactionPoints } from "../services/points.js";

export const name = "messageReactionAdd";
export const once = false;

export async function execute(reaction, user) {
  if (user.bot) return;

  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch {
    return;
  }

  try {
    tryAwardReactionPoints(user, reaction.message);
  } catch (err) {
    console.error("[kovari] messageReactionAdd error:", err);
  }
}
