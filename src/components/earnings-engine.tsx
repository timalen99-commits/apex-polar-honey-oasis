import { useEffect, useMemo, useState } from "react";
import {
  BanknoteArrowDown,
  CheckCircle2,
  Gauge,
  LoaderCircle,
  Plus,
  ShieldAlert,
  Trash2,
  TrendingUp,
  Zap,
} from "lucide-react";
import { appendEarningEntry, type EntryMethod } from "@/lib/crypto/earnings-store";
import {
  accruedUsd,
  formatUsd,
  loadPositions,
  METHOD_LABEL,
  newPositionId,
  perSecondUsd,
  projections,
  savePositions,
  STATION_KIND_LABEL,
  MICRO_STATIONS,
  type EnginePosition,
  type MicroStation,
  type PositionMethod,
} from "@/lib/crypto/earnings-engine";
import type { YieldPool } from "@/lib/crypto/scanner";

const METHOD_TO_ENTRY: Record<PositionMethod, EntryMethod> = {
  "stable-yield": "yield",
  lp: "liquidity",
  staking: "staking",
  other: "yield",
};

function blankPosition(): EnginePosition {
  return {
    id: "",
    label: "",
    method: "stable-yield",
    capitalUsd: 100,
    apy: 5,
    startedAt: new Date().toISOString(),
    note: "",
  };
}

export function EarningsEngine({ pools }: { pools: YieldPool[] }) {
  const [positions, setPositions] = useState<EnginePosition[]>([]);
  const [draft, setDraft] = useState<EnginePosition>(blankPosition);
  const [poolPick, setPoolPick] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPositions(loadPositions());
    setHydrated(true);
    setNow(Date.now());
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    savePositions(positions);
  }, [positions, hydrated]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const clock = now ?? 0;
  const totals = useMemo(() => {
    const capital = positions.reduce((sum, p) => sum + p.capitalUsd, 0);
    const accrued = positions.reduce((sum, p) => sum + accruedUsd(p, clock), 0);
    const perDay = positions.reduce((sum, p) => sum + projections(p).day, 0);
    const perSecond = positions.reduce((sum, p) => sum + perSecondUsd(p), 0);
    return { capital, accrued, perDay, perSecond };
  }, [positions, clock]);

  const topStablePools = useMemo(() => {
    return pools
      .filter((pool) => pool.stablecoin || /usdc|usdt|dai|usd/i.test(pool.pair))
      .slice(0, 8);
  }, [pools]);

  function patchDraft(patch: Partial<EnginePosition>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function applyPoolPick(poolId: string) {
    setPoolPick(poolId);
    const pool = pools.find((item) => item.id === poolId);
    if (!pool) return;
    patchDraft({
      label: `${pool.protocol} · ${pool.pair}`,
      apy: pool.apy,
      method: pool.stablecoin || /usdc|usdt|dai|usd/i.test(pool.pair) ? "stable-yield" : "lp",
      note: `${pool.chain} · live APY at setup · TVL ${new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(pool.tvlUsd)}`,
    });
  }

  function addPosition() {
    const capital = Number(draft.capitalUsd);
    const apy = Number(draft.apy);
    if (
      !draft.label.trim() ||
      !Number.isFinite(capital) ||
      capital < 0 ||
      !Number.isFinite(apy) ||
      apy < 0
    ) {
      setNotice("Add a label, capital, and a valid APY first");
      return;
    }
    const position: EnginePosition = {
      ...draft,
      id: newPositionId(),
      label: draft.label.trim().slice(0, 80),
      capitalUsd: Math.round(capital * 100) / 100,
      apy: Math.round(apy * 100) / 100,
      startedAt: draft.startedAt || new Date().toISOString(),
      note: draft.note.trim().slice(0, 160),
    };
    setPositions((current) => [position, ...current].slice(0, 40));
    setDraft({ ...blankPosition(), startedAt: new Date().toISOString() });
    setPoolPick("");
    setNotice("Position added — accruing live");
  }

  function removePosition(position: EnginePosition) {
    setPositions((current) => current.filter((item) => item.id !== position.id));
    setNotice("Position removed");
  }

  function logPayout(position: EnginePosition) {
    const amount = accruedUsd(position, Date.now());
    if (amount <= 0) {
      setNotice("Nothing has accrued on this position yet");
      return;
    }
    appendEarningEntry({
      date: new Date().toISOString().slice(0, 10),
      source: `${position.label} yield payout`,
      method: METHOD_TO_ENTRY[position.method],
      asset: "USDC",
      amountUsd: Math.round(amount * 100) / 100,
      status: "received",
      withdrawalMethod: "",
      note: `Accrued payout logged from Earn now (APY ${position.apy}%). Confirm the real received amount in your wallet before marking it withdrawn.`,
    });
    setNotice(`Logged ${formatUsd(Math.round(amount * 100) / 100)} to your earnings log`);
  }

  return (
    <section className="engine-section" aria-label="Live earnings engine">
      <div className="engine-hero">
        <div className="engine-hero-top">
          <div className="agent-symbol tracker-symbol engine-symbol">
            <Zap size={21} aria-hidden="true" />
          </div>
          <div>
            <span className="micro-label">REAL-TIME YIELD ACCRUAL · LIVE RATE</span>
            <h2>Your earnings engine</h2>
            <p>
              Every position below accrues interest in real time at its live APY. Small? Yes — but
              real, withdrawable money, ticking every second. Add a position and watch it compound.
            </p>
          </div>
        </div>

        <div className="engine-meters">
          <div className="engine-meter engine-meter-main">
            <span className="engine-meter-label">ACCRUED SO FAR (UNCLAIMED)</span>
            <strong className="engine-ticker">
              {clock ? (
                formatUsd(totals.accrued)
              ) : (
                <LoaderCircle className="spin" size={18} aria-hidden="true" />
              )}
            </strong>
            <span className="engine-meter-foot">
              {totals.perSecond > 0
                ? `+${formatUsd(totals.perSecond)}/sec · ${formatUsd(totals.perDay)}/day projected`
                : "Add a position to start the meter"}
            </span>
          </div>
          <div className="engine-meter">
            <span className="engine-meter-label">CAPITAL AT WORK</span>
            <strong>{formatUsd(totals.capital)}</strong>
            <span className="engine-meter-foot">
              {positions.length} active position{positions.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="engine-meter">
            <span className="engine-meter-label">PROJECTED THIS MONTH</span>
            <strong>{formatUsd(totals.perDay * 30.4)}</strong>
            <span className="engine-meter-foot">at current rates · variable, not promised</span>
          </div>
        </div>
      </div>

      <div className="honesty-banner engine-honesty">
        <ShieldAlert size={18} aria-hidden="true" />
        <p>
          <strong>How this earns real money:</strong> the yield comes from lending/liquidity
          markets, not from the app. Rates move, platforms carry risk, and projections are math on
          today's APY — not a promise. Start with the micro-earning stations below if you want first
          dollars with zero capital.
        </p>
      </div>

      <div className="engine-layout-grid">
        <div className="tracker-form-panel engine-form-panel">
          <div className="tracker-form-head">
            <h3>Add a yield position</h3>
            <span className="scan-meta">Manual entry or pick a live pool</span>
          </div>
          <div className="tracker-form-grid engine-form-grid">
            <label className="form-field form-field-wide">
              <span className="field-label">Pick from live pools (optional)</span>
              <select
                value={poolPick}
                onChange={(event) => applyPoolPick(event.target.value)}
                aria-label="Pick from live pools"
              >
                <option value="">Manual entry…</option>
                {topStablePools.map((pool) => (
                  <option key={pool.id} value={pool.id}>
                    {pool.protocol} · {pool.pair} · {pool.apy.toFixed(2)}% APY
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span className="field-label">Label</span>
              <input
                type="text"
                value={draft.label}
                onChange={(event) => patchDraft({ label: event.target.value })}
                placeholder="e.g. Aave USDC"
                aria-label="Position label"
              />
            </label>
            <label className="form-field">
              <span className="field-label">Capital (USD)</span>
              <input
                type="number"
                min="0"
                step="1"
                value={Number.isFinite(draft.capitalUsd) ? draft.capitalUsd : 0}
                onChange={(event) => patchDraft({ capitalUsd: Number(event.target.value) })}
                aria-label="Capital in USD"
              />
            </label>
            <label className="form-field">
              <span className="field-label">APY (%)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={Number.isFinite(draft.apy) ? draft.apy : 0}
                onChange={(event) => patchDraft({ apy: Number(event.target.value) })}
                aria-label="APY percent"
              />
            </label>
            <label className="form-field">
              <span className="field-label">Method</span>
              <select
                value={draft.method}
                onChange={(event) => patchDraft({ method: event.target.value as PositionMethod })}
                aria-label="Method"
              >
                {(Object.keys(METHOD_LABEL) as PositionMethod[]).map((key) => (
                  <option key={key} value={key}>
                    {METHOD_LABEL[key]}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field form-field-wide">
              <span className="field-label">Note (optional)</span>
              <input
                type="text"
                value={draft.note}
                onChange={(event) => patchDraft({ note: event.target.value })}
                placeholder="Platform, chain, wallet…"
                aria-label="Note"
              />
            </label>
          </div>
          <div className="tracker-form-actions">
            <button className="primary-button" type="button" onClick={addPosition}>
              <Plus size={16} aria-hidden="true" />
              Start accruing
            </button>
            <span className="scan-meta">Positions stay on this device · nothing is connected</span>
          </div>
        </div>

        <aside className="engine-stations-aside">
          <div className="section-kicker">
            <span className="live-mark" />
            FASTEST FIRST DOLLARS · ZERO CAPITAL
          </div>
          <ol className="quick-wins">
            <li>
              <strong>Quest & testnet campaigns</strong> — highest upside for free effort; run the
              daily scan.
            </li>
            <li>
              <strong>AI training tasks & user testing</strong> — most consistent small real payouts
              per hour.
            </li>
            <li>
              <strong>Learn & Earn + cashback</strong> — pocket change, but literally free.
            </li>
          </ol>
          <p className="engine-aside-note">
            Then park the proceeds here at live yield rates and let the meter compound the little
            wins.
          </p>
        </aside>
      </div>

      {positions.length > 0 ? (
        <div className="position-list" aria-label="Active positions">
          {positions.map((position) => {
            const accrued = accruedUsd(position, clock);
            const proj = projections(position);
            return (
              <article className="position-row" key={position.id}>
                <div className="position-main">
                  <div className="entry-title-line">
                    <strong>{position.label}</strong>
                    <span className="kind-chip kind-live">{METHOD_LABEL[position.method]}</span>
                    <span className="kind-chip kind-airdrop">{position.apy}% APY</span>
                  </div>
                  <div className="entry-meta">
                    <span>{formatUsd(position.capitalUsd)} capital</span>
                    <span className="entry-meta-dot">·</span>
                    <span>
                      {formatUsd(proj.day)}/day · {formatUsd(proj.month)}/mo
                    </span>
                    {position.note ? (
                      <>
                        <span className="entry-meta-dot">·</span>
                        <span>{position.note}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="position-side">
                  <div className="position-accrual">
                    <span>accrued · live</span>
                    <strong className="position-ticker">{clock ? formatUsd(accrued) : "…"}</strong>
                  </div>
                  <div className="entry-actions">
                    <button
                      className="icon-button entry-action"
                      type="button"
                      onClick={() => logPayout(position)}
                      title="Log accrued payout to the earnings log"
                      aria-label={`Log payout for ${position.label}`}
                    >
                      <BanknoteArrowDown size={15} aria-hidden="true" />
                    </button>
                    <button
                      className="icon-button entry-action entry-action-danger"
                      type="button"
                      onClick={() => removePosition(position)}
                      title="Remove position"
                      aria-label={`Remove ${position.label}`}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state compact-empty engine-empty">
          <Gauge size={22} aria-hidden="true" />
          <h3>The engine is idle</h3>
          <p>
            Add a position above — even $50 at 5% APY earns about a cent a day, ticking live. Real
            money, just small; the micro-earnings stations are how you grow the stack.
          </p>
        </div>
      )}

      <section className="stations-section" aria-labelledby="stations-title">
        <div className="feed-heading-row">
          <div>
            <div className="section-kicker">
              <span className="live-mark" />
              MICRO-EARNING STATIONS · RANKED BY REALISM
            </div>
            <h2 id="stations-title">Real programs that pay a little something</h2>
            <p className="feed-subtitle">
              These are the honest options: small, real payouts — no guarantees, amounts vary by
              country and campaign. Pick two and start this week.
            </p>
          </div>
        </div>
        <div className="station-grid">
          {MICRO_STATIONS.map((station) => (
            <StationCard key={station.id} station={station} />
          ))}
        </div>
        <div className="feed-bottom-note">
          <CheckCircle2 size={15} aria-hidden="true" />
          <span>
            Rules of the road: never pay to unlock work or rewards, verify platforms before signing
            up, and log every payout the moment it lands.
          </span>
        </div>
      </section>

      {notice ? (
        <div className="toast-message" role="status" aria-live="polite">
          <CheckCircle2 size={16} aria-hidden="true" />
          {notice}
        </div>
      ) : null}
    </section>
  );
}

function StationCard({ station }: { station: MicroStation }) {
  const kindClass =
    station.kind === "capital"
      ? "kind-airdrop"
      : station.kind === "time"
        ? "kind-giveaway"
        : "kind-live";
  return (
    <article className="station-card">
      <div className="card-title-line">
        <h3>{station.name}</h3>
        <span className={`kind-chip ${kindClass}`}>{STATION_KIND_LABEL[station.kind]}</span>
      </div>
      <div className="station-payout">
        <TrendingUp size={14} aria-hidden="true" />
        <strong>{station.payout}</strong>
      </div>
      <dl className="station-facts">
        <div>
          <dt>EFFORT</dt>
          <dd>{station.effort}</dd>
        </div>
        <div>
          <dt>HOW IT PAYS</dt>
          <dd>{station.paysVia}</dd>
        </div>
      </dl>
      <p className="station-how">{station.how}</p>
      <p className="station-note">{station.note}</p>
    </article>
  );
}
