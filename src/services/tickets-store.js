import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const filePath = join(dirname(fileURLToPath(import.meta.url)), "../../data/tickets.json");
let cache = null;

const defaultData = () => ({
  counter: 0,
  categoryId: null,
  staffRoleIds: [],
  panelChannelId: null,
  panelMessageId: null,
  open: {},
});

export function loadTickets() {
  if (cache) return cache;
  mkdirSync(dirname(filePath), { recursive: true });
  if (!existsSync(filePath)) {
    cache = defaultData();
    saveTickets(cache);
    return cache;
  }
  cache = { ...defaultData(), ...JSON.parse(readFileSync(filePath, "utf8")) };
  if (!cache.open) cache.open = {};
  return cache;
}

export function saveTickets(data) {
  cache = data;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function nextTicketNumber() {
  const data = loadTickets();
  data.counter += 1;
  saveTickets(data);
  return data.counter;
}

export function getTicketByChannel(channelId) {
  const data = loadTickets();
  return data.open[String(channelId)] ?? null;
}

export function registerOpenTicket(channelId, record) {
  const data = loadTickets();
  data.open[String(channelId)] = record;
  saveTickets(data);
}

export function removeOpenTicket(channelId) {
  const data = loadTickets();
  delete data.open[String(channelId)];
  saveTickets(data);
}

export function getOpenTicketForUser(userId) {
  const data = loadTickets();
  return Object.entries(data.open).find(([, t]) => t.userId === String(userId)) ?? null;
}

export function setTicketSettings(patch) {
  const data = loadTickets();
  Object.assign(data, patch);
  saveTickets(data);
  return data;
}
