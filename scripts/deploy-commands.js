import { Client, GatewayIntentBits } from "discord.js";
import { config } from "../src/config.js";
import { loadCommands } from "../src/lib/load-commands.js";
import { deployCommands } from "../src/lib/deploy-commands.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = await loadCommands();

client.once("ready", async () => {
  try {
    await deployCommands(client);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

await client.login(config.token);
