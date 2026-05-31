import { moderateMessage } from "../services/link-moderation.js";

export const name = "messageUpdate";
export const once = false;

export async function execute(_oldMessage, newMessage) {
  if (newMessage.partial) {
    try {
      await newMessage.fetch();
    } catch {
      return;
    }
  }
  await moderateMessage(newMessage);
}
