import { todayKey } from "./goals.ts";

/**
 * Wallet action policy — the "hard limits" layer.
 *
 * Every wallet action the agent prepares is evaluated against the user's own
 * caps BEFORE it can be approved, with unlimited token approvals blocked by
 * default. Nothing here signs anything; this module only decides what is safe
 * to even offer for the wallet popup.
 */

export const WALLET_STORE_KEY = "chainscout.wallet.v1";

export type WalletLimits = {
  /** Hard cap per transaction, USD estimate entered by the user. */
  perTxUsd: number;
  /** Hard cap per rolling local day, USD estimate. */
  dailyUsd: number;
  /** Off by default — unlimited ERC-20 approvals are the #1 drainer vector. */
  allowUnlimitedApprovals: boolean;
};

export const DEFAULT_WALLET_LIMITS: WalletLimits = {
  perTxUsd: 50,
  dailyUsd: 200,
  allowUnlimitedApprovals: false,
};

export type WalletActionKind = "sign-message" | "send-native" | "send-token" | "contract-call";

export type WalletAction = {
  id: string;
  kind: WalletActionKind;
  title: string;
  note: string;
  chainId: number | null;
  to: string | null;
  /** Native value in wei, decimal string. */
  valueWei: string;
  /** User's own USD estimate for cap accounting (never a price quote). */
  valueUsdEstimate: number | null;
  data: string;
  message: string;
  createdAt: string;
  status: "proposed" | "submitted" | "rejected" | "failed" | "blocked";
  result: string;
};

export type WalletStore = {
  limits: WalletLimits;
  actions: WalletAction[];
  lastConnectedAt: string | null;
};

export function defaultWalletStore(): WalletStore {
  return { limits: { ...DEFAULT_WALLET_LIMITS }, actions: [], lastConnectedAt: null };
}

export function loadWalletStore(): WalletStore {
  try {
    const raw = localStorage.getItem(WALLET_STORE_KEY);
    if (!raw) return defaultWalletStore();
    const parsed = JSON.parse(raw) as Partial<WalletStore>;
    return {
      limits: { ...DEFAULT_WALLET_LIMITS, ...(parsed.limits ?? {}) },
      actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 60) : [],
      lastConnectedAt: typeof parsed.lastConnectedAt === "string" ? parsed.lastConnectedAt : null,
    };
  } catch {
    return defaultWalletStore();
  }
}

export function saveWalletStore(store: WalletStore): void {
  try {
    localStorage.setItem(
      WALLET_STORE_KEY,
      JSON.stringify({ ...store, actions: store.actions.slice(0, 60) }),
    );
  } catch {
    // Quota errors: in-memory store still works this session.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("chainscout:goals"));
  }
}

export function newActionId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `w-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ----------------------------- Calldata tools ----------------------------- */

const SELECTORS: Record<string, string> = {
  "0xa9059cbb": "erc20-transfer",
  "0x095ea7b3": "erc20-approve",
  "0x23b872dd": "erc20-transferFrom",
};

export function decodeErc20Call(data: string): {
  selector: string;
  name: string;
  to: string | null;
  amount: bigint | null;
} | null {
  const clean = String(data ?? "")
    .trim()
    .toLowerCase();
  if (!clean.startsWith("0x") || clean.length < 10) return null;
  const selector = clean.slice(0, 10);
  const name = SELECTORS[selector];
  if (!name) return null;
  let to: string | null = null;
  let amount: bigint | null = null;
  try {
    if (clean.length >= 74) {
      to = `0x${clean.slice(34, 74)}`;
      if (clean.length >= 138) amount = BigInt(`0x${clean.slice(74, 138)}`);
    }
  } catch {
    // Partial decode is fine — the policy only needs what it can read.
  }
  return { selector, name, to, amount };
}

/** Unlimited approvals (max uint256 / max uint96+) are the classic drainer trap. */
export function isUnlimitedApproval(amount: bigint | null): boolean {
  if (amount === null) return true; // Unreadable amount → treat with maximum suspicion.
  return amount >= 2n ** 96n;
}

/* ------------------------------ SIWE builder ------------------------------ */

export type SiweInput = {
  domain: string;
  address: string;
  uri: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  statement?: string;
};

/** EIP-4361 Sign-In With Ethereum message — signed only via the wallet popup. */
export function buildSiweMessage(input: SiweInput): string {
  const statement =
    input.statement?.trim() ||
    "Sign in to ChainScout. This is a free login signature — it costs nothing and sends no transaction.";
  return [
    `${input.domain} wants you to sign in with your Ethereum account:`,
    input.address,
    "",
    statement,
    "",
    `URI: ${input.uri}`,
    "Version: 1",
    `Chain ID: ${input.chainId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
  ].join("\n");
}

export function newSiweNonce(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/* --------------------------- Policy evaluation --------------------------- */

export type PolicyResult = {
  level: "ok" | "warn" | "block";
  warnings: string[];
  blocks: string[];
};

export function spentUsdToday(actions: WalletAction[], day = todayKey()): number {
  return actions
    .filter(
      (a) =>
        a.createdAt.slice(0, 10) === day && (a.status === "submitted" || a.status === "failed"),
    )
    .reduce((sum, a) => sum + (a.valueUsdEstimate ?? 0), 0);
}

export function evaluateAction(
  action: WalletAction,
  limits: WalletLimits,
  spentToday = 0,
): PolicyResult {
  const warnings: string[] = [];
  const blocks: string[] = [];
  const usd = action.valueUsdEstimate ?? 0;

  if (action.kind !== "sign-message") {
    if (!action.to || !/^0x[0-9a-fA-F]{40}$/.test(action.to)) {
      blocks.push(
        "Recipient must be a full 0x…40-hex address. A wrong address loses funds forever.",
      );
    }
    if (usd > limits.perTxUsd) {
      blocks.push(
        `This action's $${usd} estimate is over your per-transaction cap of $${limits.perTxUsd}. Raise the cap deliberately in Safety limits if this is really intended.`,
      );
    }
    if (spentToday + usd > limits.dailyUsd) {
      blocks.push(
        `Sending this would push today's total past your $${limits.dailyUsd} daily cap ($${spentToday} already used).`,
      );
    }

    const decoded = decodeErc20Call(action.data);
    if (decoded?.name === "erc20-approve") {
      if (isUnlimitedApproval(decoded.amount)) {
        if (!limits.allowUnlimitedApprovals) {
          blocks.push(
            "This is an UNLIMITED token approval — it lets the contract move your entire token balance forever. ChainScout blocks these by default; revoke after use if you truly need one elsewhere.",
          );
        } else {
          warnings.push(
            "Unlimited token approval (you allowed this in Safety limits). Revoke it after use.",
          );
        }
      } else {
        warnings.push(
          "Token approval — the contract can move up to the approved amount. Revoke it when you're done.",
        );
      }
    } else if (decoded === null && action.data && action.data !== "0x") {
      warnings.push(
        "Unrecognized contract calldata — you are signing blind. Only proceed if you built this data yourself from a verified source (e.g. the contract's verified Write page).",
      );
    }

    if (usd > 0 && usd >= limits.perTxUsd * 0.5) {
      warnings.push(
        "Large action — double-check the recipient and the contract on a block explorer first.",
      );
    }
    if (action.valueUsdEstimate === null) {
      warnings.push(
        "No USD estimate set — your caps can't account for it. Add one to keep the limits meaningful.",
      );
    }
  }

  return {
    level: blocks.length > 0 ? "block" : warnings.length > 0 ? "warn" : "ok",
    warnings,
    blocks,
  };
}

/* ---------------------------- Action factories ---------------------------- */

export function makeNativeSend(input: {
  from: string;
  to: string;
  amountEth: number;
  usdEstimate: number | null;
  chainId: number | null;
}): WalletAction {
  const wei = BigInt(Math.round(input.amountEth * 1e6)) * 10n ** 12n; // 6-decimal precision → wei
  return {
    id: newActionId(),
    kind: "send-native",
    title: `Send ${input.amountEth} native token`,
    note: "Prepared by the agent. Nothing is sent until you approve here AND confirm in your wallet.",
    chainId: input.chainId,
    to: input.to,
    valueWei: wei.toString(),
    valueUsdEstimate: input.usdEstimate,
    data: "0x",
    message: "",
    createdAt: new Date().toISOString(),
    status: "proposed",
    result: "",
  };
}

export function makeTokenTransfer(input: {
  tokenAddress: string;
  to: string;
  amount: number;
  decimals: number;
  symbol: string;
  usdEstimate: number | null;
  chainId: number | null;
}): WalletAction {
  const scaled =
    BigInt(Math.round(input.amount * 1e6)) * 10n ** BigInt(Math.max(0, input.decimals - 6));
  const toWord = input.to.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const amountWord = scaled.toString(16).padStart(64, "0");
  return {
    id: newActionId(),
    kind: "send-token",
    title: `Send ${input.amount} ${input.symbol || "token"}`,
    note: "ERC-20 transfer prepared by the agent. Approve here, then confirm in your wallet.",
    chainId: input.chainId,
    to: input.tokenAddress,
    valueWei: "0",
    valueUsdEstimate: input.usdEstimate,
    data: `0xa9059cbb${toWord}${amountWord}`,
    message: "",
    createdAt: new Date().toISOString(),
    status: "proposed",
    result: "",
  };
}

export function makeContractCall(input: {
  to: string;
  data: string;
  valueEth: number;
  usdEstimate: number | null;
  chainId: number | null;
  title: string;
}): WalletAction {
  const wei = BigInt(Math.round(input.valueEth * 1e6)) * 10n ** 12n;
  return {
    id: newActionId(),
    kind: "contract-call",
    title: input.title,
    note: "Contract interaction prepared by the agent (claims, withdrawals, or swaps use this path).",
    chainId: input.chainId,
    to: input.to,
    valueWei: wei.toString(),
    valueUsdEstimate: input.usdEstimate,
    data: input.data.trim() || "0x",
    message: "",
    createdAt: new Date().toISOString(),
    status: "proposed",
    result: "",
  };
}

export function makeSignMessage(input: {
  message: string;
  chainId: number | null;
  title: string;
}): WalletAction {
  return {
    id: newActionId(),
    kind: "sign-message",
    title: input.title,
    note: "Message signature only — no transaction, no gas, no funds move.",
    chainId: input.chainId,
    to: null,
    valueWei: "0",
    valueUsdEstimate: 0,
    data: "0x",
    message: input.message,
    createdAt: new Date().toISOString(),
    status: "proposed",
    result: "",
  };
}
