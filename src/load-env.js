import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Windows/user env vars often hold an old DISCORD_TOKEN; .env must win for local dev.
dotenv.config({ path: resolve(root, ".env"), override: true });

// Multi-line TWITTER_COOKIES in .env often break parsers — prefer data/twitter-cookies.json
import { ensureTwitterCookies } from "./services/twitter-cookies.js";
ensureTwitterCookies();
