import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardList,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import {
  loadEarningEntries,
  METHOD_LABEL,
  newEntryId,
  STATUS_LABEL,
  STATUS_ORDER,
  writeEarningEntries,
  type EarningEntry,
  type EntryMethod,
  type EntryStatus,
} from "@/lib/crypto/earnings-store";

type Filter = "all" | EntryStatus;

function blankDraft(): EarningEntry {
  return {
    id: "",
    date: new Date().toISOString().slice(0, 10),
    source: "",
    method: "airdrop",
    asset: "",
    amountUsd: 0,
    status: "pending",
    withdrawalMethod: "",
    note: "",
  };
}

function usd(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function shortDate(value: string): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export function EarningsTracker() {
  const [entries, setEntries] = useState<EarningEntry[]>([]);
  const [draft, setDraft] = useState<EarningEntry>(blankDraft);
  const [filter, setFilter] = useState<Filter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setEntries(loadEarningEntries());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeEarningEntries(entries);
  }, [entries, hydrated]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const stats = useMemo(() => {
    const received = entries
      .filter((e) => e.status === "received")
      .reduce((sum, e) => sum + e.amountUsd, 0);
    const withdrawn = entries
      .filter((e) => e.status === "withdrawn")
      .reduce((sum, e) => sum + e.amountUsd, 0);
    const pending = entries
      .filter((e) => e.status === "pending")
      .reduce((sum, e) => sum + e.amountUsd, 0);
    return {
      realized: received + withdrawn,
      withdrawn,
      pending,
      total: entries.reduce((sum, e) => sum + e.amountUsd, 0),
      counts: {
        all: entries.length,
        pending: entries.filter((e) => e.status === "pending").length,
        received: entries.filter((e) => e.status === "received").length,
        withdrawn: entries.filter((e) => e.status === "withdrawn").length,
      },
    };
  }, [entries]);

  const visible = useMemo(() => {
    const filtered = filter === "all" ? entries : entries.filter((e) => e.status === filter);
    return [...filtered].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [entries, filter]);

  function patchDraft(patch: Partial<EarningEntry>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function saveEntry() {
    const source = draft.source.trim();
    const asset = draft.asset.trim();
    const amount = Number(draft.amountUsd);
    if (!source || !Number.isFinite(amount) || amount < 0) {
      setNotice("Add a source and a valid amount first");
      return;
    }
    const entry: EarningEntry = {
      ...draft,
      id: editingId ?? newEntryId(),
      source: source.slice(0, 120),
      asset: asset.slice(0, 24),
      amountUsd: Math.round(amount * 100) / 100,
      withdrawalMethod: draft.withdrawalMethod.trim().slice(0, 80),
      note: draft.note.trim().slice(0, 240),
      date: draft.date || new Date().toISOString().slice(0, 10),
    };
    if (editingId) {
      setEntries((current) => current.map((item) => (item.id === editingId ? entry : item)));
      setNotice("Entry updated");
    } else {
      setEntries((current) => [entry, ...current]);
      setNotice("Entry saved to your log");
    }
    setEditingId(null);
    setDraft(blankDraft());
  }

  function startEdit(entry: EarningEntry) {
    setEditingId(entry.id);
    setDraft(entry);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(blankDraft());
  }

  function advanceStatus(entry: EarningEntry) {
    const index = STATUS_ORDER.indexOf(entry.status);
    const next = STATUS_ORDER[(index + 1) % STATUS_ORDER.length];
    setEntries((current) =>
      current.map((item) => (item.id === entry.id ? { ...item, status: next } : item)),
    );
    setNotice(
      next === "withdrawn"
        ? "Marked withdrawn — funds out of crypto"
        : `Marked ${STATUS_LABEL[next].toLowerCase()}`,
    );
  }

  function removeEntry(entry: EarningEntry) {
    setEntries((current) => current.filter((item) => item.id !== entry.id));
    if (editingId === entry.id) cancelEdit();
    setNotice("Entry removed");
  }

  return (
    <section className="tracker-section" aria-label="Earnings tracker">
      <div className="tracker-intro">
        <div className="agent-symbol tracker-symbol">
          <Wallet size={21} aria-hidden="true" />
        </div>
        <div>
          <span className="micro-label">EARN → RECEIVE → WITHDRAW</span>
          <h2>Your real earnings log</h2>
          <p>
            Track every reward from claim through withdrawal. Only amounts marked{" "}
            <strong>received</strong> or <strong>withdrawn</strong> are real earnings — pending
            claims are not money yet.
          </p>
        </div>
      </div>

      <div className="stat-grid tracker-stats" aria-label="Earnings summary">
        <TrackerStat
          label="Realized earnings"
          value={usd(stats.realized)}
          footnote="Received + withdrawn"
          accent="mint"
        />
        <TrackerStat
          label="Withdrawn to bank / wallet"
          value={usd(stats.withdrawn)}
          footnote={`${stats.counts.withdrawn} entries finished`}
          accent="lime"
        />
        <TrackerStat
          label="Pending value"
          value={usd(stats.pending)}
          footnote={`${stats.counts.pending} not yet claimed/received`}
          accent="amber"
        />
        <TrackerStat
          label="Entries logged"
          value={String(entries.length)}
          footnote="Stored on this device"
          accent="blue"
        />
      </div>

      {stats.withdrawn === 0 && entries.length > 0 ? (
        <div className="first-withdraw-nudge">
          <ShieldCheck size={18} aria-hidden="true" />
          <p>
            <strong>Path to first withdrawal:</strong> mark entries received as claims land, convert
            to stables, test-transaction, then off-ramp on your exchange — and mark it withdrawn
            here.
          </p>
        </div>
      ) : null}

      <div className="tracker-form-panel">
        <div className="tracker-form-head">
          <h3>{editingId ? "Edit entry" : "Log an earning"}</h3>
          {editingId ? (
            <button className="text-button" type="button" onClick={cancelEdit}>
              Cancel edit <X size={14} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="tracker-form-grid">
          <label className="form-field">
            <span className="field-label">Source / project</span>
            <input
              type="text"
              value={draft.source}
              onChange={(event) => patchDraft({ source: event.target.value })}
              placeholder="e.g. LayerZero claim"
              aria-label="Source or project"
            />
          </label>
          <label className="form-field">
            <span className="field-label">Method</span>
            <select
              value={draft.method}
              onChange={(event) => patchDraft({ method: event.target.value as EntryMethod })}
              aria-label="Method"
            >
              {(Object.keys(METHOD_LABEL) as EntryMethod[]).map((key) => (
                <option key={key} value={key}>
                  {METHOD_LABEL[key]}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="field-label">Asset</span>
            <input
              type="text"
              value={draft.asset}
              onChange={(event) => patchDraft({ asset: event.target.value })}
              placeholder="e.g. USDC"
              aria-label="Asset"
            />
          </label>
          <label className="form-field">
            <span className="field-label">Value (USD)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={Number.isFinite(draft.amountUsd) ? draft.amountUsd : 0}
              onChange={(event) => patchDraft({ amountUsd: Number(event.target.value) })}
              aria-label="Value in USD"
            />
          </label>
          <label className="form-field">
            <span className="field-label">Status</span>
            <select
              value={draft.status}
              onChange={(event) => patchDraft({ status: event.target.value as EntryStatus })}
              aria-label="Status"
            >
              {STATUS_ORDER.map((key) => (
                <option key={key} value={key}>
                  {STATUS_LABEL[key]}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="field-label">Date</span>
            <input
              type="date"
              value={draft.date}
              onChange={(event) => patchDraft({ date: event.target.value })}
              aria-label="Date"
            />
          </label>
          <label className="form-field form-field-wide">
            <span className="field-label">Withdrawal method (optional)</span>
            <input
              type="text"
              value={draft.withdrawalMethod}
              onChange={(event) => patchDraft({ withdrawalMethod: event.target.value })}
              placeholder="e.g. Binance bank transfer"
              aria-label="Withdrawal method"
            />
          </label>
          <label className="form-field form-field-wide">
            <span className="field-label">Notes (optional)</span>
            <input
              type="text"
              value={draft.note}
              onChange={(event) => patchDraft({ note: event.target.value })}
              placeholder="Wallet used, tx ref, deadline…"
              aria-label="Notes"
            />
          </label>
        </div>
        <div className="tracker-form-actions">
          <button className="primary-button" type="button" onClick={saveEntry}>
            {editingId ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Plus size={16} aria-hidden="true" />
            )}
            {editingId ? "Save changes" : "Add to log"}
          </button>
          <span className="scan-meta">Saved on this device only · no wallet connection</span>
        </div>
      </div>

      <div className="tracker-list-section">
        <div className="feed-heading-row tracker-list-head">
          <div>
            <div className="section-kicker">
              <span className="live-mark" />
              YOUR LOG
            </div>
            <h2>Claim & withdrawal history</h2>
          </div>
          <div className="filter-chips" role="group" aria-label="Filter entries">
            {(["all", ...STATUS_ORDER] as Filter[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`filter-chip ${filter === key ? "is-active" : ""}`}
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
              >
                {key === "all"
                  ? `All (${stats.counts.all})`
                  : `${STATUS_LABEL[key]} (${stats.counts[key]})`}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="empty-state compact-empty">
            <ClipboardList size={22} aria-hidden="true" />
            <h3>{entries.length === 0 ? "Nothing logged yet" : "No entries in this filter"}</h3>
            <p>
              {entries.length === 0
                ? "When an airdrop, yield payout, or bounty lands, log it here and move it from pending to withdrawn."
                : "Switch the filter to see your other entries."}
            </p>
          </div>
        ) : (
          <div className="entry-list">
            {visible.map((entry) => (
              <article className="entry-row" key={entry.id}>
                <div className="entry-main">
                  <div className="entry-title-line">
                    <strong>{entry.source}</strong>
                    <span className={`status-chip status-${entry.status}`}>
                      {STATUS_LABEL[entry.status]}
                    </span>
                  </div>
                  <div className="entry-meta">
                    <span>{shortDate(entry.date)}</span>
                    <span className="entry-meta-dot">·</span>
                    <span>{METHOD_LABEL[entry.method]}</span>
                    {entry.asset ? (
                      <>
                        <span className="entry-meta-dot">·</span>
                        <span>{entry.asset}</span>
                      </>
                    ) : null}
                    {entry.withdrawalMethod ? (
                      <>
                        <span className="entry-meta-dot">·</span>
                        <span>via {entry.withdrawalMethod}</span>
                      </>
                    ) : null}
                  </div>
                  {entry.note ? <p className="entry-note">{entry.note}</p> : null}
                </div>
                <div className="entry-side">
                  <strong className="entry-amount">{usd(entry.amountUsd)}</strong>
                  <div className="entry-actions">
                    <button
                      type="button"
                      className="icon-button entry-action"
                      onClick={() => advanceStatus(entry)}
                      title={`Move to ${STATUS_LABEL[STATUS_ORDER[(STATUS_ORDER.indexOf(entry.status) + 1) % STATUS_ORDER.length]].toLowerCase()}`}
                      aria-label={`Advance status of ${entry.source}`}
                    >
                      <ArrowRight size={15} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button entry-action"
                      onClick={() => startEdit(entry)}
                      title="Edit entry"
                      aria-label={`Edit ${entry.source}`}
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button entry-action entry-action-danger"
                      onClick={() => removeEntry(entry)}
                      title="Delete entry"
                      aria-label={`Delete ${entry.source}`}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="feed-bottom-note">
          <CheckCircle2 size={15} aria-hidden="true" />
          <span>
            Ledger rule: a claim you have not received is not income. Only received and withdrawn
            amounts count.
          </span>
        </div>
      </div>
    </section>
  );
}

function TrackerStat({
  label,
  value,
  footnote,
  accent,
}: {
  label: string;
  value: string;
  footnote: string;
  accent: "mint" | "lime" | "blue" | "amber";
}) {
  return (
    <article className={`stat-card stat-${accent}`}>
      <div className="stat-topline">
        <span>{label}</span>
      </div>
      <strong className="stat-value">{value}</strong>
      <span className="stat-footnote">{footnote}</span>
    </article>
  );
}
