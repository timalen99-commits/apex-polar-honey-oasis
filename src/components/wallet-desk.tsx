import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileSignature,
  Landmark,
  Link2Off,
  LoaderCircle,
  Lock,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Signature,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import {
  chainLabel,
  connectWallet,
  currentConnection,
  explorerTxUrl,
  formatNative,
  parseWalletError,
  sendTransaction,
  shortAddress,
  signMessage,
  walletBalanceWei,
  type WalletConnection,
} from "@/lib/crypto/wallet";
import {
  buildSiweMessage,
  evaluateAction,
  loadWalletStore,
  makeContractCall,
  makeNativeSend,
  makeSignMessage,
  makeTokenTransfer,
  newSiweNonce,
  saveWalletStore,
  spentUsdToday,
  type WalletAction,
  type WalletStore,
} from "@/lib/crypto/wallet-actions";

type ComposerTab = "signin" | "send" | "call";

function fmtUsd(value: number): string {
  return `$${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}`;
}

export function WalletDesk() {
  const [connection, setConnection] = useState<WalletConnection | null>(null);
  const [balance, setBalance] = useState("…");
  const [store, setStore] = useState<WalletStore>(() => loadWalletStore());
  const [tab, setTab] = useState<ComposerTab>("signin");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  // Sign-in composer
  const [siweDomain, setSiweDomain] = useState("chainscout.local");
  // Send composer
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendUsd, setSendUsd] = useState("");
  const [tokenMode, setTokenMode] = useState(false);
  const [tokenAddress, setTokenAddress] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("USDC");
  const [tokenDecimals, setTokenDecimals] = useState("18");
  // Contract composer
  const [callTo, setCallTo] = useState("");
  const [callData, setCallData] = useState("0x");
  const [callValue, setCallValue] = useState("0");
  const [callUsd, setCallUsd] = useState("");
  const [callTitle, setCallTitle] = useState("Contract interaction");

  const persist = useCallback((next: WalletStore) => {
    setStore(next);
    saveWalletStore(next);
  }, []);

  const refreshBalance = useCallback(async (conn: WalletConnection | null) => {
    if (!conn) {
      setBalance("…");
      return;
    }
    try {
      const wei = await walletBalanceWei(conn.address);
      setBalance(formatNative(wei));
    } catch {
      setBalance("?");
    }
  }, []);

  useEffect(() => {
    void currentConnection().then((conn) => {
      setConnection(conn);
      if (conn) {
        persist({ ...loadWalletStore(), lastConnectedAt: new Date().toISOString() });
        void refreshBalance(conn);
      }
    });
  }, [persist, refreshBalance]);

  useEffect(() => {
    if (!notice && !error) return undefined;
    const timer = window.setTimeout(() => {
      setNotice("");
      setError("");
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [notice, error]);

  const spentToday = useMemo(() => spentUsdToday(store.actions), [store.actions]);
  const proposed = useMemo(
    () => store.actions.filter((a) => a.status === "proposed"),
    [store.actions],
  );
  const history = useMemo(
    () => store.actions.filter((a) => a.status !== "proposed").slice(0, 12),
    [store.actions],
  );

  async function handleConnect() {
    setError("");
    try {
      const conn = await connectWallet();
      setConnection(conn);
      persist({ ...loadWalletStore(), lastConnectedAt: new Date().toISOString() });
      void refreshBalance(conn);
      setNotice(`Connected ${shortAddress(conn.address)} on ${chainLabel(conn.chainId)}.`);
    } catch (err) {
      setError(parseWalletError(err).message);
    }
  }

  function handleDisconnect() {
    setConnection(null);
    setBalance("…");
    setNotice(
      "Disconnected locally. Your wallet still has the site connected — revoke there if you wish.",
    );
  }

  function appendAction(action: WalletAction) {
    persist({ ...loadWalletStore(), actions: [action, ...store.actions] });
  }

  function prepareSignin() {
    if (!connection) {
      setError("Connect your wallet first — the signature needs your address.");
      return;
    }
    const message = buildSiweMessage({
      domain: siweDomain.trim() || "chainscout.local",
      address: connection.address,
      uri: typeof window !== "undefined" ? window.location.origin : "https://chainscout.local",
      chainId: connection.chainId,
      nonce: newSiweNonce(),
      issuedAt: new Date().toISOString(),
    });
    appendAction(
      makeSignMessage({
        message,
        chainId: connection.chainId,
        title: `Sign in to ${siweDomain.trim() || "chainscout.local"}`,
      }),
    );
    setNotice("Signature request prepared — review the card, then confirm in your wallet.");
  }

  function prepareSend() {
    const amount = Number(sendAmount);
    const usd = sendUsd.trim() ? Number(sendUsd) : null;
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (tokenMode) {
      if (
        !/^0x[0-9a-fA-F]{40}$/.test(tokenAddress.trim()) ||
        !/^0x[0-9a-fA-F]{40}$/.test(sendTo.trim())
      ) {
        setError("Token address and recipient must both be full 0x…40-hex addresses.");
        return;
      }
      appendAction(
        makeTokenTransfer({
          tokenAddress: tokenAddress.trim(),
          to: sendTo.trim(),
          amount,
          decimals: Math.max(0, Number(tokenDecimals) || 18),
          symbol: tokenSymbol.trim() || "token",
          usdEstimate: usd,
          chainId: connection?.chainId ?? null,
        }),
      );
    } else {
      if (!/^0x[0-9a-fA-F]{40}$/.test(sendTo.trim())) {
        setError("Recipient must be a full 0x…40-hex address.");
        return;
      }
      appendAction(
        makeNativeSend({
          from: connection?.address ?? "",
          to: sendTo.trim(),
          amountEth: amount,
          usdEstimate: usd,
          chainId: connection?.chainId ?? null,
        }),
      );
    }
    setNotice("Transfer prepared — check the card against your limits, then approve.");
  }

  function prepareCall() {
    if (!/^0x[0-9a-fA-F]{40}$/.test(callTo.trim())) {
      setError("Contract address must be a full 0x…40-hex address.");
      return;
    }
    appendAction(
      makeContractCall({
        to: callTo.trim(),
        data: callData.trim() || "0x",
        valueEth: Number(callValue) || 0,
        usdEstimate: callUsd.trim() ? Number(callUsd) : null,
        chainId: connection?.chainId ?? null,
        title: callTitle.trim() || "Contract interaction",
      }),
    );
    setNotice("Contract action prepared — calldata is shown in full on the card.");
  }

  async function approveAction(action: WalletAction) {
    if (!connection) {
      setError("Connect your wallet first.");
      return;
    }
    const policy = evaluateAction(action, store.limits, spentToday);
    if (policy.level === "block") {
      setError(policy.blocks[0] ?? "Blocked by your safety limits.");
      return;
    }
    setBusy(true);
    setBusyId(action.id);
    try {
      let result = "";
      if (action.kind === "sign-message") {
        result = await signMessage(connection.address, action.message);
      } else {
        result = await sendTransaction({
          from: connection.address,
          to: action.to ?? "",
          valueHex: "0x" + BigInt(action.valueWei).toString(16),
          data: action.data,
        });
      }
      persist({
        ...loadWalletStore(),
        actions: loadWalletStore().actions.map((a) =>
          a.id === action.id ? { ...a, status: "submitted", result } : a,
        ),
      });
      setNotice(
        action.kind === "sign-message"
          ? "Message signed — signature recorded in the log."
          : "Transaction sent to your wallet and broadcast. Watch it in the explorer.",
      );
      void refreshBalance(connection);
    } catch (err) {
      const parsed = parseWalletError(err);
      persist({
        ...loadWalletStore(),
        actions: loadWalletStore().actions.map((a) =>
          a.id === action.id
            ? {
                ...a,
                status: parsed.code === "rejected" ? "rejected" : "failed",
                result: parsed.message,
              }
            : a,
        ),
      });
      if (parsed.code !== "rejected") setError(parsed.message);
      else setNotice(parsed.message);
    } finally {
      setBusy(false);
      setBusyId(null);
    }
  }

  function rejectAction(action: WalletAction) {
    persist({
      ...loadWalletStore(),
      actions: loadWalletStore().actions.map((a) =>
        a.id === action.id
          ? { ...a, status: "rejected", result: "Rejected by you before any wallet request." }
          : a,
      ),
    });
    setNotice("Rejected — your wallet was never asked.");
  }

  return (
    <section className="wallet-section" aria-label="Wallet desk">
      <div className="wallet-hero">
        <span className="agent-symbol" aria-hidden="true">
          <Landmark size={19} />
        </span>
        <div className="wallet-hero-copy">
          <span className="micro-label">WALLET DESK · AGENT PREPARES · YOUR WALLET DECIDES</span>
          <h2>Connect, sign, and transact — with you holding the keys</h2>
          <p>
            ChainScout connects to the wallet <strong>you</strong> already use (MetaMask, Rabby,
            Coinbase Wallet…). The agent prepares signatures and transactions as approval cards —
            each one shows the full details and your safety limits first. The final step is always{" "}
            <strong>your wallet&apos;s own popup</strong>.{" "}
            <strong>We never ask for a seed phrase or private key. Ever.</strong>
          </p>
        </div>
        <div className="wallet-conn-card">
          {connection ? (
            <>
              <span className="micro-label">CONNECTED</span>
              <strong className="wallet-address" title={connection.address}>
                {shortAddress(connection.address)}
              </strong>
              <span className="wallet-conn-meta">
                {chainLabel(connection.chainId)} · {balance} native
              </span>
              <div className="wallet-conn-actions">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Copy address"
                  onClick={() => {
                    void navigator.clipboard?.writeText(connection.address);
                    setNotice("Address copied.");
                  }}
                >
                  <Copy size={14} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Refresh balance"
                  onClick={() => void refreshBalance(connection)}
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  className="secondary-button small-primary"
                  type="button"
                  onClick={handleDisconnect}
                >
                  <Link2Off size={13} /> Disconnect
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="micro-label">NOT CONNECTED</span>
              <strong>No wallet linked</strong>
              <span className="wallet-conn-meta">
                Detecting an injected wallet… none yet. Install one, then connect.
              </span>
              <button
                className="primary-button small-primary"
                type="button"
                onClick={() => void handleConnect()}
              >
                <Wallet size={13} /> Connect wallet
              </button>
            </>
          )}
        </div>
      </div>

      <div className="wallet-redline">
        <ShieldAlert size={15} />
        <p>
          <strong>The red lines, in plain words.</strong> Nobody from any project, support desk, or
          airdrop will ever need your seed phrase — anyone who asks is a scammer. Unlimited token
          approvals are blocked by default. Wrong addresses lose funds permanently, so verify on a
          block explorer before you approve. DeFi can lose principal; claims may pay nothing.
        </p>
      </div>

      {error ? (
        <div className="alert-panel" role="alert">
          <ShieldAlert size={16} className="alert-icon" />
          <div>
            <strong>Wallet desk</strong>
            <p>{error}</p>
          </div>
          <button
            className="alert-dismiss"
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss message"
          >
            <X size={15} />
          </button>
        </div>
      ) : null}

      <div className="wallet-grid">
        <div className="wallet-limits">
          <div className="section-kicker">
            <span className="live-mark" />
            SAFETY LIMITS · HARD BLOCKS
          </div>
          <h2>Your rules, enforced before the popup</h2>
          <div className="wallet-limits-grid">
            <label className="form-field">
              <span className="field-label">Per-transaction cap (USD)</span>
              <input
                type="number"
                min={1}
                value={store.limits.perTxUsd}
                onChange={(event) =>
                  persist({
                    ...loadWalletStore(),
                    limits: {
                      ...store.limits,
                      perTxUsd: Math.max(1, Number(event.target.value) || 1),
                    },
                  })
                }
              />
            </label>
            <label className="form-field">
              <span className="field-label">Daily cap (USD)</span>
              <input
                type="number"
                min={1}
                value={store.limits.dailyUsd}
                onChange={(event) =>
                  persist({
                    ...loadWalletStore(),
                    limits: {
                      ...store.limits,
                      dailyUsd: Math.max(1, Number(event.target.value) || 1),
                    },
                  })
                }
              />
            </label>
          </div>
          <p className="wallet-spent">
            <ShieldCheck size={12} /> {fmtUsd(spentToday)} of {fmtUsd(store.limits.dailyUsd)} used
            today (from your own USD estimates).
          </p>
          <label className="wallet-approve-toggle">
            <input
              type="checkbox"
              checked={store.limits.allowUnlimitedApprovals}
              onChange={(event) =>
                persist({
                  ...loadWalletStore(),
                  limits: { ...store.limits, allowUnlimitedApprovals: event.target.checked },
                })
              }
            />
            <span>
              Allow unlimited token approvals <strong>(dangerous — off by default)</strong>
            </span>
          </label>
          <p className="wallet-limits-note">
            Caps apply to actions whose USD estimate you set. The agent can&apos;t price tokens for
            you — an unpriced action gets a warning and counts as unbounded toward warnings.
          </p>
        </div>

        <div className="wallet-composer">
          <div
            className="prompt-pack-tabs wallet-tabs"
            role="tablist"
            aria-label="Prepare an action"
          >
            {(
              [
                { id: "signin", label: "Sign-in message", icon: FileSignature },
                { id: "send", label: "Send funds / tokens", icon: Send },
                { id: "call", label: "Contract call (claim / withdraw / swap)", icon: Signature },
              ] as { id: ComposerTab; label: string; icon: typeof Send }[]
            ).map((item) => (
              <button
                key={item.id}
                className={`prompt-pack-tab ${tab === item.id ? "is-active" : ""}`}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
              >
                <strong>
                  <item.icon size={12} /> {item.label}
                </strong>
              </button>
            ))}
          </div>

          {tab === "signin" ? (
            <div className="wallet-composer-panel">
              <label className="form-field">
                <span className="field-label">Site / domain to sign in to</span>
                <input
                  type="text"
                  value={siweDomain}
                  onChange={(e) => setSiweDomain(e.target.value)}
                />
              </label>
              <p className="wallet-composer-note">
                Builds a standard EIP-4361 (SIWE) message. Signing proves you own the address — it
                costs no gas and moves no funds.
              </p>
              <button
                className="primary-button small-primary"
                type="button"
                onClick={prepareSignin}
              >
                <FileSignature size={13} /> Prepare signature
              </button>
            </div>
          ) : tab === "send" ? (
            <div className="wallet-composer-panel">
              <label className="wallet-approve-toggle">
                <input
                  type="checkbox"
                  checked={tokenMode}
                  onChange={(e) => setTokenMode(e.target.checked)}
                />
                <span>Send an ERC-20 token (otherwise native coin)</span>
              </label>
              {tokenMode ? (
                <div className="wallet-limits-grid">
                  <label className="form-field form-field-wide">
                    <span className="field-label">Token contract</span>
                    <input
                      type="text"
                      placeholder="0x…"
                      value={tokenAddress}
                      onChange={(e) => setTokenAddress(e.target.value)}
                    />
                  </label>
                  <label className="form-field">
                    <span className="field-label">Symbol</span>
                    <input
                      type="text"
                      value={tokenSymbol}
                      onChange={(e) => setTokenSymbol(e.target.value)}
                    />
                  </label>
                  <label className="form-field">
                    <span className="field-label">Decimals</span>
                    <input
                      type="number"
                      min={0}
                      value={tokenDecimals}
                      onChange={(e) => setTokenDecimals(e.target.value)}
                    />
                  </label>
                </div>
              ) : null}
              <div className="wallet-limits-grid">
                <label className="form-field form-field-wide">
                  <span className="field-label">Recipient (0x…40 hex)</span>
                  <input
                    type="text"
                    placeholder="0x…"
                    value={sendTo}
                    onChange={(e) => setSendTo(e.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span className="field-label">Amount</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span className="field-label">USD estimate (for caps)</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={sendUsd}
                    onChange={(e) => setSendUsd(e.target.value)}
                  />
                </label>
              </div>
              <button className="primary-button small-primary" type="button" onClick={prepareSend}>
                <Send size={13} /> Prepare transfer
              </button>
            </div>
          ) : (
            <div className="wallet-composer-panel">
              <div className="wallet-limits-grid">
                <label className="form-field">
                  <span className="field-label">Title</span>
                  <input
                    type="text"
                    value={callTitle}
                    onChange={(e) => setCallTitle(e.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span className="field-label">Contract (0x…40 hex)</span>
                  <input
                    type="text"
                    placeholder="0x…"
                    value={callTo}
                    onChange={(e) => setCallTo(e.target.value)}
                  />
                </label>
                <label className="form-field form-field-wide">
                  <span className="field-label">Calldata (from a verified source)</span>
                  <input
                    type="text"
                    placeholder="0x…"
                    value={callData}
                    onChange={(e) => setCallData(e.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span className="field-label">Value (native)</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={callValue}
                    onChange={(e) => setCallValue(e.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span className="field-label">USD estimate (for caps)</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={callUsd}
                    onChange={(e) => setCallUsd(e.target.value)}
                  />
                </label>
              </div>
              <p className="wallet-composer-note">
                Claims, withdrawals, and swaps all use this path. Paste calldata only from a source
                you verified yourself (the contract&apos;s verified Write page, or a DEX UI you
                trust). Unrecognized calldata gets a blind-signing warning on the card.
              </p>
              <button className="primary-button small-primary" type="button" onClick={prepareCall}>
                <Signature size={13} /> Prepare contract action
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="wallet-queue-head">
        <div>
          <div className="section-kicker">
            <span className="live-mark" />
            APPROVAL QUEUE
          </div>
          <h2>Nothing reaches your wallet without your tap here first</h2>
        </div>
        <span className="result-count">{proposed.length} waiting</span>
      </div>

      {proposed.length === 0 ? (
        <div className="empty-state compact-empty">
          <ShieldCheck size={21} />
          <h3>Queue is clear</h3>
          <p>
            Prepare an action above, or approve a job that needs a wallet step. Nothing runs
            unattended.
          </p>
        </div>
      ) : (
        <div className="wallet-queue">
          {proposed.map((action) => {
            const policy = evaluateAction(action, store.limits, spentToday);
            return (
              <article className="wallet-action-card" key={action.id}>
                <div className="card-main-row">
                  <span className="project-avatar avatar-yield" aria-hidden="true">
                    {action.kind === "sign-message" ? (
                      <FileSignature size={18} />
                    ) : (
                      <Send size={18} />
                    )}
                  </span>
                  <div className="card-title-block">
                    <div className="card-title-line">
                      <h3>{action.title}</h3>
                      <span
                        className={`risk-chip ${
                          policy.level === "block"
                            ? "risk-high"
                            : policy.level === "warn"
                              ? "risk-moderate"
                              : "risk-lower"
                        }`}
                      >
                        {policy.level === "block"
                          ? "Blocked"
                          : policy.level === "warn"
                            ? "Review carefully"
                            : "Looks clear"}
                      </span>
                    </div>
                    <p className="card-subtitle">{action.note}</p>
                  </div>
                  {action.valueUsdEstimate !== null ? (
                    <div className="grind-pay">
                      <strong>{fmtUsd(action.valueUsdEstimate)}</strong>
                      <span>your estimate</span>
                    </div>
                  ) : null}
                </div>

                <div className="campaign-detail-grid wallet-detail-grid">
                  <div>
                    <span>CHAIN</span>
                    <strong>{chainLabel(action.chainId)}</strong>
                  </div>
                  <div>
                    <span>TO</span>
                    <strong>{action.to ? shortAddress(action.to) : "—"}</strong>
                  </div>
                  <div>
                    <span>VALUE</span>
                    <strong>
                      {action.valueWei === "0" ? "0" : formatNative(action.valueWei)} native
                    </strong>
                  </div>
                  <div>
                    <span>DATA</span>
                    <strong>
                      {action.data === "0x" ? "none" : `${action.data.slice(0, 18)}…`}
                    </strong>
                  </div>
                </div>

                {action.message ? (
                  <pre className="wallet-message-preview">{action.message}</pre>
                ) : null}

                {policy.warnings.map((warning) => (
                  <p className="wallet-policy wallet-policy-warn" key={warning}>
                    <AlertTriangle size={12} /> {warning}
                  </p>
                ))}
                {policy.blocks.map((block) => (
                  <p className="wallet-policy wallet-policy-block" key={block}>
                    <XCircle size={12} /> {block}
                  </p>
                ))}

                <div className="job-cta-row">
                  <span className="source-time">
                    Prepared {new Date(action.createdAt).toLocaleTimeString()}
                  </span>
                  <div className="job-cta-buttons">
                    <button
                      className="secondary-button small-primary job-decline"
                      type="button"
                      onClick={() => rejectAction(action)}
                    >
                      Reject
                    </button>
                    <button
                      className="primary-button small-primary"
                      type="button"
                      disabled={busy && busyId === action.id}
                      onClick={() => void approveAction(action)}
                      title={
                        policy.level === "block"
                          ? "Blocked by your safety limits"
                          : "Opens your wallet popup"
                      }
                    >
                      {busy && busyId === action.id ? (
                        <LoaderCircle size={13} className="spin" />
                      ) : (
                        <Wallet size={13} />
                      )}
                      {action.kind === "sign-message" ? "Approve & sign" : "Approve & send"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {history.length > 0 ? (
        <div className="wallet-history">
          <div className="section-kicker">
            <span className="live-mark" />
            SESSION LOG
          </div>
          <h2>Everything signed or sent here is logged</h2>
          <div className="entry-list">
            {history.map((action) => {
              const explorer = explorerTxUrl(action.chainId, action.result);
              return (
                <div className="entry-row" key={action.id}>
                  <div className="entry-main">
                    <div className="entry-title-line">
                      <strong>{action.title}</strong>
                      <span
                        className={`status-chip ${
                          action.status === "submitted"
                            ? "status-received"
                            : action.status === "failed"
                              ? "status-pending"
                              : ""
                        }`}
                      >
                        {action.status}
                      </span>
                    </div>
                    <div className="entry-meta">
                      {shortAddress(action.result.slice(0, 42)) || action.result.slice(0, 80)}
                      <span className="entry-meta-dot">·</span>
                      {new Date(action.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="entry-side">
                    {explorer ? (
                      <a className="card-action" href={explorer} target="_blank" rel="noreferrer">
                        View <ExternalLink size={11} />
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grind-footer">
        <Lock size={13} /> No seed phrases, no private keys, no stored secrets — your wallet device
        signs everything. The agent prepares; your tap approves; your wallet has the final word.
      </div>

      {notice ? (
        <div className="toast-message" role="status">
          <CheckCircle2 size={15} />
          {notice}
        </div>
      ) : null}
    </section>
  );
}
