import { loadEarningEntries } from "./earnings-store.ts";
import { loadJobs } from "./jobs.ts";

/**
 * Daily goal + gamification engine ("worker game").
 *
 * Money numbers come only from the real earnings log and the real jobs store.
 * XP / levels / streaks are a playful wrapper around real activity — XP is
 * never money and is labelled that way in the UI. The $40/day figure is a
 * target the user chases, never a promise.
 */

export const GOALS_STORE_KEY = "chainscout.goals.v1";
export const DEFAULT_DAILY_GOAL_USD = 40;

export type GoalsState = {
  dailyGoalUsd: number;
  xp: number;
  streakDays: number;
  lastActiveDay: string;
  /** Local YYYY-MM-DD → real earnings logged that day (USD). */
  dayHistory: Record<string, number>;
  /** Quest ids completed on `questDay`; reset when the day rolls over. */
  questDay: string;
  questDone: string[];
  scansToday: number;
  scanDay: string;
  tasksQueuedToday: number;
  tasksDay: string;
  brainDay: string;
  brainConnected: boolean;
};

export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function defaultGoals(): GoalsState {
  return {
    dailyGoalUsd: DEFAULT_DAILY_GOAL_USD,
    xp: 0,
    streakDays: 0,
    lastActiveDay: "",
    dayHistory: {},
    questDay: "",
    questDone: [],
    scansToday: 0,
    scanDay: "",
    tasksQueuedToday: 0,
    tasksDay: "",
    brainDay: "",
    brainConnected: false,
  };
}

function isGoalsState(value: unknown): value is GoalsState {
  return Boolean(value) && typeof value === "object";
}

export function loadGoals(): GoalsState {
  try {
    const raw = localStorage.getItem(GOALS_STORE_KEY);
    if (!raw) return defaultGoals();
    const parsed = JSON.parse(raw) as Partial<GoalsState>;
    if (!isGoalsState(parsed)) return defaultGoals();
    return {
      ...defaultGoals(),
      ...parsed,
      dayHistory:
        parsed.dayHistory && typeof parsed.dayHistory === "object" ? parsed.dayHistory : {},
      questDone: Array.isArray(parsed.questDone) ? parsed.questDone : [],
    };
  } catch {
    return defaultGoals();
  }
}

export function saveGoals(state: GoalsState): void {
  try {
    localStorage.setItem(GOALS_STORE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota errors; in-memory state still works.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("chainscout:goals"));
  }
}

/** Roll day-scoped counters and the quest list over when the calendar day changes. */
export function rollDay(state: GoalsState, day = todayKey()): GoalsState {
  const next = { ...state };
  if (next.questDay !== day) {
    next.questDay = day;
    next.questDone = [];
  }
  if (next.scanDay !== day) {
    next.scanDay = day;
    next.scansToday = 0;
  }
  if (next.tasksDay !== day) {
    next.tasksDay = day;
    next.tasksQueuedToday = 0;
  }
  return next;
}

export function loadGoalsRolled(): GoalsState {
  const day = todayKey();
  const current = loadGoals();
  const rolled = rollDay(current, day);
  if (JSON.stringify(rolled) !== JSON.stringify(current)) {
    saveGoals(rolled);
  }
  return rolled;
}

/* --------------------------------- Levels --------------------------------- */

export const LEVEL_TITLES = [
  "Rookie Scout",
  "Task Runner",
  "Steady Grinder",
  "Closer",
  "Deal Maker",
  "Rainmaker",
  "Legend",
];

export type LevelInfo = {
  level: number;
  title: string;
  intoLevel: number;
  needForNext: number;
};

export function levelForXp(xp: number): LevelInfo {
  const safe = Math.max(0, Math.floor(xp));
  // Level n requires 100 * n * (n - 1) / 2 lifetime XP (100, 300, 600, 1000…).
  let level = 1;
  let floor = 0;
  while (level < 20 && safe >= floor + level * 100) {
    floor += level * 100;
    level += 1;
  }
  const needForNext = level * 100;
  const intoLevel = safe - floor;
  const title = LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)];
  return { level, title, intoLevel, needForNext };
}

/* ---------------------------------- XP ---------------------------------- */

export type XpEvent =
  "check-in" | "scan" | "add-task" | "approve-job" | "finish-job" | "log-earning" | "connect-brain";

export const XP_VALUES: Record<XpEvent, number> = {
  "check-in": 5,
  scan: 20,
  "add-task": 15,
  "approve-job": 25,
  "finish-job": 60,
  "log-earning": 40,
  "connect-brain": 30,
};

export type XpAward = {
  gained: number;
  total: number;
  level: LevelInfo;
  leveledUp: boolean;
  message: string;
};

/** Record activity: XP, streak touch, and day-rolled counters. */
export function awardXp(event: XpEvent): XpAward | null {
  if (typeof localStorage === "undefined") return null;
  const day = todayKey();
  const state = loadGoalsRolled();
  const before = levelForXp(state.xp);
  const gained = XP_VALUES[event];

  state.xp += gained;
  if (state.lastActiveDay !== day) {
    state.streakDays = state.streakDays > 0 ? state.streakDays + 1 : 1;
    state.lastActiveDay = day;
  }
  if (event === "scan") {
    state.scansToday += 1;
    state.scanDay = day;
  }
  if (event === "add-task") {
    state.tasksQueuedToday += 1;
    state.tasksDay = day;
  }
  if (event === "connect-brain") {
    state.brainConnected = true;
    state.brainDay = day;
  }

  saveGoals(state);
  const after = levelForXp(state.xp);
  return {
    gained,
    total: state.xp,
    level: after,
    leveledUp: after.level > before.level,
    message: `+${gained} XP`,
  };
}

/* ------------------------------ Real money math ------------------------------ */

/** Real earnings logged today (USD), straight from the earnings log. */
export function todayEarnedUsd(day = todayKey()): number {
  return loadEarningEntries()
    .filter((entry) => entry.date.slice(0, 10) === day)
    .reduce((sum, entry) => sum + (Number.isFinite(entry.amountUsd) ? entry.amountUsd : 0), 0);
}

/** Per-hour pace needed to hit the goal from now until midnight (0 if goal met). */
export function pacePerHourUsd(earnedUsd: number, goalUsd: number, now = new Date()): number {
  const remaining = Math.max(0, goalUsd - earnedUsd);
  if (remaining <= 0) return 0;
  const endOfDay = new Date(now);
  endOfDay.setHours(24, 0, 0, 0);
  const hoursLeft = Math.max((endOfDay.getTime() - now.getTime()) / 3_600_000, 0.25);
  return remaining / hoursLeft;
}

/* --------------------------------- Quests --------------------------------- */

export type Quest = {
  id: string;
  title: string;
  detail: string;
  progress: number;
  goal: number;
  unit: "usd" | "count";
  xp: number;
  done: boolean;
  action: { label: string; go: "jobs" | "earnings" | "overview" | "brain" | "grind" };
};

/** Daily quest list — progress is derived from real stores, not stored fictions. */
export function questList(state: GoalsState, day = todayKey()): Quest[] {
  const goalUsd = state.dailyGoalUsd > 0 ? state.dailyGoalUsd : DEFAULT_DAILY_GOAL_USD;
  const earned = todayEarnedUsd(day);
  const entriesToday = loadEarningEntries().filter((e) => e.date.slice(0, 10) === day).length;
  const jobs = loadJobs();
  const approvedToday = jobs.filter(
    (j) => j.approvedAt && j.approvedAt.slice(0, 10) === day,
  ).length;
  const doneToday = jobs.filter((j) => j.finishedAt && j.finishedAt.slice(0, 10) === day).length;
  const quarter = goalUsd / 4;

  const raw: Omit<Quest, "done">[] = [
    {
      id: "log-first-earning",
      title: "Log your first earning",
      detail: "Record any real payout in the earnings log.",
      progress: Math.min(entriesToday, 1),
      goal: 1,
      unit: "count",
      xp: XP_VALUES["log-earning"],
      action: { label: "Log it", go: "earnings" },
    },
    {
      id: "reach-quarter-goal",
      title: `Reach 25% of the $${fmtUsd(goalUsd)} goal`,
      detail: `Bank at least $${fmtUsd(quarter)} of real logged earnings today.`,
      progress: Math.min(earned, quarter),
      goal: quarter,
      unit: "usd",
      xp: 35,
      action: { label: "Earn now", go: "overview" },
    },
    {
      id: "approve-a-job",
      title: "Approve one agent job",
      detail: "Your agent queues work — approve a card to let it start.",
      progress: Math.min(approvedToday, 1),
      goal: 1,
      unit: "count",
      xp: XP_VALUES["approve-job"],
      action: { label: "Open jobs", go: "jobs" },
    },
    {
      id: "queue-two-tasks",
      title: "Queue two tasks for the agent",
      detail: "Approve leads on the Grind board (or add a task) — twice today.",
      progress: Math.min(state.tasksQueuedToday, 2),
      goal: 2,
      unit: "count",
      xp: 30,
      action: { label: "Open grind board", go: "grind" },
    },
    {
      id: "finish-a-job",
      title: "Finish one job to done",
      detail: "Complete the checklist and mark a job done.",
      progress: Math.min(doneToday, 1),
      goal: 1,
      unit: "count",
      xp: XP_VALUES["finish-job"],
      action: { label: "Open jobs", go: "jobs" },
    },
    {
      id: "connect-brain",
      title: "Connect at least one agent brain",
      detail: "Add a free LLM key (Gemini, Groq, or OpenRouter) in Agent Brain.",
      progress: state.brainConnected ? 1 : 0,
      goal: 1,
      unit: "count",
      xp: XP_VALUES["connect-brain"],
      action: { label: "Open brain", go: "brain" },
    },
    {
      id: "hit-goal",
      title: `Hit the $${fmtUsd(goalUsd)} daily goal`,
      detail: "The full grind — this one is the boss fight.",
      progress: Math.min(earned, goalUsd),
      goal: goalUsd,
      unit: "usd",
      xp: 120,
      action: { label: "Earn now", go: "overview" },
    },
  ];

  return raw.map((quest) => ({ ...quest, done: quest.progress >= quest.goal }));
}

function fmtUsd(value: number): string {
  return value % 1 === 0 ? String(value) : value.toFixed(2);
}

export function completedQuestIds(quests: Quest[]): string[] {
  return quests.filter((q) => q.done).map((q) => q.id);
}
