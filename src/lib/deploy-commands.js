import { REST, Routes } from "discord.js";
import { config } from "../config.js";
import { getCommandPayloads } from "./load-commands.js";

function resolveGuildId(client) {
  if (config.guildId) return config.guildId;

  if (client.guilds.cache.size === 1) {
    const id = client.guilds.cache.first().id;
    console.warn(
      `GUILD_ID not in .env — registering commands for your only server (${id}).`,
    );
    console.warn(`Add to .env: GUILD_ID=${id}`);
    return id;
  }

  if (client.guilds.cache.size > 1) {
    console.warn(
      "GUILD_ID not set and the bot is in multiple servers — slash commands were not registered.",
    );
    console.warn("Set GUILD_ID in .env to your Kovari server ID.");
    return null;
  }

  console.warn("Bot is not in any server — slash commands were not registered.");
  return null;
}

export async function deployCommands(client) {
  const guildId = resolveGuildId(client);
  if (!guildId) return;

  const rest = new REST({ version: "10" }).setToken(config.token);
  const body = getCommandPayloads(client.commands);

  await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), {
    body,
  });

  console.log(`Registered ${body.length} slash command(s) for guild ${guildId}`);
}
