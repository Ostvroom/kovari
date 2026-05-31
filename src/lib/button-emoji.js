/** Discord rejects some unicode (e.g. 𝕏) on button components — use standard emoji only */
export function applyButtonEmoji(builder, emoji) {
  const raw = emoji?.trim();
  if (!raw) return;

  if (/^\d{17,20}$/.test(raw)) {
    builder.setEmoji(raw);
    return;
  }

  // Standard emoji sequences only (not math symbols like 𝕏)
  if (!/^\p{Extended_Pictographic}([\u{FE0F}\u{20E3}]|\p{Emoji_Modifier})*$/u.test(raw)) {
    return;
  }

  try {
    builder.setEmoji(raw);
  } catch {
    // skip invalid emoji
  }
}
