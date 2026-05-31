/** Tweet ID + metadata (ported from OG TASKS verification.py fallbacks) */

const TWEET_ID_RE = /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)|status\/(\d+)/i;

export function extractTweetId(input) {
  const trimmed = input.trim();
  if (/^\d{10,25}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(TWEET_ID_RE);
  return match?.[1] ?? match?.[2] ?? null;
}

export function normalizeTweetUrl(tweetId) {
  return `https://x.com/i/status/${tweetId}`;
}

export async function fetchTweetDetails(tweetId) {
  const id = extractTweetId(tweetId);
  if (!id) return null;

  const fx = await fetch(`https://api.fxtwitter.com/status/${id}`, {
    headers: { "User-Agent": "KovariBot/1.0" },
  }).catch(() => null);

  if (fx?.ok) {
    const data = await fx.json().catch(() => null);
    const t = data?.tweet;
    if (t) {
      return {
        id,
        text: t.text ?? "",
        author: t.author?.name ?? t.author?.screen_name ?? "Unknown",
        username: t.author?.screen_name ?? "",
        imageUrl: t.media?.photos?.[0]?.url ?? t.media?.mosaic?.formats?.jpeg ?? null,
        url: normalizeTweetUrl(id),
      };
    }
  }

  const vx = await fetch(`https://api.vxtwitter.com/status/${id}`, {
    headers: { "User-Agent": "KovariBot/1.0" },
  }).catch(() => null);

  if (vx?.ok) {
    const data = await vx.json().catch(() => null);
    if (data?.text || data?.description) {
      return {
        id,
        text: data.text ?? data.description ?? "",
        author: data.user_name ?? "Unknown",
        username: data.user_screen_name ?? "",
        imageUrl: data.mediaURLs?.[0] ?? data.thumbnail ?? null,
        url: normalizeTweetUrl(id),
      };
    }
  }

  return {
    id,
    text: "",
    author: "Unknown",
    username: "",
    imageUrl: null,
    url: normalizeTweetUrl(id),
  };
}
