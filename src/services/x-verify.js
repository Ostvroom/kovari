import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { resolveXProfile } from "./x-profile.js";
import { ensureTwitterCookies } from "./twitter-cookies.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = join(root, "scripts", "verify-x-engagement.py");

function runPythonVerify(username, tweetId, userId) {
  return new Promise((resolve) => {
    const cookies = ensureTwitterCookies();
    if (!cookies && !process.env.TWITTER_EMAIL) {
      resolve({
        ok: false,
        error: "Raid check unavailable. Ask an admin.",
      });
      return;
    }

    const py = process.env.PYTHON_PATH || "python";
    const args = [scriptPath, username, tweetId];
    if (userId) args.push(userId);

    const child = spawn(py, args, {
      cwd: root,
      env: { ...process.env },
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      const text = d.toString();
      stderr += text;
      console.error("[x-verify-py]", text.trim());
    });

    child.on("close", (code) => {
      try {
        const line = stdout.trim().split("\n").pop();
        resolve(JSON.parse(line));
      } catch {
        resolve({
          ok: false,
          error:
            stderr.trim() ||
            `Verification script failed (exit ${code}). Install: pip install twikit python-dotenv`,
        });
      }
    });

    child.on("error", () => {
      resolve({
        ok: false,
        error:
          "Python not found. Install Python 3 and run: pip install twikit python-dotenv",
      });
    });
  });
}

async function verifyViaTwitterApi(username, tweetId, userId) {
  const token = config.twitterBearerToken;
  if (!token) return null;

  const headers = { Authorization: `Bearer ${token}` };
  let authorId = userId;

  if (!authorId) {
    const lookup = await fetch(
      `https://api.twitter.com/2/users/by/username/${encodeURIComponent(username.replace(/^@/, ""))}`,
      { headers },
    ).catch(() => null);
    if (lookup?.ok) {
      const body = await lookup.json().catch(() => null);
      authorId = body?.data?.id ?? null;
    }
  }

  if (!authorId) return null;

  const params = new URLSearchParams({
    max_results: "100",
    "tweet.fields": "referenced_tweets",
    exclude: "replies",
  });

  const res = await fetch(
    `https://api.twitter.com/2/users/${authorId}/tweets?${params}`,
    { headers },
  ).catch(() => null);

  if (!res?.ok) return null;

  const data = await res.json().catch(() => null);
  const tweets = data?.data ?? [];

  let retweet = false;
  let reply = false;

  for (const t of tweets) {
    for (const ref of t.referenced_tweets ?? []) {
      if (ref.type === "retweeted" && ref.id === tweetId) retweet = true;
      if (ref.type === "replied_to" && ref.id === tweetId) reply = true;
    }
  }

  if (!reply) {
    const replyParams = new URLSearchParams({
      query: `conversation_id:${tweetId}`,
      max_results: "100",
      "tweet.fields": "author_id,in_reply_to_user_id,referenced_tweets",
      expansions: "author_id",
    });
    const replyRes = await fetch(
      `https://api.twitter.com/2/tweets/search/recent?${replyParams}`,
      { headers },
    ).catch(() => null);
    if (replyRes?.ok) {
      const replyData = await replyRes.json().catch(() => null);
      const users = replyData?.includes?.users ?? [];
      const byId = Object.fromEntries(users.map((u) => [u.id, u.username?.toLowerCase()]));
      const want = username.replace(/^@/, "").toLowerCase();
      for (const t of replyData?.data ?? []) {
        const refs = t.referenced_tweets ?? [];
        const isReply = refs.some(
          (r) => r.type === "replied_to" && r.id === tweetId,
        );
        if (!isReply) continue;
        const author = byId[t.author_id];
        if (author === want) {
          reply = true;
          break;
        }
      }
    }
  }

  if (retweet || reply) {
    return { ok: true, retweet, reply, like: false };
  }

  return {
    ok: false,
    retweet: false,
    reply: false,
    error: "Retweet or reply on the tweet, then try again.",
  };
}

/**
 * Verify retweet or reply before accepting raid.
 */
export async function verifyRaidEngagement(username, tweetId, knownUserId = null) {
  const profile = await resolveXProfile(username);
  if (!profile) {
    return {
      ok: false,
      error: "That X username was not found. Try **Join raid** again.",
    };
  }

  const canonical = profile.username;
  const userId = knownUserId ?? profile.id;

  const api = await verifyViaTwitterApi(canonical, tweetId, userId);
  if (api?.ok) return api;
  if (api && !api.ok && config.twitterBearerToken) return api;

  const py = await runPythonVerify(canonical, tweetId, userId);
  return py;
}

/** Validate handle exists on X when connecting. */
export async function validateXUsername(username) {
  const profile = await resolveXProfile(username);
  if (!profile) {
    throw new Error("That X username was not found.");
  }
  return profile;
}
