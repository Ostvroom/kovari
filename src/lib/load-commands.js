import { Collection } from "discord.js";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const commandsPath = join(dirname(fileURLToPath(import.meta.url)), "../commands");

export async function loadCommands() {
  const commands = new Collection();

  for (const file of readdirSync(commandsPath).filter((f) => f.endsWith(".js"))) {
    const module = await import(pathToFileURL(join(commandsPath, file)).href);
    if (!module.data || !module.execute) continue;
    commands.set(module.data.name, module);
  }

  return commands;
}

export function getCommandPayloads(commands) {
  return [...commands.values()].map((cmd) => cmd.data.toJSON());
}
