export type EntryStatus = "pending" | "received" | "withdrawn";
export type EntryMethod =
  "airdrop" | "points" | "liquidity" | "staking" | "yield" | "bounty" | "other";

export type EarningEntry = {
  id: string;
  date: string;
  source: string;
  method: EntryMethod;
  asset: string;
  amountUsd: number;
  status: EntryStatus;
  withdrawalMethod: string;
  note: string;
};

export const EARNINGS_STORE_KEY = "chainscout.earnings.v1";
export const STATUS_ORDER: EntryStatus[] = ["pending", "received", "withdrawn"];

export const STATUS_LABEL: Record<EntryStatus, string> = {
  pending: "Pending claim",
  received: "Received",
  withdrawn: "Withdrawn",
};

export const METHOD_LABEL: Record<EntryMethod, string> = {
  airdrop: "Airdrop",
  points: "Points / testnet",
  liquidity: "Liquidity",
  staking: "Staking",
  yield: "Yield interest",
  bounty: "Bounty / work",
  other: "Other",
};

export function newEntryId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadEarningEntries(): EarningEntry[] {
  try {
    const raw = localStorage.getItem(EARNINGS_STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, 200)
      .map((item): EarningEntry | null => {
        if (!item || typeof item !== "object") return null;
        const entry = item as Partial<EarningEntry>;
        const amount = Number(entry.amountUsd);
        if (
          typeof entry.id !== "string" ||
          typeof entry.source !== "string" ||
          !entry.source.trim() ||
          !Number.isFinite(amount) ||
          amount < 0 ||
          (entry.status !== "pending" &&
            entry.status !== "received" &&
            entry.status !== "withdrawn")
        ) {
          return null;
        }
        return {
          id: entry.id,
          date: typeof entry.date === "string" && entry.date ? entry.date.slice(0, 10) : "",
          source: entry.source.trim().slice(0, 120),
          method: entry.method ?? "other",
          asset: typeof entry.asset === "string" ? entry.asset.trim().slice(0, 24) : "",
          amountUsd: Math.round(amount * 100) / 100,
          status: entry.status,
          withdrawalMethod:
            typeof entry.withdrawalMethod === "string"
              ? entry.withdrawalMethod.trim().slice(0, 80)
              : "",
          note: typeof entry.note === "string" ? entry.note.trim().slice(0, 240) : "",
        };
      })
      .filter((item): item is EarningEntry => item !== null);
  } catch {
    return [];
  }
}

/** Prepend one entry and persist. Returns the saved entry (with id). */
export function appendEarningEntry(
  entry: Omit<EarningEntry, "id"> & { id?: string },
): EarningEntry {
  const saved: EarningEntry = { ...entry, id: entry.id ?? newEntryId() };
  const next = [saved, ...loadEarningEntries()].slice(0, 200);
  localStorage.setItem(EARNINGS_STORE_KEY, JSON.stringify(next));
  return saved;
}

export function writeEarningEntries(entries: EarningEntry[]): void {
  localStorage.setItem(EARNINGS_STORE_KEY, JSON.stringify(entries));
}
