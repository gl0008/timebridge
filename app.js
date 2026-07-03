const STORAGE_KEY = "timebridge-recurring-weekend-v1";
const BASE_ZONE = "America/New_York";
const BASE_ZONE_LABEL = "Philadelphia";
const DAYS = [
  { id: "saturday", label: "Saturday", weekday: 6 },
  { id: "sunday", label: "Sunday", weekday: 0 },
];
const REMOTE_CONFIG = window.TIMEBRIDGE_CONFIG || {
  supabaseUrl: "https://qsnbhyfmsfcgpqkwipbq.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzbmJoeWZtc2ZjZ3Bxa3dpcGJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDk4MjgsImV4cCI6MjA5ODUyNTgyOH0.Ag-Kv6LP3BQcFENEakSfBid84NC3XhUhC28QowNoIqI",
  scheduleId: "weekend",
};
const REMOTE_ENABLED = Boolean(REMOTE_CONFIG.supabaseUrl && REMOTE_CONFIG.supabaseAnonKey);
const REMOTE_SCHEDULE_ID = REMOTE_CONFIG.scheduleId || "weekend";
const SYNC_INTERVAL_MS = 10000;

const el = {
  eventName: document.querySelector("#eventName"),
  personName: document.querySelector("#personName"),
  timezoneSelect: document.querySelector("#timezoneSelect"),
  baseTimezone: document.querySelector("#baseTimezone"),
  startTime: document.querySelector("#startTime"),
  endTime: document.querySelector("#endTime"),
  slotLength: document.querySelector("#slotLength"),
  applyButton: document.querySelector("#applyButton"),
  grid: document.querySelector("#availabilityGrid"),
  participantList: document.querySelector("#participantList"),
  copyLinkButton: document.querySelector("#copyLinkButton"),
  resetButton: document.querySelector("#resetButton"),
  shareBox: document.querySelector("#shareBox"),
  saveStatus: document.querySelector("#saveStatus"),
  currentPersonLabel: document.querySelector("#currentPersonLabel"),
  timezoneHint: document.querySelector("#timezoneHint"),
};

const detectedZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
let state = loadState();
let dragMode = null;
let remoteReady = false;
let remoteSaveTimer = null;
let lastRemoteSnapshot = "";

function defaultState() {
  return {
    version: 2,
    mode: "recurring-weekend",
    eventName: "Biweekly fixed-time meeting",
    baseZone: BASE_ZONE,
    days: DAYS.map((day) => day.id),
    startTime: "09:00",
    endTime: "24:00",
    slotLength: 30,
    slots: buildSlots("09:00", "24:00", 30),
    participants: {},
  };
}

function loadState() {
  if (location.hash === "#weekend") return defaultState();

  const fromUrl = decodeState(location.hash.replace(/^#schedule=/, ""));
  if (fromUrl) return normalizeState(fromUrl);

  const stored = localStorage.getItem(STORAGE_KEY);
  const fromStorage = stored ? decodeState(stored) : null;
  return normalizeState(fromStorage);
}

function normalizeState(candidate) {
  const defaults = defaultState();
  if (!candidate || candidate.mode !== "recurring-weekend") return defaults;

  const next = {
    ...defaults,
    ...candidate,
    baseZone: BASE_ZONE,
    days: defaults.days,
    participants: candidate.participants || {},
  };
  next.slots = buildSlots(next.startTime, next.endTime, Number(next.slotLength));

  const validSlots = new Set(next.slots);
  Object.values(next.participants).forEach((participant) => {
    participant.slots = (participant.slots || []).filter((slot) => validSlots.has(slot));
  });

  return next;
}

function shareState() {
  return {
    version: state.version,
    mode: state.mode,
    eventName: state.eventName,
    baseZone: BASE_ZONE,
    days: state.days,
    startTime: state.startTime,
    endTime: state.endTime,
    slotLength: state.slotLength,
    participants: state.participants,
  };
}

function stateSnapshot(nextState = shareState()) {
  return JSON.stringify(nextState);
}

function isDefaultInvite() {
  const defaults = defaultState();
  return (
    state.eventName === defaults.eventName &&
    state.startTime === defaults.startTime &&
    state.endTime === defaults.endTime &&
    Number(state.slotLength) === defaults.slotLength &&
    Object.keys(state.participants).length === 0
  );
}

function encodeState(nextState) {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(nextState))));
  } catch {
    return "";
  }
}

function decodeState(encoded) {
  if (!encoded) return null;
  try {
    return JSON.parse(decodeURIComponent(escape(atob(encoded))));
  } catch {
    return null;
  }
}

function minutesFromTime(time) {
  if (time === "24:00") return 24 * 60;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeFromMinutes(totalMinutes) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = String(Math.floor(normalized / 60)).padStart(2, "0");
  const minutes = String(normalized % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function displayTime(time) {
  const minutes = minutesFromTime(time);
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours24 = Math.floor(normalized / 60);
  const minutesPart = String(normalized % 60).padStart(2, "0");
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutesPart} ${period}`;
}

function buildSlots(startTime, endTime, slotLength) {
  const start = minutesFromTime(startTime);
  const end = minutesFromTime(endTime);
  const safeEnd = end > start ? end : 24 * 60;
  const slots = [];

  DAYS.forEach((day) => {
    for (let minute = start; minute < safeEnd; minute += slotLength) {
      slots.push(`${day.id}|${timeFromMinutes(minute)}`);
    }
  });

  return slots;
}

function slotDay(slot) {
  return slot.split("|")[0];
}

function slotTime(slot) {
  return slot.split("|")[1];
}

function getTimeZones() {
  const fallback = [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Paris",
    "Asia/Kolkata",
    "Asia/Shanghai",
    "Asia/Tokyo",
    "Australia/Sydney",
  ];
  return Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : fallback;
}

function setupTimeZones() {
  const zones = getTimeZones();
  el.timezoneSelect.innerHTML = zones
    .map((zone) => `<option value="${zone}">${zone.replaceAll("_", " ")}</option>`)
    .join("");
  el.timezoneSelect.value = zones.includes(detectedZone) ? detectedZone : BASE_ZONE;
  el.baseTimezone.value = `${BASE_ZONE_LABEL} (${BASE_ZONE})`;
}

function getOffsetMinutes(timeZone, date) {
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = value?.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] || 0));
}

function zonedTimeToUtc(dateKey, time, timeZone) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  const offset = getOffsetMinutes(timeZone, guess);
  return new Date(guess.getTime() - offset * 60 * 1000);
}

function nextDateForDay(dayId) {
  const target = DAYS.find((day) => day.id === dayId);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BASE_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const currentWeekday = weekdayMap[get("weekday")];
  const delta = (target.weekday - currentWeekday + 7) % 7;
  const baseDate = new Date(Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day"))));
  baseDate.setUTCDate(baseDate.getUTCDate() + delta);
  return baseDate.toISOString().slice(0, 10);
}

function localSlotParts(slot, timeZone) {
  const day = slotDay(slot);
  const time = slotTime(slot);
  const sampleDate = nextDateForDay(day);
  const utcDate = zonedTimeToUtc(sampleDate, time, BASE_ZONE);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).formatToParts(utcDate);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return {
    weekday: get("weekday"),
    time: `${get("hour")}:${get("minute")} ${get("dayPeriod")}`,
  };
}

function selectedZone() {
  return el.timezoneSelect.value || detectedZone;
}

function participantName() {
  return el.personName.value.trim();
}

function participantSlots(name) {
  return new Set(state.participants[name]?.slots || []);
}

function participantEntries() {
  return Object.values(state.participants)
    .filter((participant) => participant?.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function availabilityCount(slot) {
  return participantEntries().filter((participant) =>
    participant.slots.includes(slot),
  ).length;
}

function availabilityDetails(slot) {
  const entries = participantEntries();
  return {
    available: entries.filter((participant) => participant.slots.includes(slot)),
    unavailable: entries.filter((participant) => !participant.slots.includes(slot)),
    total: entries.length,
  };
}

function maxAvailability() {
  return Math.max(0, ...state.slots.map(availabilityCount));
}

function syncControls() {
  el.eventName.value = state.eventName;
  el.startTime.value = state.startTime;
  el.endTime.value = state.endTime;
  el.slotLength.value = String(state.slotLength);
}

function renderGrid() {
  const name = participantName();
  const mine = name ? participantSlots(name) : new Set();
  const highest = maxAvailability();
  const zone = selectedZone();
  const slotsByDay = new Map(DAYS.map((day) => [day.id, []]));

  state.slots.forEach((slot) => {
    slotsByDay.get(slotDay(slot))?.push(slot);
  });

  el.grid.style.setProperty("--cols", DAYS.length);
  el.grid.innerHTML = "";
  el.grid.append(cell("Your time", "grid-header"));

  DAYS.forEach((day) => {
    el.grid.append(cell(day.label, "grid-header"));
  });

  const rows = Math.max(...[...slotsByDay.values()].map((slots) => slots.length));
  for (let row = 0; row < rows; row += 1) {
    const firstSlot = [...slotsByDay.values()].find((slots) => slots[row])?.[row];
    el.grid.append(cell(firstSlot ? localSlotParts(firstSlot, zone).time : "", "time-label"));

    DAYS.forEach((day) => {
      const slot = slotsByDay.get(day.id)[row];
      if (!slot) {
        el.grid.append(cell("", "grid-cell"));
        return;
      }

      const count = availabilityCount(slot);
      const details = availabilityDetails(slot);
      const slotCell = cell("", "grid-cell slot");
      slotCell.dataset.slot = slot;
      slotCell.dataset.count = count ? String(count) : "";
      slotCell.dataset.available = details.available.map((participant) => participant.name).join(", ");
      slotCell.dataset.unavailable = details.unavailable.map((participant) => participant.name).join(", ");
      slotCell.setAttribute("tabindex", "0");
      slotCell.setAttribute("aria-label", slotTooltipText(slot));
      slotCell.title = slotTooltipText(slot);
      slotCell.style.setProperty("--heat", highest ? count / highest : 0);
      slotCell.classList.toggle("mine", mine.has(slot));
      slotCell.classList.toggle("best", highest > 0 && count === highest);
      el.grid.append(slotCell);
    });
  }
}

function cell(text, className) {
  const node = document.createElement("div");
  node.className = className;
  node.textContent = text;
  return node;
}

function slotLabel(slot) {
  const local = localSlotParts(slot, selectedZone());
  return `${local.weekday} ${local.time}`;
}

function slotTooltipText(slot) {
  const details = availabilityDetails(slot);
  const day = DAYS.find((item) => item.id === slotDay(slot));
  const available = details.available.map((participant) => participant.name).join(", ") || "No one";
  const unavailable = details.unavailable.map((participant) => participant.name).join(", ") || "No one";
  return `${slotLabel(slot)} in ${selectedZone()}\n${day?.label || slotDay(slot)} ${displayTime(slotTime(slot))} ${BASE_ZONE_LABEL} time\nAvailable: ${available}\nNot available: ${unavailable}`;
}

function ensureSlotTooltip() {
  ensureSlotTooltipStyles();
  let tooltip = document.querySelector("#slotTooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "slotTooltip";
    tooltip.className = "slot-tooltip";
    tooltip.setAttribute("role", "status");
    document.body.append(tooltip);
  }
  return tooltip;
}

function ensureSlotTooltipStyles() {
  if (document.querySelector("#slotTooltipStyles")) return;
  const style = document.createElement("style");
  style.id = "slotTooltipStyles";
  style.textContent = `
    .slot-tooltip {
      position: absolute;
      z-index: 20;
      display: none;
      width: min(320px, calc(100vw - 24px));
      padding: 12px;
      border: 1px solid rgba(17, 93, 80, 0.28);
      border-radius: 8px;
      background: #fbfffd;
      box-shadow: 0 18px 46px rgba(26, 42, 38, 0.2);
      color: var(--ink);
      pointer-events: none;
    }
    .slot-tooltip.visible {
      display: grid;
      gap: 8px;
    }
    .slot-tooltip strong {
      font-size: 0.92rem;
    }
    .slot-tooltip span {
      color: var(--muted);
      font-size: 0.8rem;
    }
    .slot-tooltip-columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .slot-tooltip b {
      display: block;
      margin-bottom: 4px;
      color: var(--accent-strong);
      font-size: 0.76rem;
    }
    .slot-tooltip ul {
      display: grid;
      gap: 3px;
      margin: 0;
      padding: 0;
      list-style: none;
      color: var(--muted);
      font-size: 0.8rem;
    }
  `;
  document.head.append(style);
}

function renderSlotTooltip(slot, target) {
  const details = availabilityDetails(slot);
  const available = details.available
    .map((participant) => `<li>${escapeHtml(participant.name)}</li>`)
    .join("");
  const unavailable = details.unavailable
    .map((participant) => `<li>${escapeHtml(participant.name)}</li>`)
    .join("");
  const count = details.available.length;
  const total = details.total;
  const tooltip = ensureSlotTooltip();

  tooltip.innerHTML = `
    <strong>${escapeHtml(slotLabel(slot))}</strong>
    <span>${escapeHtml(selectedZone())} · ${escapeHtml(slotTooltipAnchor(slot))} ${BASE_ZONE_LABEL} time · ${count}/${total || 0} available</span>
    <div class="slot-tooltip-columns">
      <div>
        <b>Available</b>
        <ul>${available || "<li>No one yet</li>"}</ul>
      </div>
      <div>
        <b>Not available</b>
        <ul>${unavailable || "<li>No one</li>"}</ul>
      </div>
    </div>
  `;
  positionSlotTooltip(tooltip, target);
  tooltip.classList.add("visible");
}

function positionSlotTooltip(tooltip, target) {
  const rect = target.getBoundingClientRect();
  const margin = 12;
  const preferredLeft = rect.right + margin;
  const preferredTop = rect.top + window.scrollY - 12;
  tooltip.style.left = `${preferredLeft}px`;
  tooltip.style.top = `${preferredTop}px`;

  const tooltipRect = tooltip.getBoundingClientRect();
  const overflowRight = tooltipRect.right + margin - window.innerWidth;
  if (overflowRight > 0) {
    tooltip.style.left = `${Math.max(margin, rect.left + window.scrollX - tooltipRect.width - margin)}px`;
  }
  const overflowBottom = tooltipRect.bottom + margin - window.innerHeight;
  if (overflowBottom > 0) {
    tooltip.style.top = `${Math.max(margin, preferredTop - overflowBottom)}px`;
  }
}

function hideSlotTooltip() {
  document.querySelector("#slotTooltip")?.classList.remove("visible");
}

function slotTooltipAnchor(slot) {
  const day = DAYS.find((item) => item.id === slotDay(slot));
  return `${day?.label || slotDay(slot)} ${displayTime(slotTime(slot))}`;
}

function renderSidebar() {
  const participants = participantEntries();
  el.participantList.innerHTML = participants.length
    ? participants
        .map(
          (participant) =>
            `<div class="participant"><div><strong>${escapeHtml(participant.name)}</strong><span>${escapeHtml(participant.timeZone || "Unknown timezone")}</span></div><span>${participant.slots.length}</span></div>`,
        )
        .join("")
    : `<p class="muted">No one has added availability yet.</p>`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char];
  });
}

function renderShare() {
  const prefix = location.origin === "null" ? `file://${location.pathname}` : `${location.origin}${location.pathname}`;
  if (REMOTE_ENABLED) {
    const url = `${prefix}#${REMOTE_SCHEDULE_ID}`;
    el.shareBox.value = url;
    history.replaceState(null, "", `#${REMOTE_SCHEDULE_ID}`);
    return;
  }

  if (isDefaultInvite()) {
    const url = `${prefix}#weekend`;
    el.shareBox.value = url;
    history.replaceState(null, "", "#weekend");
    return;
  }

  const encoded = encodeState(shareState());
  const url = `${prefix}#schedule=${encoded}`;
  el.shareBox.value = url;
  history.replaceState(null, "", `#schedule=${encoded}`);
}

function renderStatus() {
  const name = participantName();
  el.currentPersonLabel.textContent = name
    ? `Editing availability for ${name}`
    : "Add your name to paint availability";
  const syncText = REMOTE_ENABLED ? "Synced for everyone." : "Copy the updated share link after editing.";
  el.timezoneHint.textContent = `The schedule is anchored to ${BASE_ZONE_LABEL} 9:00 AM-12:00 AM. The grid is shown in ${selectedZone()}. ${syncText}`;
}

function render(options = {}) {
  syncControls();
  renderStatus();
  renderGrid();
  renderSidebar();
  renderShare();
  localStorage.setItem(STORAGE_KEY, encodeState(shareState()));
  if (REMOTE_ENABLED && remoteReady && !options.skipRemoteSave) {
    scheduleRemoteSave();
  }
}

function ensureParticipant() {
  const name = participantName();
  if (!name) return null;
  state.participants[name] ||= {
    name,
    timeZone: el.timezoneSelect.value || detectedZone,
    slots: [],
  };
  state.participants[name].timeZone = el.timezoneSelect.value || detectedZone;
  return state.participants[name];
}

function setSlot(slot, available) {
  const participant = ensureParticipant();
  if (!participant) return;

  const slots = new Set(participant.slots);
  if (available) {
    slots.add(slot);
  } else {
    slots.delete(slot);
  }
  participant.slots = [...slots].sort();
  render();
}

function slotFromEvent(event) {
  const target = event.target.closest(".slot");
  return target?.dataset.slot || null;
}

function applyScheduleSettings() {
  state.eventName = el.eventName.value.trim() || "Biweekly fixed-time meeting";
  state.startTime = el.startTime.value;
  state.endTime = el.endTime.value;
  state.slotLength = Number(el.slotLength.value);
  state.slots = buildSlots(state.startTime, state.endTime, state.slotLength);

  const validSlots = new Set(state.slots);
  Object.values(state.participants).forEach((participant) => {
    participant.slots = participant.slots.filter((slot) => validSlots.has(slot));
  });

  el.saveStatus.textContent = "Grid updated";
  render();
}

setupTimeZones();
syncControls();
render();

el.applyButton.addEventListener("click", applyScheduleSettings);
el.eventName.addEventListener("change", () => {
  state.eventName = el.eventName.value.trim() || "Biweekly fixed-time meeting";
  render();
});
el.personName.addEventListener("input", renderStatus);
el.timezoneSelect.addEventListener("change", render);

el.grid.addEventListener("pointerdown", (event) => {
  const slot = slotFromEvent(event);
  if (!slot) return;
  const participant = ensureParticipant();
  if (!participant) {
    el.personName.focus();
    el.saveStatus.textContent = "Add your name first";
    return;
  }
  dragMode = !participant.slots.includes(slot);
  setSlot(slot, dragMode);
});

el.grid.addEventListener("pointerover", (event) => {
  const target = event.target.closest(".slot");
  if (target) renderSlotTooltip(target.dataset.slot, target);

  if (dragMode === null || event.buttons !== 1) return;
  const slot = target?.dataset.slot || null;
  if (slot) setSlot(slot, dragMode);
});

el.grid.addEventListener("pointermove", (event) => {
  const target = event.target.closest(".slot");
  if (!target) return;
  positionSlotTooltip(ensureSlotTooltip(), target);
});

el.grid.addEventListener("pointerout", (event) => {
  const fromSlot = event.target.closest(".slot");
  const toSlot = event.relatedTarget?.closest?.(".slot");
  if (fromSlot && fromSlot !== toSlot) hideSlotTooltip();
});

el.grid.addEventListener("focusin", (event) => {
  const target = event.target.closest(".slot");
  if (target) renderSlotTooltip(target.dataset.slot, target);
});

el.grid.addEventListener("focusout", (event) => {
  if (event.target.closest(".slot")) hideSlotTooltip();
});

window.addEventListener("pointerup", () => {
  dragMode = null;
});

el.copyLinkButton.addEventListener("click", async () => {
  renderShare();
  try {
    await navigator.clipboard.writeText(el.shareBox.value);
    el.saveStatus.textContent = "Link copied";
  } catch {
    el.shareBox.focus();
    el.shareBox.select();
    document.execCommand("copy");
    el.saveStatus.textContent = "Link selected";
  }
});

el.resetButton.addEventListener("click", () => {
  if (!confirm("Clear this schedule from this browser?")) return;
  state = defaultState();
  localStorage.removeItem(STORAGE_KEY);
  history.replaceState(null, "", location.pathname);
  render();
});

function remoteHeaders(extra = {}) {
  return {
    apikey: REMOTE_CONFIG.supabaseAnonKey,
    Authorization: `Bearer ${REMOTE_CONFIG.supabaseAnonKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function remoteBaseUrl() {
  return `${REMOTE_CONFIG.supabaseUrl.replace(/\/$/, "")}/rest/v1/timebridge_schedules`;
}

async function fetchRemoteState() {
  const response = await fetch(
    `${remoteBaseUrl()}?id=eq.${encodeURIComponent(REMOTE_SCHEDULE_ID)}&select=data,updated_at`,
    { headers: remoteHeaders() },
  );
  if (!response.ok) {
    throw new Error(`Remote load failed: ${response.status}`);
  }
  const rows = await response.json();
  return rows[0]?.data || null;
}

async function saveRemoteState() {
  const data = await remoteMergedState();
  const snapshot = stateSnapshot(data);
  if (snapshot === lastRemoteSnapshot) return;

  const response = await fetch(remoteBaseUrl(), {
    method: "POST",
    headers: remoteHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({
      id: REMOTE_SCHEDULE_ID,
      data,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) {
    throw new Error(`Remote save failed: ${response.status}`);
  }
  state = normalizeState(data);
  lastRemoteSnapshot = snapshot;
  render({ skipRemoteSave: true });
  el.saveStatus.textContent = "Synced";
}

async function remoteMergedState() {
  const local = shareState();
  let remote = null;
  try {
    remote = await fetchRemoteState();
  } catch {
    remote = null;
  }
  if (!remote) return local;

  const remoteState = normalizeState(remote);
  const currentName = participantName();
  const mergedParticipants = { ...remoteState.participants };

  Object.entries(local.participants || {}).forEach(([name, participant]) => {
    if (name === currentName || !mergedParticipants[name]) {
      mergedParticipants[name] = participant;
    }
  });

  return {
    ...local,
    participants: mergedParticipants,
  };
}

function scheduleRemoteSave() {
  clearTimeout(remoteSaveTimer);
  el.saveStatus.textContent = "Syncing...";
  remoteSaveTimer = setTimeout(async () => {
    try {
      await saveRemoteState();
    } catch {
      el.saveStatus.textContent = "Sync failed";
    }
  }, 500);
}

async function refreshRemoteState() {
  if (!REMOTE_ENABLED) return;
  try {
    const remoteState = await fetchRemoteState();
    if (!remoteState) {
      await saveRemoteState();
      return;
    }

    const normalized = normalizeState(remoteState);
    const remoteSnapshot = stateSnapshot(shareStateFrom(normalized));
    if (remoteSnapshot !== lastRemoteSnapshot && remoteSnapshot !== stateSnapshot()) {
      state = normalized;
      lastRemoteSnapshot = remoteSnapshot;
      render({ skipRemoteSave: true });
      el.saveStatus.textContent = "Updated";
    }
  } catch {
    el.saveStatus.textContent = "Offline";
  }
}

function shareStateFrom(nextState) {
  return {
    version: nextState.version,
    mode: nextState.mode,
    eventName: nextState.eventName,
    baseZone: BASE_ZONE,
    days: nextState.days,
    startTime: nextState.startTime,
    endTime: nextState.endTime,
    slotLength: nextState.slotLength,
    participants: nextState.participants,
  };
}

async function initRemoteSync() {
  if (!REMOTE_ENABLED) {
    el.saveStatus.textContent = "Local link mode";
    return;
  }

  el.saveStatus.textContent = "Connecting...";
  try {
    const remoteState = await fetchRemoteState();
    if (remoteState) {
      state = normalizeState(remoteState);
      lastRemoteSnapshot = stateSnapshot(shareState());
      remoteReady = true;
      render({ skipRemoteSave: true });
      el.saveStatus.textContent = "Synced";
    } else {
      remoteReady = true;
      await saveRemoteState();
      render({ skipRemoteSave: true });
    }
    setInterval(refreshRemoteState, SYNC_INTERVAL_MS);
  } catch {
    remoteReady = false;
    el.saveStatus.textContent = "Remote setup needed";
  }
}

initRemoteSync();
