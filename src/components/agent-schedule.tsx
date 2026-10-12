import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClock,
  Bell,
  BellRing,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Eye,
  HandCoins,
  LoaderCircle,
  Lock,
  Moon,
  Pickaxe,
  Play,
  Sun,
  Zap,
} from "lucide-react";
import {
  awakeMinutes,
  dueActions,
  huntDueInMs,
  draftDueInMs,
  loadScheduler,
  markAwake,
  notify,
  recordRun,
  requestNotifyPermission,
  requestWakeLock,
  saveScheduler,
  type ScheduledAction,
  type SchedulerState,
} from "@/lib/crypto/scheduler";
import { PAYOUT_RAILS, railSummaries, unmatchedRailCount } from "@/lib/crypto/payouts";
import { loadEarningEntries } from "@/lib/crypto/earnings-store";
import {
  appendGrindTasks,
  draftForTask,
  huntedToGrindTask,
  loadGrindTasks,
  updateGrindTask,
} from "@/lib/crypto/grind";
import { scanMoneyTasks } from "@/lib/crypto/scanner";
import { brainEnvStatus, loadBrainConfig, type ServerKeyStatus } from "@/lib/crypto/llm";
import { awardXp, loadGoalsRolled, todayEarnedUsd } from "@/lib/crypto/goals";

const ACTION_LABEL: Record<ScheduledAction, string> = {
  plan: "Day plan",
  hunt: "Lead hunt",
  draft: "Proposal drafts",
  "check-in": "Daily check-in",
};

function fmtCountdown(ms: number): string {
  if (!Number.isFinite(ms)) return "off";
  if (ms === 0) return "due now";
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `in ${mins} min`;
  return `in ${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function fmtUsd(value: number): string {
  return `$${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}`;
}

export function AgentSchedule({ onOpenEarnings }: { onOpenEarnings: () => void }) {
  const [schedule, setSchedule] = useState<SchedulerState>(() => markAwake(loadScheduler()));
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState("");
  const [running, setRunning] = useState<ScheduledAction | null>(null);
  const [serverKeys, setServerKeys] = useState<ServerKeyStatus>({});
  const runningRef = useRef(false);

  const persist = useCallback((next: SchedulerState) => {
    setSchedule(next);
    saveScheduler(next);
  }, []);

  useEffect(() => {
    persist(markAwake(loadScheduler()));
    void brainEnvStatus()
      .then(setServerKeys)
      .catch(() => setServerKeys({}));
  }, [persist]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const railStats = useMemo(() => railSummaries(loadEarningEntries()), []);
  const unmatched = useMemo(() => unmatchedRailCount(loadEarningEntries()), []);
  const earnedToday = useMemo(() => {
    // Recomputed on each minute tick (`now`), not cached across ticks.
    void now;
    return todayEarnedUsd();
  }, [now]);
  const goalUsd = useMemo(() => {
    void now;
    return loadGoalsRolled().dailyGoalUsd;
  }, [now]);

  const execute = useCallback(
    async (action: ScheduledAction, quiet = false) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setRunning(action);
      let detail = "";
      try {
        if (action === "plan") {
          const gap = Math.max(0, goalUsd - earnedToday);
          detail =
            gap > 0
              ? `Plan ready: ${fmtUsd(gap)} to go on today's ${fmtUsd(goalUsd)} target.`
              : `Plan ready: target of ${fmtUsd(goalUsd)} already covered — keep stacking.`;
          notify("ChainScout — your day plan is ready", detail);
        } else if (action === "check-in") {
          const award = awardXp("check-in");
          detail = `Checked in for the streak (${award?.message ?? "+5 XP"}).`;
        } else if (action === "hunt") {
          const result = await scanMoneyTasks();
          if (result.ok) {
            const mapped = result.tasks.map((h) => huntedToGrindTask(h));
            const before = loadGrindTasks().length;
            appendGrindTasks(mapped);
            const added = Math.max(0, loadGrindTasks().length - before);
            detail = added
              ? `Hunt added ${added} new lead${added === 1 ? "" : "s"} to the Grind board.`
              : "Hunt finished — no new leads this round.";
            notify("ChainScout — hunt finished", detail);
          } else {
            detail = `Hunt skipped: ${result.error.slice(0, 90)}`;
          }
        } else {
          // Auto-draft: max 2 leads without drafts per pass, so the queue never floods.
          const config = loadBrainConfig();
          const targets = loadGrindTasks()
            .filter((t) => t.status === "lead" && !t.draft)
            .slice(0, 2);
          if (targets.length === 0) {
            detail = "Nothing to draft — every lead already has text.";
          } else {
            let done = 0;
            for (const task of targets) {
              const result = await draftForTask(task, config, serverKeys);
              updateGrindTask(task.id, { draft: result.draft, draftSource: result.source });
              done += 1;
            }
            detail = `Drafted ${done} proposal${done === 1 ? "" : "s"} on the Grind board — review before approving.`;
            notify("ChainScout — drafts ready", detail);
          }
        }
        persist(recordRun(loadScheduler(), action, detail));
        if (!quiet && detail) setNotice(detail);
      } finally {
        runningRef.current = false;
        setRunning(null);
      }
    },
    [earnedToday, goalUsd, persist, serverKeys],
  );

  // The loop: one tick per minute while the app is open. Pure `dueActions`
  // decides; every run is recorded in the visible log below.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
      const current = loadScheduler();
      if (!current.enabled || runningRef.current) return;
      const due = dueActions(current);
      if (due.length > 0) {
        void execute(due[0], true);
      }
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [execute]);

  const nextHunt = huntDueInMs({ ...schedule }, new Date(now));
  const nextDraft = draftDueInMs({ ...schedule }, new Date(now));

  async function toggleNotifications() {
    if (schedule.notifications) {
      persist({ ...loadScheduler(), notifications: false });
      setNotice("Notifications off — the run log still records everything.");
      return;
    }
    const granted = await requestNotifyPermission();
    persist({ ...loadScheduler(), notifications: granted });
    setNotice(
      granted
        ? "Notifications on — the agent will ping you for plans, hunts, and drafts."
        : "Your browser declined notifications — in-app toasts still work.",
    );
  }

  function toggleAwake() {
    const next = !schedule.keepAwake;
    if (next) {
      void requestWakeLock().then((ok) => {
        if (!ok)
          setNotice("This browser won't hold a screen wake lock — keep the tab open instead.");
      });
    }
    const base = { ...loadScheduler(), keepAwake: next };
    persist(next ? markAwake(base) : { ...base, awakeSince: "" });
    setNotice(next ? "Agent stays awake while this tab is open." : "Wake lock released.");
  }

  return (
    <section className="schedule-section" aria-label="Agent schedule">
      <div className="schedule-hero">
        <span className="agent-symbol" aria-hidden="true">
          <AlarmClock size={19} />
        </span>
        <div className="schedule-hero-copy">
          <span className="micro-label">24/7 GRIND LOOP · RUNS WHILE THIS APP IS OPEN</span>
          <h2>{schedule.enabled ? "Your agent is on shift" : "Your agent is off shift"}</h2>
          <p>
            Awake for <strong>{awakeMinutes(schedule, new Date(now))} min</strong> this session ·
            next hunt {fmtCountdown(nextHunt)} · next draft pass {fmtCountdown(nextDraft)}. The loop
            only does four things — build the day plan, hunt leads, draft proposals, and check you
            in — and every run lands in the log below. No hidden actions, no wallet touches, no
            spending without a card you approve.
          </p>
          <div className="schedule-hero-chips">
            <span className="streak-chip">
              <Sun size={13} /> {fmtUsd(earnedToday)} / {fmtUsd(goalUsd)} today
            </span>
            <span className="quests-chip">
              <Zap size={13} /> {schedule.runs.length} runs logged
            </span>
            <span className={`brain-chip ${schedule.enabled ? "brain-chip-live" : ""}`}>
              <Eye size={13} />{" "}
              {schedule.enabled
                ? schedule.keepAwake
                  ? "Awake lock on"
                  : "Looping in this tab"
                : "Paused"}
            </span>
          </div>
        </div>
        <div className="schedule-controls">
          <button
            className={schedule.enabled ? "secondary-button" : "primary-button"}
            type="button"
            onClick={() => {
              const next = { ...loadScheduler(), enabled: !schedule.enabled };
              persist(next);
              setNotice(next.enabled ? "Agent back on shift." : "Agent paused — nothing will run.");
            }}
          >
            {schedule.enabled ? <Moon size={14} /> : <Play size={14} />}
            {schedule.enabled ? "Pause agent" : "Start agent"}
          </button>
          <button className="secondary-button" type="button" onClick={toggleAwake}>
            <Eye size={14} /> {schedule.keepAwake ? "Release wake lock" : "Keep screen awake"}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void toggleNotifications()}
          >
            {schedule.notifications ? <BellRing size={14} /> : <Bell size={14} />}
            {schedule.notifications ? "Notifications on" : "Enable notifications"}
          </button>
        </div>
      </div>

      <div className="schedule-grid">
        <div className="schedule-cadence">
          <div className="section-kicker">
            <span className="live-mark" />
            CADENCE
          </div>
          <h2>How often the loop runs</h2>
          <label className="form-field">
            <span className="field-label">Hunt live leads every (minutes, min 5)</span>
            <input
              type="number"
              min={5}
              value={schedule.autoHuntMins}
              onChange={(event) =>
                persist({
                  ...loadScheduler(),
                  autoHuntMins: Math.max(5, Number(event.target.value) || 45),
                })
              }
            />
          </label>
          <label className="wallet-approve-toggle schedule-toggle">
            <input
              type="checkbox"
              checked={schedule.autoDraft}
              onChange={(event) => persist({ ...loadScheduler(), autoDraft: event.target.checked })}
            />
            <span>Auto-draft proposals for new leads (max 2 per pass, always reviewable)</span>
          </label>
          <p className="wallet-limits-note">
            The first hunt is always yours to press (it spends live-search credits) — that arms the
            automatic loop. Server cooldowns still apply, so the agent can never spam searches.
          </p>
        </div>

        <div className="schedule-due">
          <div className="section-kicker">
            <span className="live-mark" />
            DUE NOW · RUN ANY EARLY
          </div>
          <h2>Manual overrides</h2>
          <div className="schedule-due-grid">
            {(["plan", "check-in", "hunt", "draft"] as ScheduledAction[]).map((action) => (
              <button
                key={action}
                className="schedule-due-card"
                type="button"
                disabled={running !== null}
                onClick={() => void execute(action)}
              >
                {running === action ? (
                  <LoaderCircle size={15} className="spin" />
                ) : action === "hunt" ? (
                  <Pickaxe size={15} />
                ) : action === "draft" ? (
                  <ClipboardList size={15} />
                ) : action === "plan" ? (
                  <Sun size={15} />
                ) : (
                  <CheckCircle2 size={15} />
                )}
                <strong>{ACTION_LABEL[action]}</strong>
                <span>
                  {action === "hunt"
                    ? fmtCountdown(nextHunt)
                    : action === "draft"
                      ? fmtCountdown(nextDraft)
                      : schedule.lastPlanDay && action === "plan"
                        ? "once per day"
                        : "run anytime"}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="schedule-log">
        <div className="section-kicker">
          <span className="live-mark" />
          RUN LOG
        </div>
        <h2>Everything the loop did, in the open</h2>
        {schedule.runs.length === 0 ? (
          <div className="empty-state compact-empty">
            <Clock3 size={20} />
            <h3>No runs yet</h3>
            <p>
              Run a plan or a hunt above — the loop takes it from there while this app stays open.
            </p>
          </div>
        ) : (
          <div className="entry-list">
            {schedule.runs.map((run) => (
              <div className="entry-row" key={`${run.at}-${run.action}`}>
                <div className="entry-main">
                  <div className="entry-title-line">
                    <strong>{ACTION_LABEL[run.action]}</strong>
                    <span className="status-chip status-received">{run.action}</span>
                  </div>
                  <p className="entry-note">{run.detail}</p>
                </div>
                <div className="entry-side">
                  <span
                    className="entry-amount"
                    style={{ fontSize: 10, color: "var(--color-subtle)" }}
                  >
                    {new Date(run.at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="payouts-section">
        <div className="section-kicker">
          <span className="live-mark" />
          PAYOUT RAILS · EARNED → RECEIVED → WITHDRAWN
        </div>
        <h2>Where the money actually lands</h2>
        <p className="payouts-intro">
          Track every rail you use alongside the earnings log. Notes cover real fees, KYC, and
          haircuts — not endorsements. Always do a $1 test before a first full transfer.
        </p>
        {unmatched > 0 ? (
          <p className="wallet-policy wallet-policy-warn" style={{ margin: "0 0 10px" }}>
            <Clock3 size={12} /> {unmatched} logged earning{unmatched === 1 ? "" : "s"} use a
            withdrawal method we don&apos;t recognize — naming the rail in the log (e.g. “USDT”,
            “Payoneer”) unlocks the tracking below.
          </p>
        ) : null}
        <div className="payout-grid">
          {PAYOUT_RAILS.map((rail) => {
            const stats = railStats.find((r) => r.id === rail.id);
            return (
              <article className="payout-card" key={rail.id}>
                <div className="payout-head">
                  <span
                    className={`kind-chip ${rail.type === "crypto" ? "kind-live" : rail.type === "gift" ? "kind-giveaway" : ""}`}
                  >
                    {rail.type}
                  </span>
                  <h3>{rail.label}</h3>
                </div>
                <p className="payout-summary">{rail.summary}</p>
                <p className="wallet-policy wallet-policy-warn" style={{ margin: "0 0 9px" }}>
                  <Clock3 size={11} /> {rail.friction}
                </p>
                <details className="grind-details" style={{ margin: 0 }}>
                  <summary>
                    <ClipboardList size={12} /> Withdrawal checklist
                  </summary>
                  <ol>
                    {rail.checklist.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </details>
                {stats ? (
                  <div className="payout-stats">
                    <span>received {fmtUsd(stats.receivedUsd)}</span>
                    <span>withdrawn {fmtUsd(stats.withdrawnUsd)}</span>
                    <span>pending {fmtUsd(stats.stillPendingUsd)}</span>
                  </div>
                ) : (
                  <div className="payout-stats">
                    <span>no entries yet</span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
        <div className="job-cta-row" style={{ borderTop: "none" }}>
          <span className="source-time">
            <Lock size={11} /> Rails are labels for your log — ChainScout never holds funds.
          </span>
          <div className="job-cta-buttons">
            <button className="primary-button small-primary" type="button" onClick={onOpenEarnings}>
              <HandCoins size={13} /> Log a withdrawal
            </button>
          </div>
        </div>
      </div>

      <div className="grind-footer">
        <Clock3 size={13} /> The honest version of “24/7”: this loop runs whenever the app is open
        (this tab, or the PWA on a phone with the screen kept awake). For a truly hosted worker we'd
        need a deployed instance with a scheduler — the code is ready for that, and until then
        nothing pretends to run when it isn&apos;t.
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
