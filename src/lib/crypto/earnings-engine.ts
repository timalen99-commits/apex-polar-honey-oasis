export type PositionMethod = "stable-yield" | "lp" | "staking" | "other";

export type EnginePosition = {
  id: string;
  label: string;
  method: PositionMethod;
  capitalUsd: number;
  apy: number;
  startedAt: string;
  note: string;
};

export const POSITIONS_STORE_KEY = "chainscout.positions.v1";

export const METHOD_LABEL: Record<PositionMethod, string> = {
  "stable-yield": "Stablecoin yield",
  lp: "Liquidity fees",
  staking: "Staking",
  other: "Other yield",
};

/** 365.25 days — matches how DeFi APYs are conventionally quoted. */
export const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
export const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;

export function accruedUsd(
  position: Pick<EnginePosition, "capitalUsd" | "apy" | "startedAt">,
  now: number,
): number {
  const started = Date.parse(position.startedAt);
  if (!Number.isFinite(started)) return 0;
  const elapsedMs = Math.max(0, now - started);
  return position.capitalUsd * (position.apy / 100) * (elapsedMs / MS_PER_YEAR);
}

export function perSecondUsd(position: Pick<EnginePosition, "capitalUsd" | "apy">): number {
  return (position.capitalUsd * (position.apy / 100)) / SECONDS_PER_YEAR;
}

export function projections(position: Pick<EnginePosition, "capitalUsd" | "apy">) {
  const perSecond = perSecondUsd(position);
  return {
    day: perSecond * 60 * 60 * 24,
    week: perSecond * 60 * 60 * 24 * 7,
    month: perSecond * 60 * 60 * 24 * 30.4,
    year: position.capitalUsd * (position.apy / 100),
  };
}

function isValidPosition(value: unknown): value is EnginePosition {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<EnginePosition>;
  const capital = Number(item.capitalUsd);
  const apy = Number(item.apy);
  return (
    typeof item.id === "string" &&
    typeof item.label === "string" &&
    item.label.trim().length > 0 &&
    Number.isFinite(capital) &&
    capital >= 0 &&
    Number.isFinite(apy) &&
    apy >= 0 &&
    apy <= 1000 &&
    typeof item.startedAt === "string" &&
    Number.isFinite(Date.parse(item.startedAt))
  );
}

export function loadPositions(): EnginePosition[] {
  try {
    const raw = localStorage.getItem(POSITIONS_STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, 40)
      .map((item): EnginePosition | null => {
        if (!isValidPosition(item)) return null;
        return {
          id: item.id,
          label: item.label.trim().slice(0, 80),
          method: item.method ?? "other",
          capitalUsd: Math.round(Number(item.capitalUsd) * 100) / 100,
          apy: Math.round(Number(item.apy) * 100) / 100,
          startedAt: item.startedAt,
          note: typeof item.note === "string" ? item.note.trim().slice(0, 160) : "",
        };
      })
      .filter((item): item is EnginePosition => item !== null);
  } catch {
    return [];
  }
}

export function savePositions(positions: EnginePosition[]): void {
  localStorage.setItem(POSITIONS_STORE_KEY, JSON.stringify(positions));
}

export function newPositionId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs === 0) return "$0.00";
  if (abs < 0.01) return `$${value.toFixed(6)}`;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: abs >= 1000 ? 0 : 2,
  }).format(value);
}

export type MicroStation = {
  id: string;
  name: string;
  kind: "free" | "time" | "capital";
  payout: string;
  effort: string;
  how: string;
  paysVia: string;
  note: string;
};

export const STATION_KIND_LABEL: Record<MicroStation["kind"], string> = {
  free: "Free to start",
  time: "Paid for your time",
  capital: "Needs capital",
};

/**
 * Honest, long-running micro-earning categories. Payout ranges are typical
 * reported amounts, not promises; every program varies by country and campaign.
 */
export const MICRO_STATIONS: MicroStation[] = [
  {
    id: "stable-engine",
    name: "Stable yield engine (this app)",
    kind: "capital",
    payout: "~$0.01–$0.02/day per $100 at 4–8% APY",
    effort: "Set once, ~10 min/week",
    how: "Park USDC/USDT in an established lending market (Aave/Morpho-style). Interest accrues every second and you withdraw whenever you want.",
    paysVia: "Withdraw from protocol → exchange → bank.",
    note: "The most reliable 'little something' on this list — small but real, passive, and withdrawable. Rates are variable.",
  },
  {
    id: "learn-earn",
    name: "Learn & Earn quizzes",
    kind: "free",
    payout: "$1–$10 per completed quiz when campaigns run",
    effort: "5–15 min per quiz",
    how: "Major exchanges run recurring education rewards (Coinbase Learn & Earn-style). Watch short lessons, answer a quiz, tokens land in your account.",
    paysVia: "Exchange balance → convert → withdraw.",
    note: "Campaigns come and go and availability varies by country — check your exchange's rewards section.",
  },
  {
    id: "user-testing",
    name: "Paid user testing & surveys",
    kind: "time",
    payout: "$5–$60 per test session; $1–$5 per survey",
    effort: "10–60 min per session",
    how: "Platforms like UserTesting, Prolific, or Respondent pay for feedback on apps/websites or academic studies. Apply to studies; get paid per completed session.",
    paysVia: "PayPal, bank transfer, or gift cards depending on platform.",
    note: "Genuinely one of the fastest first dollars online. Check availability and payout methods for Nigeria before investing time in profiles.",
  },
  {
    id: "ai-tasks",
    name: "AI training micro-tasks",
    kind: "time",
    payout: "Often $5–$20+/hour equivalent on rated projects",
    effort: "Flexible blocks of 30+ min",
    how: "Data annotation, rating, and RLHF task platforms (DataAnnotation, Outlier, Remo-style) pay for helping train AI models. Rates and hiring waves change frequently.",
    paysVia: "PayPal, bank transfer, or USDC depending on platform.",
    note: "This is real paid work — the most consistent 'little something' with zero capital if you pass their assessments.",
  },
  {
    id: "crypto-cashback",
    name: "Crypto cashback on shopping",
    kind: "free",
    payout: "1–10% back in BTC on purchases you already make",
    effort: "Install once, shop normally",
    how: "Browser extensions and cards (Lolli, Fold-style) return a slice of everyday spending as sats. Earn only on money you were spending anyway.",
    paysVia: "Accumulated BTC → withdraw or spend.",
    note: "Never shop more just to earn cashback — that defeats the point.",
  },
  {
    id: "attention-rewards",
    name: "Browser attention rewards",
    kind: "free",
    payout: "Typically $1–$5/month in BAT",
    effort: "Zero — browse as usual",
    how: "Brave Rewards-style opt-in ads share ad revenue with you in tokens. Privacy-respecting: ad matching happens on-device.",
    paysVia: "BAT to your wallet or exchange when above minimums.",
    note: "Small but literally passive. Country availability for ad campaigns varies.",
  },
  {
    id: "quests",
    name: "Quest & testnet campaigns",
    kind: "free",
    payout: "$50–$5,000 lumpy, when a program pays",
    effort: "20–60 min/day",
    how: "The airdrop/points track from the Best Setup playbook — the highest-upside free option, but payouts are never guaranteed or regular.",
    paysVia: "Tokens to wallet → convert → off-ramp.",
    note: "Pair with the daily scan automation so you never miss a claim window.",
  },
  {
    id: "bounties",
    name: "Skill bounties & freelance",
    kind: "time",
    payout: "$50 per small task up to $10,000+ for security bounties",
    effort: "Project-based",
    how: "Content, design, dev, or security bounties (Immunefi-style boards, community programs). Get paid per delivered work — the closest thing to guaranteed money.",
    paysVia: "USDC/USDT or fiat to your account; agree terms first.",
    note: "If you have any marketable skill, this beats every passive option on this list for actual earnings.",
  },
];
