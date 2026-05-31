import { EPHEMERAL } from "../../lib/ephemeral.js";
import {
  buildXConnectModal,
  parseXModalRaidId,
} from "../../lib/raid-connect-modal.js";
import {
  connectXUser,
  joinRaid,
  postRaidFailLog,
  postRaidLog,
  raidJoinInstructions,
  refreshRaidPanel,
  submitRaid,
} from "../../services/raids.js";
import { getXAccount } from "../../services/x-accounts-store.js";
import { awardRaidPoints } from "../../services/points.js";

export async function handleRaidInteraction(interaction) {
  if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith("kovari:raid:x_modal:")
  ) {
    const raidId = parseXModalRaidId(interaction.customId);
    if (!raidId) return false;

    await interaction.deferReply(EPHEMERAL);
    try {
      const username = interaction.fields.getTextInputValue("username");
      const acc = await connectXUser(interaction.user.id, username);
      const { logXConnected } = await import("../../services/bot-log.js");
      await logXConnected(interaction.guild, interaction.user.id, acc.username);
      const { raid, x } = joinRaid(raidId, interaction.user.id);
      const { logRaidJoin } = await import("../../services/raids.js");
      await logRaidJoin(interaction.guild, interaction.user.id, raid, x.username);
      await refreshRaidPanel(interaction.client, raid);
      await interaction.editReply({
        content: raidJoinInstructions(raid, x ?? acc),
      });
    } catch (err) {
      await interaction.editReply({ content: err.message });
    }
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith("kovari:raid:join:")) {
    const raidId = interaction.customId.split(":")[3];

    if (!getXAccount(interaction.user.id)) {
      await interaction.showModal(buildXConnectModal(raidId));
      return true;
    }

    await interaction.deferReply(EPHEMERAL);
    try {
      const { raid, x } = joinRaid(raidId, interaction.user.id);
      const { logRaidJoin } = await import("../../services/raids.js");
      await logRaidJoin(interaction.guild, interaction.user.id, raid, x.username);
      await refreshRaidPanel(interaction.client, raid);
      await interaction.editReply({
        content: raidJoinInstructions(raid, x),
      });
    } catch (err) {
      await interaction.editReply({ content: err.message });
    }
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith("kovari:raid:submit:")) {
    const raidId = interaction.customId.split(":")[3];

    if (!getXAccount(interaction.user.id)) {
      await interaction.showModal(buildXConnectModal(raidId));
      return true;
    }

    await interaction.deferReply(EPHEMERAL);
    try {
      await interaction.editReply({ content: "Checking…" });

      const result = await submitRaid(raidId, interaction.user.id);

      if (!result.success) {
        await postRaidFailLog(
          interaction.guild,
          result.raid,
          interaction.user.id,
          result.participant,
          result.error,
          result.verification,
        );
        await interaction.editReply({ content: result.error });
        return true;
      }

      const { raid, participant, already } = result;

      if (!already) {
        await postRaidLog(
          interaction.client,
          interaction.guild,
          raid,
          interaction.user.id,
          participant,
        );
        const { points, balance } = awardRaidPoints(
          interaction.user.id,
          interaction.guild,
        );
        await refreshRaidPanel(interaction.client, raid);
        await interaction.editReply({
          content: `Raid submitted. **+${points}** pts (balance: **${balance}**).`,
        });
        return true;
      }

      await refreshRaidPanel(interaction.client, raid);

      await interaction.editReply({
        content: "You already submitted.",
      });
    } catch (err) {
      await interaction.editReply({ content: err.message });
    }
    return true;
  }

  return false;
}
