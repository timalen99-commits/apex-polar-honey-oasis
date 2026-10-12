import { createManualJob, type AgentJob } from "./jobs.ts";
import { brainComplete, type BrainConfig, type ServerKeyStatus } from "./llm.ts";

/**
 * Grind board — the $40/day task engine.
 *
 * Tasks come from three honest sources: a curated catalog of real public
 * marketplaces, live agent hunts (xAI web search), and manual adds. Pay ranges
 * are typical public figures, never promises. Every task flows into the same
 * approval-card job pipeline: the agent drafts and queues, the user approves,
 * the user submits from their own accounts. Nothing is auto-submitted, and
 * ToS/ban risks are flagged up front — especially for paid-engagement gigs.
 */

export type TaskKind = "freelance" | "crypto" | "microtask" | "content" | "product";
export type RiskFlag = "tos-risk" | "ban-risk" | "geo-check" | "unverified-pay" | "points-only";
export type GrindStatus = "lead" | "queued" | "declined";

export type GrindTask = {
  id: string;
  kind: TaskKind;
  title: string;
  project: string;
  summary: string;
  payUsdLow: number;
  payUsdHigh: number;
  minutes: number;
  riskFlags: RiskFlag[];
  requirements: string[];
  howTo: string[];
  sourceLabel: string;
  sourceUrl: string;
  discoveredAt: string;
  origin: "catalog" | "hunt" | "manual";
  status: GrindStatus;
  jobId: string | null;
  draft: string;
  draftSource: "template" | "agent" | "none";
};

export const GRIND_STORE_KEY = "chainscout.grind.v1";

export const KIND_LABEL: Record<TaskKind, string> = {
  freelance: "Freelance gig",
  crypto: "Crypto quest",
  microtask: "Micro-task",
  content: "Content work",
  product: "Digital product",
};

export const RISK_LABEL: Record<RiskFlag, string> = {
  "tos-risk": "Platform ToS risk",
  "ban-risk": "Account ban risk",
  "geo-check": "Check Nigeria access",
  "unverified-pay": "Pay not verified",
  "points-only": "Pays in points/tokens",
};

export const RISK_NOTE: Record<RiskFlag, string> = {
  "tos-risk":
    "Automating or selling this kind of engagement breaks most platform terms — do it manually from your own account or skip it.",
  "ban-risk": "Platforms detect scripted or repeated patterns; accounts can be suspended.",
  "geo-check":
    "Some of these marketplaces restrict Nigerian sign-ups or payouts — verify before spending time.",
  "unverified-pay": "Pay figures come from public listings and vary widely per client/campaign.",
  "points-only": "Many campaigns pay in points or tokens that may convert to little or nothing.",
};

/* ------------------------------- Store ------------------------------- */

export function newTaskId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isTask(value: unknown): value is GrindTask {
  if (!value || typeof value !== "object") return false;
  const t = value as Partial<GrindTask>;
  return typeof t.id === "string" && typeof t.title === "string" && typeof t.kind === "string";
}

export function loadGrindTasks(): GrindTask[] {
  try {
    const raw = localStorage.getItem(GRIND_STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTask).slice(0, 80);
  } catch {
    return [];
  }
}

export function saveGrindTasks(tasks: GrindTask[]): void {
  try {
    localStorage.setItem(GRIND_STORE_KEY, JSON.stringify(tasks.slice(0, 80)));
  } catch {
    // Quota errors: in-memory list still works this session.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("chainscout:goals"));
  }
}

export function appendGrindTasks(incoming: GrindTask[], existing?: GrindTask[]): GrindTask[] {
  const current = existing ?? loadGrindTasks();
  const seen = new Set(current.map((t) => `${t.title.toLowerCase()}|${t.sourceUrl}`));
  const fresh = incoming.filter((t) => {
    const key = `${t.title.toLowerCase()}|${t.sourceUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const next = [...fresh, ...current].slice(0, 80);
  saveGrindTasks(next);
  return next;
}

export function updateGrindTask(id: string, patch: Partial<GrindTask>): GrindTask[] {
  const next = loadGrindTasks().map((t) => (t.id === id ? { ...t, ...patch } : t));
  saveGrindTasks(next);
  return next;
}

/* --------------------------- Draft templates --------------------------- */

export function templateDraft(task: GrindTask): string {
  switch (task.kind) {
    case "freelance":
      return [
        "Hi — I can take this on today.",
        "",
        `Plan: ${task.howTo[0] ?? "clarify the exact scope first, then deliver in one pass"}`,
        `Deliverable: ${task.title.toLowerCase()} completed and shared for your review before the deadline.`,
        `Timeline: about ${Math.round(task.minutes / 15) * 15} minutes of focused work once scope is confirmed.`,
        "",
        "Happy to adjust scope or budget first — just tell me what matters most. Thanks!",
      ].join("\n");
    case "content":
      return [
        "Hi — I'd like to do this one.",
        "",
        `What you'll get: ${task.title.toLowerCase()}, written to your brief and tone, with one revision pass included.`,
        "I work fast and keep copy honest and specific — no filler, no invented claims.",
        "",
        `Estimated turnaround: ${Math.round(task.minutes / 15) * 15} minutes once the brief is confirmed.`,
      ].join("\n");
    case "crypto":
      return [
        "Quest completion note:",
        "",
        `- Completed the required public steps for "${task.title}".`,
        "- Proof: my wallet address + links/screenshots of each completed step are attached.",
        "- No seed phrase, private key, or upfront payment was ever provided to anyone.",
        "",
        "Wallet (for rewards only): [paste your public address]",
      ].join("\n");
    case "microtask":
      return [
        "Task proof:",
        "",
        `- Task: ${task.title}`,
        "- Done from my own verified account, manually.",
        "- Screenshot(s) with timestamp attached.",
        "",
        "Note to self: keep to one account, follow the marketplace rules, and skip anything asking for deposits or referrals-only payoffs.",
      ].join("\n");
    case "product":
    default:
      return [
        `Title: ${task.title}`,
        "",
        "A practical, ready-to-use deliverable — clear description, honest screenshots, fair price.",
        "Buyers get the files instantly plus a short usage guide. No upsells, no fake scarcity.",
      ].join("\n");
  }
}

/**
 * Ask the agent brain for a sharper draft; fall back to the template when no
 * brain is connected or every provider fails. The draft is text for the USER
 * to review and submit — nothing is auto-sent anywhere.
 */
export async function draftForTask(
  task: GrindTask,
  config: BrainConfig,
  serverKeys?: ServerKeyStatus,
): Promise<{ draft: string; source: "template" | "agent" }> {
  const fallback = templateDraft(task);
  const outcome = await brainComplete(
    config,
    {
      system:
        "You draft short, honest, first-person work proposals and completion notes for a solo freelancer in Lagos, Nigeria. Never promise guaranteed income, never fabricate experience or links, never suggest seed phrases, deposits, or fake engagement. Keep it under 120 words. Return ONLY the draft text — no preamble, no quotes.",
      prompt: [
        `Task type: ${KIND_LABEL[task.kind]}`,
        `Task: ${task.title}`,
        `About: ${task.summary}`,
        `Typical pay: $${task.payUsdLow}-$${task.payUsdHigh}`,
        `Expected effort: ~${task.minutes} minutes`,
        `Suggested approach: ${task.howTo.join(" / ") || "confirm scope first"}`,
        "",
        "Draft a ready-to-send proposal or completion note for this task. If it is a paid engagement gig (likes/follows), keep the note manual-sounding and brief and do not mention automation.",
      ].join("\n"),
      maxTokens: 320,
    },
    serverKeys,
  );
  if (outcome.ok) return { draft: outcome.text.trim() || fallback, source: "agent" };
  return { draft: fallback, source: "template" };
}

/* ------------------------------ Plan math ------------------------------ */

export function taskValuePerHour(task: GrindTask): number {
  const avg = (task.payUsdLow + task.payUsdHigh) / 2;
  return task.minutes > 0 ? (avg * 60) / task.minutes : 0;
}

export function queuedValueUsd(tasks: GrindTask[]): number {
  return tasks
    .filter((t) => t.status === "queued")
    .reduce((sum, t) => sum + (t.payUsdLow + t.payUsdHigh) / 2, 0);
}

export type DailyPlan = {
  picks: GrindTask[];
  queuedValue: number;
  goalUsd: number;
  gapUsd: number;
  supplyCoversGoal: boolean;
  note: string;
};

/**
 * Honest daily plan: best value/hour leads first, and a straight answer when
 * queued supply does not yet cover the goal (instead of pretending it does).
 */
export function buildDailyPlan(tasks: GrindTask[], goalUsd: number): DailyPlan {
  const queuedValue = queuedValueUsd(tasks);
  const picks = tasks
    .filter((t) => t.status === "lead")
    .sort((a, b) => taskValuePerHour(b) - taskValuePerHour(a))
    .slice(0, 6);
  const pickValue = picks.reduce((sum, t) => sum + (t.payUsdLow + t.payUsdHigh) / 2, 0);
  const gapUsd = Math.max(0, goalUsd - queuedValue);
  const supplyCoversGoal = queuedValue + pickValue >= goalUsd;
  const note = supplyCoversGoal
    ? `Queued work worth ~$${queuedValue.toFixed(2)} plus these leads (~$${pickValue.toFixed(2)}) can cover today's $${goalUsd} target — if they land. Approve, grind, and log what actually pays.`
    : `Queued work (~$${queuedValue.toFixed(2)}) plus the best leads (~$${pickValue.toFixed(2)}) still leaves a ~$${(goalUsd - queuedValue - pickValue).toFixed(2)} gap at typical rates. Hunt for more leads, or grind higher-value gigs — the target is what we chase, not a promise.`;
  return { picks, queuedValue, goalUsd, gapUsd, supplyCoversGoal, note };
}

/* --------------------------- Queue into jobs --------------------------- */

export function huntedToGrindTask(hunt: {
  kind: string;
  title: string;
  project: string;
  summary: string;
  payUsdLow: number;
  payUsdHigh: number;
  minutes: number;
  riskFlags: string[];
  requirements: string[];
  sourceLabel: string;
  sourceUrl: string;
}): GrindTask {
  return {
    id: newTaskId(),
    kind: (["freelance", "crypto", "microtask", "content", "product"] as string[]).includes(
      hunt.kind,
    )
      ? (hunt.kind as TaskKind)
      : "microtask",
    title: hunt.title,
    project: hunt.project,
    summary: hunt.summary,
    payUsdLow: hunt.payUsdLow,
    payUsdHigh: hunt.payUsdHigh,
    minutes: hunt.minutes,
    riskFlags: hunt.riskFlags.filter((r): r is RiskFlag =>
      (["tos-risk", "ban-risk", "geo-check", "unverified-pay", "points-only"] as string[]).includes(
        r,
      ),
    ),
    requirements: hunt.requirements,
    howTo: [],
    sourceLabel: hunt.sourceLabel,
    sourceUrl: hunt.sourceUrl,
    discoveredAt: new Date().toISOString(),
    origin: "hunt",
    status: "lead",
    jobId: null,
    draft: "",
    draftSource: "none",
  };
}

/** Approve a lead → it becomes an approval-card job in the jobs pipeline. */
export function queueGrindTask(task: GrindTask): { job: AgentJob; tasks: GrindTask[] } {
  const job = createManualJob({
    title: task.title,
    link: task.sourceUrl || undefined,
    reward:
      task.payUsdLow === task.payUsdHigh
        ? `$${task.payUsdLow}`
        : `$${task.payUsdLow}-${task.payUsdHigh}`,
    summary: task.summary,
  });
  const tasks = updateGrindTask(task.id, {
    status: "queued",
    jobId: job.id,
  });
  return { job, tasks };
}

/* --------------------------- Curated catalog --------------------------- */

function catalogTask(
  input: Omit<
    GrindTask,
    "id" | "discoveredAt" | "origin" | "status" | "jobId" | "draft" | "draftSource"
  >,
): GrindTask {
  return {
    ...input,
    id: newTaskId(),
    discoveredAt: new Date().toISOString(),
    origin: "catalog",
    status: "lead",
    jobId: null,
    draft: "",
    draftSource: "none",
  };
}

/** Starter plays built from real, public marketplaces. Pay = typical public ranges. */
export function starterCatalog(): GrindTask[] {
  return [
    catalogTask({
      kind: "freelance",
      title: "Small bug fix or feature add for a web app",
      project: "Upwork / Fiverr micro-gigs",
      summary:
        "The highest-value classic: one scoped dev fix (bug, styling, small feature) with a fast turnaround.",
      payUsdLow: 15,
      payUsdHigh: 75,
      minutes: 90,
      riskFlags: ["geo-check"],
      requirements: ["A code sample or two", "Clear written English", "Ability to show a demo"],
      howTo: [
        "Sort newest-first and apply within the first hour",
        "Lead with the fix you'd make, not your life story",
        "Quote a fixed price and a same-day timeline",
      ],
      sourceLabel: "Upwork",
      sourceUrl: "https://www.upwork.com/nx/search/jobs/",
    }),
    catalogTask({
      kind: "freelance",
      title: "Game asset, game mod, or tiny playable prototype",
      project: "Game-dev freelance listings",
      summary:
        "Game-dev framed gigs: sprite/asset work, a mod, or a small playable prototype on a short deadline.",
      payUsdLow: 20,
      payUsdHigh: 80,
      minutes: 120,
      riskFlags: ["geo-check"],
      requirements: [
        "One tiny demo (itch.io page works)",
        "Comfortable with an engine of your choice",
      ],
      howTo: [
        "Post a playable micro-demo first — it sells better than a résumé",
        "Offer a fixed scope: one level, one mechanic, one asset pack",
        "Deliver an itch.io link or zip build",
      ],
      sourceLabel: "itch.io jobs / game-dev boards",
      sourceUrl: "https://itch.io/jobs",
    }),
    catalogTask({
      kind: "freelance",
      title: "Spreadsheet cleanup or data entry batch",
      project: "Freelance marketplaces",
      summary: "Unexciting, reliable work: clean a sheet, dedupe rows, format a report.",
      payUsdLow: 5,
      payUsdHigh: 25,
      minutes: 45,
      riskFlags: ["geo-check"],
      requirements: ["Spreadsheet basics", "Attention to detail"],
      howTo: [
        "Bid lowest sustainable rate at first to build reviews",
        "Show one before/after sample",
      ],
      sourceLabel: "Upwork",
      sourceUrl: "https://www.upwork.com/nx/search/jobs/",
    }),
    catalogTask({
      kind: "content",
      title: "Short blog post, listing, or product description",
      project: "Content marketplaces / direct clients",
      summary: "300–600 words of honest, specific copy. Fast to draft with the agent brain.",
      payUsdLow: 5,
      payUsdHigh: 30,
      minutes: 40,
      riskFlags: ["geo-check"],
      requirements: ["Clean writing", "No fabricated claims in the copy"],
      howTo: ["Offer 24h delivery", "Send a 1-paragraph sample rewrite with the pitch"],
      sourceLabel: "Upwork / Fiverr",
      sourceUrl: "https://www.fiverr.com/categories/writing-translation",
    }),
    catalogTask({
      kind: "content",
      title: "Short-form video captions or a clip pack",
      project: "Creator gigs",
      summary: "Caption packs, subtitle files, or 3–5 edited clips for a creator's week.",
      payUsdLow: 5,
      payUsdHigh: 25,
      minutes: 50,
      riskFlags: ["geo-check"],
      requirements: ["CapCut or similar", "Fast turnaround on feedback"],
      howTo: ["Lead with turnaround time", "Show one 15-second sample edit"],
      sourceLabel: "Fiverr",
      sourceUrl: "https://www.fiverr.com/categories/video-animation",
    }),
    catalogTask({
      kind: "crypto",
      title: "Galxe / Zealy quest campaigns (official projects)",
      project: "Quest platforms",
      summary:
        "Public on-chain and social quests from official projects. Some convert to real drops; many pay in points only.",
      payUsdLow: 1,
      payUsdHigh: 20,
      minutes: 30,
      riskFlags: ["unverified-pay", "points-only", "geo-check"],
      requirements: ["Your own wallet address (public only)", "Your own social accounts"],
      howTo: [
        "Only official project pages — verify the domain",
        "Screenshot every completed step",
        "Never pay to join a quest",
      ],
      sourceLabel: "Galxe",
      sourceUrl: "https://www.galxe.com/quests",
    }),
    catalogTask({
      kind: "crypto",
      title: "Testnet bounty programs (docs, testing, feedback)",
      project: "Project Discord/forums",
      summary:
        "Testing and feedback bounties: find a bug, write docs, or file quality feedback reports.",
      payUsdLow: 5,
      payUsdHigh: 50,
      minutes: 60,
      riskFlags: ["unverified-pay", "points-only"],
      requirements: ["Structured bug reports", "Screenshots + repro steps"],
      howTo: ["Quality reports stand out — most entries are noise", "Keep a report template ready"],
      sourceLabel: "Project bounty boards",
      sourceUrl: "https://github.com/topics/bounty",
    }),
    catalogTask({
      kind: "microtask",
      title: "User-testing recordings and app feedback",
      project: "User-testing marketplaces",
      summary: "Record honest 5–15 minute feedback on apps/sites. Pays per completed test.",
      payUsdLow: 5,
      payUsdHigh: 15,
      minutes: 20,
      riskFlags: ["geo-check", "unverified-pay"],
      requirements: ["Microphone", "Quiet space", "Clear spoken feedback"],
      howTo: [
        "Qualify for tests fast — they fill in minutes",
        "Speak your thought process out loud",
      ],
      sourceLabel: "User-testing marketplaces",
      sourceUrl: "https://www.usertesting.com/get-paid-to-test",
    }),
    catalogTask({
      kind: "microtask",
      title: "Micro-task marketplace batches (signups, tests, research)",
      project: "SproutGigs / Microworkers style",
      summary:
        "Small paid tasks that stack: app tests, research, signups. Low pay per task; volume is the game.",
      payUsdLow: 0.1,
      payUsdHigh: 2,
      minutes: 10,
      riskFlags: ["ban-risk", "tos-risk", "geo-check", "unverified-pay"],
      requirements: ["One verified account per marketplace", "Proof screenshots for every task"],
      howTo: [
        "One account only — multi-accounting gets people banned",
        "Skip anything asking for a deposit",
        "Batch similar tasks to cut switching time",
      ],
      sourceLabel: "SproutGigs",
      sourceUrl: "https://sproutgigs.com/",
    }),
    catalogTask({
      kind: "microtask",
      title: "Paid engagement tasks (like / follow / comment)",
      project: "GPT micro-task listings",
      summary:
        "The 'like posts and earn' category. It exists and it pays pennies — and it is the highest ban-risk work on this board.",
      payUsdLow: 0.05,
      payUsdHigh: 0.5,
      minutes: 5,
      riskFlags: ["tos-risk", "ban-risk", "geo-check", "unverified-pay"],
      requirements: ["Your own real account", "Manual actions only"],
      howTo: [
        "Understand the risk first: selling engagement breaks platform ToS and accounts get suspended",
        "Never use bots or fake accounts — that's where real trouble starts",
        "Cap your daily volume; treat it as pocket change, not income",
      ],
      sourceLabel: "GPT marketplaces",
      sourceUrl: "https://sproutgigs.com/",
    }),
    catalogTask({
      kind: "product",
      title: "Sell a template, prompt pack, or tool script",
      project: "Gumroad / Ko-fi / itch.io",
      summary:
        "Package something you've already made (a sheet, a script, a prompt pack) and sell it repeatedly.",
      payUsdLow: 2,
      payUsdHigh: 20,
      minutes: 90,
      riskFlags: ["unverified-pay"],
      requirements: ["One genuinely useful deliverable", "A short usage guide"],
      howTo: [
        "Price $2–7 to start; raise after reviews",
        "Screenshots of the real output sell better than adjectives",
      ],
      sourceLabel: "Gumroad",
      sourceUrl: "https://gumroad.com/discover",
    }),
    catalogTask({
      kind: "crypto",
      title: "Documentation typo / translation bounties",
      project: "Open-source project repos",
      summary: "The lowest-drama crypto work: fix docs, translate pages, improve examples.",
      payUsdLow: 5,
      payUsdHigh: 40,
      minutes: 45,
      riskFlags: ["unverified-pay"],
      requirements: ["Good written English or a second language", "Git basics"],
      howTo: ["Search repos for 'bounty' + 'documentation' labels", "Small PRs merge fastest"],
      sourceLabel: "GitHub",
      sourceUrl: "https://github.com/search?q=label%3Abounty+documentation&type=issues",
    }),
  ];
}
