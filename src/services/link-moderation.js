import { checkMessageContent, canBypassLinks } from "./link-filter.js";

const WARN_DELETE_MS = 7000;

export async function moderateMessage(message) {
  if (!message.guild) return;
  if (message.author.bot) return;
  if (!message.content?.trim()) return;

  const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) return;
  if (canBypassLinks(member)) return;

  const result = checkMessageContent(message.content, message.channel.id);
  if (result.allowed) return;

  await message.delete().catch(() => {});

  const { logLinkRemoved } = await import("./bot-log.js");
  await logLinkRemoved(
    message.guild,
    message.author.id,
    message.channel.id,
    result.reason,
  );

  const warning = await message.channel
    .send({
      content: `${message.author}, your message was removed — ${result.reason}.`,
    })
    .catch(() => null);

  if (warning) {
    setTimeout(() => warning.delete().catch(() => {}), WARN_DELETE_MS);
  }
}
