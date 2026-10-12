export type JobStatus = "awaiting" | "working" | "ready" | "done" | "declined";
export type JobKind = "airdrop" | "giveaway" | "task";

export type AgentJob = {
  id: string;
  sourceKey: string;
  title: string;
  project: string;
  kind: JobKind;
  chain: string;
  reward: string;
  summary: string;
  sourceUrl: string | null;
  status: JobStatus;
  createdAt: string;
  approvedAt: string | null;
  finishedAt: string | null;
  plan: string[];
  workNote: string;
};

export const JOBS_STORE_KEY = "chainscout.jobs.v1";

export const STATUS_LABEL: Record<JobStatus, string> = {
  awaiting: "Needs your OK",
  working: "Working on it",
  ready: "Ready for you",
  done: "Completed",
  declined: "Passed",
};

export const KIND_LABEL: Record<JobKind, string> = {
  airdrop: "Airdrop task",
  giveaway: "Giveaway task",
  task: "Crypto task",
};

export const WORK_PHASES = [
  "Reading the official rules…",
  "Checking eligibility and deadlines…",
  "Writing your step-by-step checklist…",
];

function newJobId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `j-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildPlan(
  job: Pick<AgentJob, "kind" | "project" | "chain" | "sourceUrl">,
): string[] {
  const sourceStep = job.sourceUrl
    ? `Verify the official announcement page before anything else: ${job.sourceUrl}`
    : `Find ${job.project}'s official announcement page and bookmark it before anything else.`;
  const base = [
    sourceStep,
    "Confirm eligibility from the official rules (wallet age, region, previous participation).",
    `List every public task with its deadline${job.chain && job.chain !== "Not specified" ? ` on ${job.chain}` : ""}.`,
    "Flag scam red flags to watch: lookalike domains, DMs, upfront fees, blind approvals.",
    "Prepare your claim-day checklist: official link only, small test transaction first, record the payout in the Earnings log.",
  ];
  if (job.kind === "giveaway") {
    base.splice(
      3,
      0,
      "Check the giveaway rules for any purchase requirement — if they ask for a payment to unlock a prize, stop and report it as a scam.",
    );
  }
  return base;
}

export function isValidJob(value: unknown): value is AgentJob {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AgentJob>;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    item.title.trim().length > 0 &&
    typeof item.status === "string" &&
    item.status in STATUS_LABEL &&
    Array.isArray(item.plan)
  );
}

export function loadJobs(): AgentJob[] {
  try {
    const raw = localStorage.getItem(JOBS_STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, 40)
      .map((item): AgentJob | null => {
        if (!isValidJob(item)) return null;
        return {
          id: item.id,
          sourceKey: typeof item.sourceKey === "string" ? item.sourceKey : item.id,
          title: item.title.trim().slice(0, 120),
          project: (typeof item.project === "string" ? item.project : "").trim().slice(0, 80),
          kind: item.kind ?? "task",
          chain: (typeof item.chain === "string" ? item.chain : "Not specified").slice(0, 48),
          reward: (typeof item.reward === "string" ? item.reward : "Not disclosed").slice(0, 80),
          summary: (typeof item.summary === "string" ? item.summary : "").trim().slice(0, 280),
          sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl.slice(0, 500) : null,
          status: item.status,
          createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
          approvedAt: typeof item.approvedAt === "string" ? item.approvedAt : null,
          finishedAt: typeof item.finishedAt === "string" ? item.finishedAt : null,
          plan: item.plan.filter((step): step is string => typeof step === "string").slice(0, 8),
          workNote:
            typeof item.workNote === "string"
              ? item.workNote
              : "Preparation work only — ChainScout never connects your wallet or signs anything.",
        };
      })
      .filter((item): item is AgentJob => item !== null);
  } catch {
    return [];
  }
}

export function saveJobs(jobs: AgentJob[]): void {
  localStorage.setItem(JOBS_STORE_KEY, JSON.stringify(jobs.slice(0, 40)));
}

export function updateJob(id: string, patch: Partial<AgentJob>): void {
  const next = loadJobs().map((job) => (job.id === id ? { ...job, ...patch } : job));
  saveJobs(next);
}

export type CampaignLike = {
  id: string;
  project: string;
  title: string;
  kind: "airdrop" | "giveaway";
  chain: string;
  reward: string;
  summary: string;
  sourceUrl: string;
};

/** Create jobs for campaigns that don't have one yet. Returns newly created jobs. */
export function appendJobsFromCampaigns(campaigns: CampaignLike[]): AgentJob[] {
  const existing = loadJobs();
  const known = new Set(existing.map((job) => job.sourceKey));
  const created: AgentJob[] = [];
  for (const campaign of campaigns) {
    const sourceKey = `campaign:${campaign.id}`;
    if (known.has(sourceKey)) continue;
    const job: AgentJob = {
      id: newJobId(),
      sourceKey,
      title: campaign.title.slice(0, 120),
      project: campaign.project.slice(0, 80),
      kind: campaign.kind,
      chain: campaign.chain.slice(0, 48),
      reward: campaign.reward.slice(0, 80),
      summary: campaign.summary.slice(0, 280),
      sourceUrl: campaign.sourceUrl.slice(0, 500),
      status: "awaiting",
      createdAt: new Date().toISOString(),
      approvedAt: null,
      finishedAt: null,
      plan: [],
      workNote: "",
    };
    known.add(sourceKey);
    created.push(job);
  }
  if (created.length > 0) saveJobs([...created, ...existing]);
  return created;
}

export function createManualJob(input: {
  title: string;
  link?: string;
  reward?: string;
  summary?: string;
}): AgentJob {
  const job: AgentJob = {
    id: newJobId(),
    sourceKey: `manual:${newJobId()}`,
    title: input.title.trim().slice(0, 120),
    project: "Your task",
    kind: "task",
    chain: "Not specified",
    reward: input.reward?.trim().slice(0, 80) || "Not disclosed",
    summary: input.summary?.trim().slice(0, 280) || "Task you added for the agent to prepare.",
    sourceUrl: input.link?.trim().startsWith("https://") ? input.link.trim().slice(0, 500) : null,
    status: "awaiting",
    createdAt: new Date().toISOString(),
    approvedAt: null,
    finishedAt: null,
    plan: [],
    workNote: "",
  };
  saveJobs([job, ...loadJobs()]);
  return job;
}

export function countAwaiting(jobs: AgentJob[]): number {
  return jobs.filter((job) => job.status === "awaiting").length;
}
