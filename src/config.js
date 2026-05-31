import "./load-env.js";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name} in .env (project root). Copy .env.example → .env and set your bot token.`,
    );
  }
  return value;
}

function optionalList(name) {
  const raw = process.env[name]?.trim();
  if (!raw) return [];
  return raw.split(",").map((id) => id.trim()).filter(Boolean);
}

export const config = {
  token: required("DISCORD_TOKEN"),
  guildId: process.env.GUILD_ID?.trim() || null,
  welcomeChannelId: process.env.WELCOME_CHANNEL_ID || null,
  verifiedWelcomeChannelId: process.env.VERIFIED_WELCOME_CHANNEL_ID?.trim() || null,
  welcomeBannerUrl: process.env.WELCOME_BANNER_URL?.trim() || null,
  verificationBannerUrl: process.env.VERIFICATION_BANNER_URL?.trim() || null,
  welcomeMessage:
    process.env.WELCOME_MESSAGE ||
    "Welcome to **{server}**, {user}! We're glad you're here.",
  verifiedRoleId: process.env.VERIFIED_ROLE_ID?.trim() || null,
  unverifiedRoleId: process.env.UNVERIFIED_ROLE_ID?.trim() || null,
  waitingRoomRoleId: process.env.WAITING_ROOM_ROLE_ID?.trim() || null,
  waitingRoomChannelId: process.env.WAITING_ROOM_CHANNEL_ID?.trim() || null,
  accessCode:
    process.env.ACCESS_CODE?.trim() ||
    process.env.WAITING_ROOM_CODE?.trim() ||
    "kovari",
  serverLocked:
    (
      process.env.SERVER_LOCKED ??
      process.env.WAITING_ROOM_LOCKED ??
      "false"
    ).toLowerCase() === "true",
  verificationChannelId: process.env.VERIFICATION_CHANNEL_ID?.trim() || null,
  verificationEnabled:
    (process.env.VERIFICATION_ENABLED ?? "true").toLowerCase() !== "false",
  adminRoleIds: optionalList("ADMIN_ROLE_IDS"),
  linkFullChannelIds: optionalList("LINK_FULL_CHANNELS"),
  linkMediumChannelIds: optionalList("LINK_MEDIUM_CHANNELS"),
  autoEnsurePanels:
    (process.env.AUTO_ENSURE_PANELS ?? "true").toLowerCase() !== "false",
  roleClaimChannelId: process.env.ROLE_CLAIM_CHANNEL_ID?.trim() || null,
  roleClaimBannerUrl: process.env.ROLE_CLAIM_BANNER_URL?.trim() || null,
  officialLinksChannelId: process.env.OFFICIAL_LINKS_CHANNEL_ID?.trim() || null,
  officialXUrl: process.env.OFFICIAL_X_URL?.trim() || "https://x.com/Kovarixyz",
  officialLinksBannerUrl: process.env.OFFICIAL_LINKS_BANNER_URL?.trim() || null,
  raidLogChannelId: process.env.RAID_LOG_CHANNEL_ID?.trim() || null,
  botLogChannelId:
    process.env.BOT_LOG_CHANNEL_ID?.trim() || "1508160047157346415",
  raidAnnounceChannelId: process.env.RAID_ANNOUNCE_CHANNEL_ID?.trim() || null,
  raidBannerUrl: process.env.RAID_BANNER_URL?.trim() || null,
  raidPingRoleId: process.env.RAID_PING_ROLE_ID?.trim() || "1508126086821843118",
  twitterBearerToken: process.env.TWITTER_BEARER_TOKEN?.trim() || null,
  twitterCookies: process.env.TWITTER_COOKIES?.trim() || null,
  ticketBannerUrl: process.env.TICKET_BANNER_URL?.trim() || null,
  ticketStaffRoleIds: optionalList("TICKET_STAFF_ROLE_IDS"),
  ticketPanelChannelId: process.env.TICKET_PANEL_CHANNEL_ID?.trim() || null,
  shopBannerUrl: process.env.SHOP_BANNER_URL?.trim() || null,
  pointsLogChannelId:
    process.env.POINTS_LOG_CHANNEL_ID?.trim() ||
    process.env.BOT_LOG_CHANNEL_ID?.trim() ||
    null,
  pointsEarnChannelIds: optionalList("POINTS_EARN_CHANNEL_IDS"),
  alertMirrorEnabled:
    (process.env.ALERT_MIRROR_ENABLED ?? "false").toLowerCase() === "true",
  alertMirrorSourceChannelId:
    process.env.ALERT_MIRROR_SOURCE_CHANNEL_ID?.trim() || null,
  alertMirrorTargetChannelId:
    process.env.ALERT_MIRROR_TARGET_CHANNEL_ID?.trim() || null,
  alertMirrorBotIds: optionalList("ALERT_MIRROR_BOT_IDS"),
  alertMirrorPingRoleId: process.env.ALERT_MIRROR_PING_ROLE_ID?.trim() || null,
  alertMirrorPairs: (() => {
    const raw = process.env.ALERT_MIRROR_PAIRS?.trim();
    if (raw) {
      return raw
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((pair) => {
          const [source, target] = pair.split(":");
          if (!source || !target) return null;
          return { source: source.trim(), target: target.trim() };
        })
        .filter(Boolean);
    }
    const source = process.env.ALERT_MIRROR_SOURCE_CHANNEL_ID?.trim() || null;
    const target = process.env.ALERT_MIRROR_TARGET_CHANNEL_ID?.trim() || null;
    if (source && target) return [{ source, target }];
    return [];
  })(),
};

export function formatWelcome(message, member) {
  return message
    .replaceAll("{user}", member.toString())
    .replaceAll("{server}", member.guild.name)
    .replaceAll("{username}", member.user.username)
    .replaceAll("{memberCount}", String(member.guild.memberCount));
}
