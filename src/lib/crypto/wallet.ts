/**
 * Wallet layer — EIP-1193 injected providers only (MetaMask, Rabby, Coinbase
 * Wallet, Trust, …). The app NEVER holds keys: every signature and every
 * transaction goes through the user's own wallet popup. This module is a thin,
 * auditable wrapper — no hidden requests, no stored secrets.
 */

export type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: never[]) => void): void;
  removeListener?(event: string, handler: (...args: never[]) => void): void;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export type WalletConnection = {
  address: string;
  chainId: number;
};

export type WalletErrorCode = "rejected" | "no-provider" | "unauthorized" | "failed";

export function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

export function shortAddress(address: string): string {
  const value = String(address ?? "").trim();
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function parseWalletError(error: unknown): { code: WalletErrorCode; message: string } {
  const anyErr = (error ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof anyErr.code === "number" ? anyErr.code : null;
  const message = typeof anyErr.message === "string" ? anyErr.message : "";
  if (code === 4001 || /user (rejected|denied|canceled)/i.test(message)) {
    return {
      code: "rejected",
      message: "You rejected the request in your wallet — nothing was signed or sent.",
    };
  }
  if (code === 4100 || /unauthorized|not authorized/i.test(message)) {
    return {
      code: "unauthorized",
      message: "Your wallet has not authorized this site. Connect and try again.",
    };
  }
  return {
    code: "failed",
    message: message.replace(/\s+/g, " ").trim().slice(0, 180) || "The wallet request failed.",
  };
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = value.startsWith("0x") ? Number.parseInt(value, 16) : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function connectWallet(): Promise<WalletConnection> {
  const provider = getInjectedProvider();
  if (!provider) {
    throw new Error(
      "No wallet detected in this browser. Install MetaMask or another EVM wallet, then reload.",
    );
  }
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  const chainHex = (await provider.request({ method: "eth_chainId" })) as string;
  const address = Array.isArray(accounts) && accounts[0] ? accounts[0] : "";
  if (!address) throw new Error("Your wallet returned no account.");
  return { address, chainId: toNumber(chainHex) };
}

export async function currentConnection(): Promise<WalletConnection | null> {
  const provider = getInjectedProvider();
  if (!provider) return null;
  try {
    const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
    if (!Array.isArray(accounts) || !accounts[0]) return null;
    const chainHex = (await provider.request({ method: "eth_chainId" })) as string;
    return { address: accounts[0], chainId: toNumber(chainHex) };
  } catch {
    return null;
  }
}

export async function walletBalanceWei(address: string): Promise<string> {
  const provider = getInjectedProvider();
  if (!provider) throw new Error("No wallet detected.");
  const result = (await provider.request({
    method: "eth_getBalance",
    params: [address, "latest"],
  })) as string;
  return String(result ?? "0x0");
}

export function formatNative(hexWei: string, decimals = 6): string {
  try {
    const wei = BigInt(hexWei);
    const base = 10n ** 18n;
    const whole = wei / base;
    const frac = wei % base;
    const fracStr = frac.toString().padStart(18, "0").slice(0, decimals).replace(/0+$/, "");
    return fracStr ? `${whole}.${fracStr}` : whole.toString();
  } catch {
    return "0";
  }
}

/** EIP-191 personal_sign — the wallet popup is the only place a signature happens. */
export async function signMessage(address: string, message: string): Promise<string> {
  const provider = getInjectedProvider();
  if (!provider) throw new Error("No wallet detected.");
  const hex =
    "0x" +
    Array.from(new TextEncoder().encode(message))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  const signature = (await provider.request({
    method: "personal_sign",
    params: [hex, address],
  })) as string;
  return String(signature ?? "");
}

export type WalletTx = {
  from: string;
  to: string;
  valueHex: string;
  data: string;
};

/** eth_sendTransaction — the wallet popup is the only place a transaction is sent. */
export async function sendTransaction(tx: WalletTx): Promise<string> {
  const provider = getInjectedProvider();
  if (!provider) throw new Error("No wallet detected.");
  const hash = (await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: tx.from,
        to: tx.to,
        value: tx.valueHex,
        data: tx.data && tx.data !== "0x" ? tx.data : undefined,
      },
    ],
  })) as string;
  return String(hash ?? "");
}

export const CHAIN_LABELS: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  56: "BNB Chain",
  100: "Gnosis",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum",
  43114: "Avalanche",
  80001: "Polygon Mumbai",
  11155111: "Sepolia",
};

export function chainLabel(chainId: number | null): string {
  if (!chainId) return "Unknown chain";
  return CHAIN_LABELS[chainId] ?? `Chain #${chainId}`;
}

export function explorerTxUrl(chainId: number | null, hash: string): string | null {
  if (!hash || !hash.startsWith("0x")) return null;
  const base =
    chainId === 8453
      ? "https://basescan.org"
      : chainId === 137
        ? "https://polygonscan.com"
        : chainId === 42161
          ? "https://arbiscan.io"
          : chainId === 10
            ? "https://optimistic.etherscan.io"
            : chainId === 56
              ? "https://bscscan.com"
              : "https://etherscan.io";
  return `${base}/tx/${hash}`;
}
