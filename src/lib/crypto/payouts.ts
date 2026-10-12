import type { EarningEntry } from "./earnings-store.ts";

/**
 * Payout rails — how money actually leaves the internet and lands with you.
 *
 * Rails are tracked alongside the earnings log so "earned" and "withdrawn"
 * stop being the same blurry thing. Notes are practical realities (fees,
 * KYC, resale haircuts), never endorsements; verify current terms yourself.
 */

export type RailId =
  "crypto-usdt" | "crypto-usdc" | "payoneer" | "ng-virtual-usd" | "gift-card" | "bank-ngn";

export type PayoutRail = {
  id: RailId;
  label: string;
  type: "crypto" | "fiat" | "gift";
  summary: string;
  friction: string;
  checklist: string[];
};

export const PAYOUT_RAILS: PayoutRail[] = [
  {
    id: "crypto-usdt",
    label: "USDT (crypto wallet)",
    type: "crypto",
    summary:
      "Tether on a low-fee network (Polygon, Base, Tron). The usual rail for bounties, quests, and international micro-payments.",
    friction:
      "Network fees vary by chain — send a $1 test first. Only ever give out your public address; never a seed phrase.",
    checklist: [
      "Pick the network the payer uses and confirm your wallet supports it",
      "Send/receive a $1 test transfer before the full amount",
      "Screenshot the tx hash and record the fee in your log",
      "Convert via your own exchange/P2P route when you choose — price shop the rate",
    ],
  },
  {
    id: "crypto-usdc",
    label: "USDC (crypto wallet)",
    type: "crypto",
    summary:
      "The regulated-stablecoin rail, commonly on Base/Polygon/Ethereum. Preferred by many freelance and bounty platforms paying on-chain.",
    friction:
      "Ethereum mainnet fees can exceed the payout — prefer L2s (Base, Polygon). Same test-first rule.",
    checklist: [
      "Confirm which chain the payer sends on (USDC exists on several)",
      "Do a $1 test receive first, especially on mainnet",
      "Record tx hashes; keep a simple payout spreadsheet",
    ],
  },
  {
    id: "payoneer",
    label: "Payoneer",
    type: "fiat",
    summary:
      "The classic freelance-marketplace rail (Upwork, Fiverr, and similar can pay out to Payoneer). Receiving from marketplaces is often free; withdrawing to a NG bank has its own fees.",
    friction:
      "Account verification (KYC) takes time — set it up before you need it. Compare Payoneer's withdrawal fee against a NG virtual USD account.",
    checklist: [
      "Finish KYC verification early — payout holds usually come from incomplete accounts",
      "Link and test your NG bank withdrawal with a small amount first",
      "Note the marketplace's own withdrawal fee AND Payoneer's fee separately",
      "Log withdrawals in the earnings log the day they land",
    ],
  },
  {
    id: "ng-virtual-usd",
    label: "NG virtual USD account (Grey / Geegpay-style)",
    type: "fiat",
    summary:
      "Local fintech USD/GBP/EUR virtual accounts that many Nigerian freelancers use to receive international transfers and convert to naira.",
    friction:
      "Providers change terms and licensing status — verify current CBN/regulatory standing and fees before wiring clients there. Start with a small transfer.",
    checklist: [
      "Verify the provider is currently licensed and review this month's fees",
      "Share only the virtual account details the payer needs",
      "Test with a small incoming transfer before quoting the account to big clients",
      "Record the NGN conversion rate you actually got, not the advertised one",
    ],
  },
  {
    id: "gift-card",
    label: "Gift cards",
    type: "gift",
    summary: "Some micro-task and content clients pay in Amazon/iTunes-style cards.",
    friction:
      "Resale loses 10–30% and attracts scammers — only accept cards from direct clients, and never pay 'activation' fees to resellers.",
    checklist: [
      "Only accept cards you can actually use yourself",
      "If reselling, use established platforms and never pay upfront 'fees'",
      "Log the face value AND the realized value separately",
    ],
  },
  {
    id: "bank-ngn",
    label: "NGN bank transfer",
    type: "fiat",
    summary: "Direct naira transfers from local clients or after conversion.",
    friction:
      "The simplest rail locally; for international payers it's usually slower and pricier than USD rails — convert first, then withdraw locally.",
    checklist: [
      "Confirm the account name matches your ID to avoid reversal fees",
      "For large amounts, transfer in batches and keep bank alerts on",
      "Log the amount the moment it lands",
    ],
  },
];

export function railById(id: RailId): PayoutRail {
  return PAYOUT_RAILS.find((r) => r.id === id) ?? PAYOUT_RAILS[0];
}

/** Map a free-text withdrawal method from the earnings log onto a rail. */
export function railForMethod(method: string): RailId | null {
  const value = String(method ?? "").toLowerCase();
  if (!value.trim()) return null;
  if (/usdt|tether|tron|matic|polygon/.test(value)) return "crypto-usdt";
  if (/usdc|base|ethereum|eth|l2/.test(value)) return "crypto-usdc";
  if (/payoneer/.test(value)) return "payoneer";
  if (/grey|geegpay|grey\.co|virtual usd|domiciliary/.test(value)) return "ng-virtual-usd";
  if (/gift|amazon|itunes|steam/.test(value)) return "gift-card";
  if (/bank|gtn|ngn|naira|transfer|gtb|zenith|access|uba|opay|kuda/.test(value)) return "bank-ngn";
  if (/crypto|wallet|0x/.test(value)) return "crypto-usdt";
  return null;
}

export type RailSummary = {
  id: RailId;
  receivedUsd: number;
  withdrawnUsd: number;
  stillPendingUsd: number;
  entries: number;
};

export function railSummaries(entries: EarningEntry[]): RailSummary[] {
  const map = new Map<RailId, RailSummary>();
  for (const entry of entries) {
    const rail = railForMethod(entry.withdrawalMethod);
    if (!rail) continue;
    const row = map.get(rail) ?? {
      id: rail,
      receivedUsd: 0,
      withdrawnUsd: 0,
      stillPendingUsd: 0,
      entries: 0,
    };
    row.entries += 1;
    const amount = Number.isFinite(entry.amountUsd) ? entry.amountUsd : 0;
    if (entry.status === "received") row.receivedUsd += amount;
    else if (entry.status === "withdrawn") row.withdrawnUsd += amount;
    else row.stillPendingUsd += amount;
    map.set(rail, row);
  }
  return [...map.values()].sort(
    (a, b) => b.receivedUsd + b.withdrawnUsd - (a.receivedUsd + a.withdrawnUsd),
  );
}

export function unmatchedRailCount(entries: EarningEntry[]): number {
  return entries.filter((e) => e.withdrawalMethod.trim() && !railForMethod(e.withdrawalMethod))
    .length;
}
