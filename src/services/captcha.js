import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";

const pending = new Map();
const TTL_MS = 5 * 60 * 1000;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(values) {
  const arr = [...values];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function startCaptcha(userId) {
  const a = randomInt(2, 12);
  const b = randomInt(2, 12);
  const answer = a + b;

  const wrong = new Set();
  while (wrong.size < 3) {
    const candidate = answer + randomInt(-6, 6);
    if (candidate > 0 && candidate !== answer) wrong.add(candidate);
  }

  const options = shuffle([answer, ...wrong]);
  pending.set(userId, { answer, expiresAt: Date.now() + TTL_MS });

  return { question: `What is **${a} + ${b}**?`, options };
}

export function checkCaptchaAnswer(userId, choice) {
  const entry = pending.get(userId);
  if (!entry) {
    return { ok: false, reason: "missing", message: "No active captcha. Click **Verify** again." };
  }

  if (Date.now() > entry.expiresAt) {
    pending.delete(userId);
    return {
      ok: false,
      reason: "expired",
      message: "Captcha expired. Click **Verify** again.",
    };
  }

  pending.delete(userId);
  const chosen = Number(choice);

  if (chosen !== entry.answer) {
    return { ok: false, reason: "wrong", message: "Wrong answer. Click **Verify** to try again." };
  }

  return { ok: true };
}

export function buildCaptchaReply(userId) {
  const { question, options } = startCaptcha(userId);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Quick bot check")
    .setDescription(
      [
        question,
        "",
        "Pick the correct number below.",
        "_This helps keep bots out._",
      ].join("\n"),
    );

  const row = new ActionRowBuilder().addComponents(
    options.map((value) =>
      new ButtonBuilder()
        .setCustomId(`kovari:captcha:${value}`)
        .setLabel(String(value))
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return { embeds: [embed], components: [row] };
}
