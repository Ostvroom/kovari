/** Resolve X usernames via public API (case-insensitive; returns canonical handle). */

export async function resolveXProfile(username) {
  const input = username.trim().replace(/^@/, "");
  if (!input) return null;

  const res = await fetch(
    `https://api.fxtwitter.com/${encodeURIComponent(input)}`,
    { headers: { "User-Agent": "KovariBot/1.0" } },
  ).catch(() => null);

  if (!res?.ok) return null;

  const data = await res.json().catch(() => null);
  const user = data?.user;
  if (data?.code !== 200 || !user) return null;

  const screenName =
    (typeof user === "string" ? user : user.screen_name) || input;

  return {
    id: typeof user === "object" && user.id != null ? String(user.id) : null,
    username: String(screenName).replace(/^@/, ""),
    displayName:
      typeof user === "object" ? user.name ?? screenName : screenName,
  };
}
