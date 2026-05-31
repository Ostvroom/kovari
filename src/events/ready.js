import { deployCommands } from "../lib/deploy-commands.js";
import { ensureVerificationPanels } from "../lib/ensure-panels.js";
import { config } from "../config.js";

export const name = "clientReady";
export const once = true;

export async function execute(client) {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Serving ${client.guilds.cache.size} server(s)`);

  const earn =
    config.pointsEarnChannelIds.length > 0
      ? config.pointsEarnChannelIds.join(", ")
      : "all channels";
  console.log(
    `[kovari] Points — earn: ${earn} · logs: ${config.pointsLogChannelId ?? "off"}`,
  );
  const raidLogs = [
    ...new Set(
      [config.botLogChannelId, config.raidLogChannelId].filter(Boolean),
    ),
  ];
  console.log(`[kovari] Raid logs → ${raidLogs.join(", ") || "off"}`);
  if (config.alertMirrorEnabled && config.alertMirrorPairs.length) {
    console.log(
      `[kovari] Alert mirror pairs: ${config.alertMirrorPairs.map((p) => `${p.source} → ${p.target}`).join(", ")}`,
    );
  }

  try {
    await deployCommands(client);
  } catch (err) {
    console.error("Failed to register slash commands:", err.message);
  }

  if (config.autoEnsurePanels) {
    try {
      await ensureVerificationPanels(client);
    } catch (err) {
      console.error("Failed to ensure panels:", err.message);
    }
  }

  const { startGiveawayScheduler } = await import("../services/giveaway-scheduler.js");
  startGiveawayScheduler(client);
}
