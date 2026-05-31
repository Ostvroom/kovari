/** Optional image from slash attachment or URL string. */
export function resolveOptionalImage(interaction, {
  attachmentOption = "image",
  urlOption = "image_url",
} = {}) {
  const file = interaction.options.getAttachment?.(attachmentOption);
  if (file?.contentType?.startsWith("image/")) {
    return file.url;
  }

  const raw = interaction.options.getString?.(urlOption)?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    return null;
  }
  return null;
}

export function applyEmbedImage(embed, imageUrl) {
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}
