import { listOpenGiveaways } from "./points-store.js";
import { finalizeGiveaway } from "./giveaways.js";

let timer = null;

export function startGiveawayScheduler(client) {
  if (timer) return;

  const tick = async () => {
    const now = Date.now();
    for (const g of listOpenGiveaways()) {
      const endMs = new Date(g.endsAt).getTime();
      if (endMs > now) continue;
      if (!g.guildId || !g.channelId || !g.messageId) continue;
      try {
        await finalizeGiveaway(client, g.id, "Timer");
      } catch (err) {
        console.error(`Giveaway auto-end #${g.id}:`, err.message);
      }
    }
  };

  tick();
  timer = setInterval(tick, 30_000);
}
