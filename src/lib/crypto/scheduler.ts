import { todayKey } from "./goals.ts";

/**
 * Agent scheduler — the "24/7 grind" loop.
 *
 * There is no hosted worker: the loop runs while this app is open (tab or PWA
 * on a phone). Everything it does is one of four honest actions — build the
 * day's plan once, hunt leads on a cadence, draft missing proposals, and check
 * in for the streak — and every side effect is visible in the run log. The UI
 * shows exactly what is due and when, so "always-on" never means "invisible".
 */

export const SCHEDULER_STORE_KEY = "chainscout.scheduler.v1";

export type ScheduledAction = "plan" | "hunt" | "draft" | "check-in";

export type SchedulerRun = {
  at: string;
  action: ScheduledAction;
  detail: string;
};

export type SchedulerState = {
  enabled: boolean;
  autoHuntMins: number;
  autoDraft: boolean;
  notifications: boolean;
  keepAwake: boolean;
  lastHuntAt: string;
  lastDraftAt: string;
  lastPlanDay: string;
  lastCheckInDay: string;
  awakeSince: string;
  runs: SchedulerRun[];
};

export const DEFAULT_SCHEDULER: SchedulerState = {
  enabled: true,
  autoHuntMins: 45,
  autoDraft: true,
  notifications: false,
  keepAwake: false,
  lastHuntAt: "",
  lastDraftAt: "",
  lastPlanDay: "",
  lastCheckInDay: "",
  awakeSince: "",
  runs: [],
};

export function loadScheduler(): SchedulerState {
  try {
    const raw = localStorage.getItem(SCHEDULER_STORE_KEY);
    if (!raw) return { ...DEFAULT_SCHEDULER, runs: [] };
    const parsed = JSON.parse(raw) as Partial<SchedulerState>;
    return {
      ...DEFAULT_SCHEDULER,
      ...parsed,
      runs: Array.isArray(parsed.runs) ? parsed.runs.slice(0, 20) : [],
    };
  } catch {
    return { ...DEFAULT_SCHEDULER, runs: [] };
  }
}

export function saveScheduler(state: SchedulerState): void {
  try {
    localStorage.setItem(
      SCHEDULER_STORE_KEY,
      JSON.stringify({ ...state, runs: state.runs.slice(0, 20) }),
    );
  } catch {
    // Quota errors: in-memory state still works this session.
  }
}

export function recordRun(
  state: SchedulerState,
  action: ScheduledAction,
  detail: string,
  at = new Date(),
): SchedulerState {
  const iso = at.toISOString();
  const next: SchedulerState = {
    ...state,
    runs: [{ at: iso, action, detail }, ...state.runs].slice(0, 20),
  };
  if (action === "hunt") next.lastHuntAt = iso;
  if (action === "draft") next.lastDraftAt = iso;
  if (action === "plan") next.lastPlanDay = todayKey(at);
  if (action === "check-in") next.lastCheckInDay = todayKey(at);
  return next;
}

/** Milliseconds until the next hunt is due (0 when due/overdue). Negative lastHuntAt = never. */
export function huntDueInMs(state: SchedulerState, now = new Date()): number {
  if (!state.enabled) return Number.POSITIVE_INFINITY;
  // The first hunt is always manual (it spends live-search credits); that arms the loop.
  if (!state.lastHuntAt) return Number.POSITIVE_INFINITY;
  const dueAt = Date.parse(state.lastHuntAt) + Math.max(5, state.autoHuntMins) * 60_000;
  return Math.max(0, dueAt - now.getTime());
}

export const DRAFT_INTERVAL_MS = 15 * 60_000;

export function draftDueInMs(state: SchedulerState, now = new Date()): number {
  if (!state.enabled || !state.autoDraft) return Number.POSITIVE_INFINITY;
  if (!state.lastDraftAt) return 0; // Never run yet — due as soon as there is something to draft.
  return Math.max(0, Date.parse(state.lastDraftAt) + DRAFT_INTERVAL_MS - now.getTime());
}

/**
 * Which scheduled actions are due right now. Pure — the runner decides how to
 * execute them (and may skip a hunt on the server's live-search cooldown).
 */
export function dueActions(state: SchedulerState, now = new Date()): ScheduledAction[] {
  if (!state.enabled) return [];
  const due: ScheduledAction[] = [];
  const day = todayKey(now);
  if (state.lastPlanDay !== day) due.push("plan");
  if (state.lastCheckInDay !== day) due.push("check-in");
  if (huntDueInMs(state, now) === 0) due.push("hunt");
  if (draftDueInMs(state, now) === 0) due.push("draft");
  return due;
}

export function markAwake(state: SchedulerState, now = new Date()): SchedulerState {
  if (state.awakeSince) return state;
  return { ...state, awakeSince: now.toISOString() };
}

export function awakeMinutes(state: SchedulerState, now = new Date()): number {
  if (!state.awakeSince) return 0;
  return Math.max(0, Math.round((now.getTime() - Date.parse(state.awakeSince)) / 60_000));
}

/* ------------------------------ Notifications ------------------------------ */

export function canNotify(): boolean {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

export async function requestNotifyPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

export function notify(title: string, body: string): void {
  if (!canNotify()) return;
  try {
    new Notification(title, { body, tag: "chainscout-agent" });
  } catch {
    // Some browsers throw on constructor usage; silently fall back to in-app toasts.
  }
}

/* ------------------------------ Wake lock ------------------------------ */

export async function requestWakeLock(): Promise<boolean> {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: "screen"): Promise<unknown> };
    };
    if (!nav.wakeLock) return false;
    await nav.wakeLock.request("screen");
    return true;
  } catch {
    return false;
  }
}
