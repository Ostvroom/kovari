import { tryMirrorAlert } from "../services/alert-mirror.js";
import { moderateMessage } from "../services/link-moderation.js";
import { tryAwardMessagePoints } from "../services/points.js";

export const name = "messageCreate";
export const once = false;

export async function execute(message) {
  try {
    await tryMirrorAlert(message);
    await moderateMessage(message);
    if (!message.guild || message.author.bot) return;
    tryAwardMessagePoints(message);
  } catch (err) {
    console.error("[kovari] messageCreate error:", err);
  }
}
