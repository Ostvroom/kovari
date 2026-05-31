# Kovari

Discord management bot — welcome messages + captcha verification.

## Verification flow

### Server unlocked (`/verification lock enabled:false`)

1. New member → **Unverified**
2. Captcha in `#verify` → **Verified** (full server)

### Server locked (`/verification lock enabled:true`)

1. New member → **Unverified**
2. Captcha in `#verify` → **Waiting** role (limited channels + waiting room panel)
3. **Enter code** in `#waiting-room` → **Verified** (waiting role removed, full server)

Unlocking the server (`lock enabled:false`) upgrades everyone in **Waiting** to **Verified**.

## Setup

Three roles (all different IDs):

| Role | Purpose |
|------|---------|
| Unverified | New joins, only `#verify` |
| Waiting | After captcha while server is locked |
| Verified | Full access |

Bot role must be **above** all three.

```env
UNVERIFIED_ROLE_ID=
WAITING_ROOM_ROLE_ID=
VERIFIED_ROLE_ID=
SERVER_LOCKED=false
ACCESS_CODE=your-code
```

## Commands

| Command | Effect |
|---------|--------|
| `/verification panel` | Captcha panel in `#verify` |
| `/verification waitingpanel` | Code panel in `#waiting-room` |
| `/verification lock enabled:true/false` | Lock or unlock server |
| `/verification setcode code:…` | Change access code |
| `/verification gate enabled:true/false` | Require captcha for new joins |
| `/verification status` | Current settings |
| `/verify` | Start captcha |

## Link protection

Requires **Message Content Intent** in the [Developer Portal](https://discord.com/developers/applications) → Bot → Privileged Gateway Intents.

| Level | Who (non-admin) can post |
|-------|---------------------------|
| **Default** | Twitter/X only (`twitter.com`, `x.com`, `t.co`) |
| **Medium** | Twitter/X + Discord invites (alpha-style channels) |
| **Full** | No links |

**Admins bypass** — Administrator permission or roles in `ADMIN_ROLE_IDS`.

```
/links set level:full      → in a channel (announcements, etc.)
/links set level:medium     → alpha / invite-friendly channels
/links status
/links list
```

Unsafe links (`javascript:`, `data:`, etc.) are always blocked.

## Role claim panel

Self-assign roles with a styled embed + buttons (toggle on/off).

```
/roles add role:@Announcements label:News emoji:📢 description:Get server pings
/roles add role:@Gaming label:Gaming emoji:🎮 description:LFG & events
/roles panel          → post in #roles (or your roles channel)
/roles list
/roles remove role:@Role
/roles setbanner url:https://...
```

Set `ROLE_CLAIM_CHANNEL_ID` in `.env` to auto-post the panel on startup (after roles are added). Max **25** roles per panel. Bot role must be **above** every claimable role.

## X Raids

Adapted from **OG TASKS** engagement flow (tweet embed + X link + logs). Uses `fxtwitter` / `vxtwitter` for tweet previews.

| Command | Who | What |
|---------|-----|------|
| `/raid post url:…` | Admin | Post raid embed + buttons |
| `/raid end id:…` | Admin | Close a raid |
| `/x connect username:…` | Member | Link X handle for raids |
| `/x profile` | Member | View linked X |

**Member flow:** Join raid (links X once) → RT or reply on X → Submit raid → logged in `#raid-logs`. Each raid pings `RAID_PING_ROLE_ID`.

```env
RAID_LOG_CHANNEL_ID=your_engage_logs_channel_id
```

**Verification:** Submit works when **retweet or reply** is detected on X (cookies in `data/twitter-cookies.json`).

```bash
pip install twikit python-dotenv
```

Copy cookies from OG TASKS into **`data/twitter-cookies.json`** (see `data/twitter-cookies.example.json`). Do not use multi-line cookies in `.env` — they break parsing. Restart the bot; console should show `X cookies loaded`.

## Kovari tickets (branded)

Replaces third-party ticket bots with a **Kovari** panel and private `ticket-0001` channels.

| Command | What |
|---------|------|
| `/tickets setup category:#SUPPORT staff_role:@Staff` | Where new tickets are created |
| `/tickets panel` | Post the support panel in the current channel |
| `/tickets close` | Close ticket from inside the channel |
| `/tickets status` | View config |

**Member flow:** **Create ticket** → private channel → chat with staff → **Close ticket**.

Optional in `.env`: `TICKET_STAFF_ROLE_IDS`, `TICKET_BANNER_URL`, `TICKET_PANEL_CHANNEL_ID`.

## Points, shop & giveaways

| Earn | Default |
|------|---------|
| Chat message | 2 pts (60s cooldown) |
| Reaction on others' messages | 1 pt (45s cooldown) |
| Verified raid submit | 25 pts |

| Command | What |
|---------|------|
| `/points balance` | Your balance |
| `/points leaderboard` | Top users |
| `/points give` / `remove` | Admin adjust |
| `/shop list` / `view` / `buy` | Marketplace (optional image per item) |
| `/shop add` / `remove` | Admin items (optional role + **image** or `image_url`) |
| `/giveaway start` | Point-entry raffle (optional **image** or `image_url`) |
| `/giveaway end id:…` | Pick winners |

Edit rates in `data/points.json`. Enable **Server Members Intent** and **Message Content** (already used). Reactions need the bot to see messages in those channels.

**Discord Developer Portal → Bot → Privileged Gateway Intents:** ensure **Message Content Intent** is on (you likely have this). Reaction events work in channels the bot can read.
