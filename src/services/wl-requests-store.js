import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const filePath = join(dirname(fileURLToPath(import.meta.url)), "../../data/wl-requests.json");
let cache = null;

const defaultData = () => ({
  requests: {}, // tweetUrl -> { messageId, userId, votes: { up: [], down: [] }, createdAt }
});

export function loadWlRequests() {
  if (cache) return cache;
  mkdirSync(dirname(filePath), { recursive: true });
  if (!existsSync(filePath)) {
    cache = defaultData();
    saveWlRequests(cache);
    return cache;
  }
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    cache = { ...defaultData(), ...raw };
    if (!cache.requests) cache.requests = {};
  } catch {
    cache = defaultData();
  }
  return cache;
}

export function saveWlRequests(data) {
  cache = data;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function getWlRequest(tweetUrl) {
  return loadWlRequests().requests[tweetUrl] ?? null;
}

export function addWlRequest(tweetUrl, { messageId, userId }) {
  const data = loadWlRequests();
  data.requests[tweetUrl] = {
    messageId,
    userId,
    votes: { up: [], down: [] },
    createdAt: Date.now(),
  };
  saveWlRequests(data);
}

export function removeWlRequest(tweetUrl) {
  const data = loadWlRequests();
  delete data.requests[tweetUrl];
  saveWlRequests(data);
}

export function addWlVote(tweetUrl, userId, type) {
  const data = loadWlRequests();
  const req = data.requests[tweetUrl];
  if (!req) return null;
  req.votes.up = req.votes.up.filter((id) => id !== userId);
  req.votes.down = req.votes.down.filter((id) => id !== userId);
  if (type === "up") req.votes.up.push(userId);
  else if (type === "down") req.votes.down.push(userId);
  saveWlRequests(data);
  return req;
}

export function getWlVoteCounts(tweetUrl) {
  const req = getWlRequest(tweetUrl);
  if (!req) return { up: 0, down: 0 };
  return { up: req.votes.up.length, down: req.votes.down.length };
}
