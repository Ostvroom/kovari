import "../src/load-env.js";

const token = process.env.DISCORD_TOKEN?.trim();

if (!token) {
  console.error("DISCORD_TOKEN is missing in .env");
  process.exit(1);
}

const parts = token.split(".");
if (parts.length !== 3) {
  console.error(
    "Token format looks wrong (expected 3 parts separated by dots).",
  );
  console.error("Use Bot → Reset Token in the Developer Portal, not Client Secret.");
  process.exit(1);
}

const res = await fetch("https://discord.com/api/v10/users/@me", {
  headers: { Authorization: `Bot ${token}` },
});

if (res.ok) {
  const user = await res.json();
  console.log(`Token OK — bot: ${user.username}#${user.discriminator || user.id}`);
  process.exit(0);
}

console.error(`Discord rejected this token (HTTP ${res.status}).`);
console.error("Reset the token: https://discord.com/developers/applications");
console.error("→ Your app → Bot → Reset Token → copy once into .env → save → npm run dev");
process.exit(1);
