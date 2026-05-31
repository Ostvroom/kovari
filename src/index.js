import { Client, GatewayIntentBits, Partials } from "discord.js";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config } from "./config.js";
import { loadCommands } from "./lib/load-commands.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const eventsPath = join(__dirname, "events");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.GuildMember, Partials.Message, Partials.Reaction],
});

client.commands = await loadCommands();

client.on("error", (err) => console.error("Discord client error:", err));

for (const file of readdirSync(eventsPath).filter((f) => f.endsWith(".js"))) {
  const module = await import(pathToFileURL(join(eventsPath, file)).href);
  const { name, once, execute } = module;

  if (once) {
    client.once(name, (...args) => execute(client, ...args));
  } else {
    client.on(name, (...args) => execute(...args));
  }
}

try {
  await client.login(config.token);
} catch (err) {
  if (err.code === "TokenInvalid") {
    console.error("\nDiscord rejected your bot token.");
    console.error("Run: npm run check-token");
    console.error(
      "Then reset at https://discord.com/developers/applications → Bot → Reset Token",
    );
  }
  throw err;
}
