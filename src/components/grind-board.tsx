import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Flame,
  Gift,
  Hand,
  ListChecks,
  LoaderCircle,
  Lock,
  Pencil,
  Pickaxe,
  RefreshCw,
  ShieldAlert,
  Target,
  X,
  Zap,
} from "lucide-react";
import {
  KIND_LABEL,
  RISK_LABEL,
  RISK_NOTE,
  appendGrindTasks,
  buildDailyPlan,
  draftForTask,
  huntedToGrindTask,
  loadGrindTasks,
  queueGrindTask,
  starterCatalog,
  taskValuePerHour,
  templateDraft,
  updateGrindTask,
  type GrindTask,
  type TaskKind,
} from "@/lib/crypto/grind";
import { scanMoneyTasks } from "@/lib/crypto/scanner";
import {
  brainEnvStatus,
  loadBrainConfig,
  type BrainConfig,
  type ServerKeyStatus,
} from "@/lib/crypto/llm";
import { awardXp, loadGoalsRolled } from "@/lib/crypto/goals";

type StatusFilter = "all" | "lead" | "queued" | "declined";

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All work" },
  { id: "lead", label: "Leads" },
  { id: "queued", label: "Queued" },
  { id: "declined", label: "Passed" },
];

const KIND_ICONS: Record<TaskKind, typeof Bot> = {
  freelance: Hand,
  crypto: Gift,
  microtask: Zap,
  content: Pencil,
  product: Target,
};

function fmtUsd(value: number): string {
  return `$${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}`;
}

function payLabel(task: GrindTask): string {
  return task.payUsdLow === task.payUsdHigh
    ? fmtUsd(task.payUsdHigh)
    : `${fmtUsd(task.payUsdLow)}–${fmtUsd(task.payUsdHigh)}`;
}

export function GrindBoard({ onOpenJobs }: { onOpenJobs: () => void }) {
  const [tasks, setTasks] = useState<GrindTask[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [hunting, setHunting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [draftForId, setDraftForId] = useState<string | null>(null);
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [brain, setBrain] = useState<BrainConfig>(() => loadBrainConfig());
  const [serverKeys, setServerKeys] = useState<ServerKeyStatus>({});
  const [goalUsd, setGoalUsd] = useState(40);

  useEffect(() => {
    const existing = loadGrindTasks();
    setTasks(existing.length ? existing : appendGrindTasks(starterCatalog()));
    setGoalUsd(loadGoalsRolled().dailyGoalUsd);
    void brainEnvStatus()
      .then(setServerKeys)
      .catch(() => setServerKeys({}));
  }, []);

  useEffect(() => {
    if (!notice && !error) return undefined;
    const timer = window.setTimeout(() => {
      setNotice("");
      setError("");
    }, 3600);
    return () => window.clearTimeout(timer);
  }, [notice, error]);

  const plan = useMemo(() => buildDailyPlan(tasks, goalUsd), [tasks, goalUsd]);
  const visible = useMemo(
    () => (filter === "all" ? tasks : tasks.filter((t) => t.status === filter)),
    [tasks, filter],
  );
  const queuedCount = tasks.filter((t) => t.status === "queued").length;

  const hunt = useCallback(async () => {
    if (hunting) return;
    setHunting(true);
    setError("");
    try {
      const result = await scanMoneyTasks();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const mapped = result.tasks.map((h) => huntedToGrindTask(h));
      const before = loadGrindTasks().length;
      const next = appendGrindTasks(mapped);
      setTasks(next);
      const added = Math.max(0, next.length - before);
      setNotice(
        added
          ? `Hunt done — ${added} new lead${added === 1 ? "" : "s"} on the board. Check the risk flags.`
          : "Hunt done — no new leads this round (or all were duplicates). The catalog still stands.",
      );
      awardXp("scan");
    } finally {
      setHunting(false);
    }
  }, [hunting]);

  const runDraft = useCallback(
    async (task: GrindTask) => {
      setDraftingId(task.id);
      const config = loadBrainConfig();
      setBrain(config);
      try {
        const result = await draftForTask(task, config, serverKeys);
        const next = updateGrindTask(task.id, { draft: result.draft, draftSource: result.source });
        setTasks(next);
        setDraftForId(task.id);
        setNotice(
          result.source === "agent"
            ? "Agent drafted a proposal — read it, edit it, make it yours before sending."
            : "No brain reply — used the built-in template instead. Edit freely.",
        );
      } finally {
        setDraftingId(null);
      }
    },
    [serverKeys],
  );

  const approve = useCallback((task: GrindTask) => {
    const draft = task.draft || templateDraft(task);
    if (!task.draft) {
      updateGrindTask(task.id, { draft, draftSource: "template" });
    }
    const { tasks: next } = queueGrindTask({ ...task, draft });
    setTasks(next);
    const award = awardXp("add-task");
    setNotice(`Queued — approval card is waiting in Agent jobs (${award?.message ?? "nice"})`);
  }, []);

  const decline = useCallback((task: GrindTask) => {
    setTasks(updateGrindTask(task.id, { status: "declined" }));
    setNotice("Passed — it stays on the board in case you change your mind");
  }, []);

  const reconsider = useCallback((task: GrindTask) => {
    setTasks(updateGrindTask(task.id, { status: "lead" }));
  }, []);

  return (
    <section className="grind-section" aria-label="Grind board">
      <div className="grind-hero">
        <span className="agent-symbol" aria-hidden="true">
          <Pickaxe size={19} />
        </span>
        <div className="grind-hero-copy">
          <span className="micro-label">$40/DAY GRIND ENGINE · AGENT PREPARES, YOU APPROVE</span>
          <h2>The board is your pipeline to {fmtUsd(goalUsd)} today</h2>
          <p>{plan.note}</p>
          <div className="grind-hero-chips">
            <span className="streak-chip">
              <Target size={13} /> Queued value ~{fmtUsd(plan.queuedValue)}
            </span>
            <span className="quests-chip">
              <ListChecks size={13} /> {queuedCount} queued job{queuedCount === 1 ? "" : "s"}
            </span>
            <span
              className={`brain-chip ${Object.values(serverKeys).some(Boolean) ? "brain-chip-live" : ""}`}
            >
              <Bot size={13} />{" "}
              {Object.values(serverKeys).some(Boolean) || Object.values(brain).some((c) => c.apiKey)
                ? "Brain ready for drafts"
                : "Templates only — connect a brain"}
            </span>
          </div>
        </div>
        <div className="grind-hero-actions">
          <button className="secondary-button" type="button" onClick={onOpenJobs}>
            <ListChecks size={14} /> Agent jobs
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={hunting}
            onClick={() => void hunt()}
          >
            {hunting ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}
            {hunting ? "Hunting…" : "Hunt live leads"}
          </button>
        </div>
      </div>

      <div className="grind-honesty">
        <ShieldAlert size={15} />
        <p>
          <strong>How this board makes money — honestly.</strong> Pay ranges are typical public
          figures, not promises; real results depend on task supply, your accounts, and geography
          (some marketplaces restrict Nigeria — check before spending time).{" "}
          <strong>Paid engagement gigs (likes/follows) carry real account-ban risk</strong> and
          break platform ToS — they're flagged on the card, and you decide. The agent drafts and
          queues; <strong>you</strong> submit from your own accounts. It never auto-submits, never
          touches wallets, and never fakes engagement with bots.
        </p>
      </div>

      {error ? (
        <div className="alert-panel" role="alert">
          <ShieldAlert size={16} className="alert-icon" />
          <div>
            <strong>Hunt paused</strong>
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

      <div className="feed-toolbar grind-toolbar">
        <div className="filter-chips" role="tablist" aria-label="Filter tasks">
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.id}
              className={`filter-chip ${filter === item.id ? "is-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="result-count">
          {visible.length} task{visible.length === 1 ? "" : "s"}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state compact-empty">
          <Pickaxe size={21} />
          <h3>Nothing in this lane</h3>
          <p>Switch the filter, or hunt for fresh leads with the agent.</p>
        </div>
      ) : (
        <div className="grind-list">
          {visible.map((task) => {
            const KindIcon = KIND_ICONS[task.kind] ?? Zap;
            const vph = taskValuePerHour(task);
            return (
              <article className="grind-card" key={task.id}>
                <div className="card-main-row">
                  <span className="project-avatar avatar-yield" aria-hidden="true">
                    <KindIcon size={18} />
                  </span>
                  <div className="card-title-block">
                    <div className="card-title-line">
                      <h3>{task.title}</h3>
                      <span className="kind-chip kind-live">{KIND_LABEL[task.kind]}</span>
                      {task.origin === "hunt" ? (
                        <span className="source-time">live hunt</span>
                      ) : null}
                    </div>
                    <p className="card-subtitle">
                      {task.project}
                      {task.sourceUrl ? (
                        <>
                          {" "}
                          <span className="middle-dot">·</span>{" "}
                          <a
                            className="job-source-link grind-source-link"
                            href={task.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {task.sourceLabel} <ExternalLink size={10} />
                          </a>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="grind-pay" aria-label="Pay range">
                    <strong>{payLabel(task)}</strong>
                    <span>~{fmtUsd(vph)}/hr</span>
                  </div>
                </div>

                <p className="campaign-summary grind-summary">{task.summary}</p>

                {task.riskFlags.length > 0 ? (
                  <div className="grind-risks">
                    {task.riskFlags.map((flag) => (
                      <span
                        className={`risk-chip ${
                          flag === "tos-risk" || flag === "ban-risk"
                            ? "risk-high"
                            : flag === "unverified-pay" || flag === "points-only"
                              ? "risk-moderate"
                              : "risk-lower"
                        }`}
                        key={flag}
                        title={RISK_NOTE[flag]}
                      >
                        <ShieldAlert size={9} /> {RISK_LABEL[flag]}
                      </span>
                    ))}
                  </div>
                ) : null}

                {task.howTo.length > 0 ? (
                  <details className="grind-details">
                    <summary>
                      <ListChecks size={12} /> How the agent suggests running it · ~{task.minutes}{" "}
                      min
                    </summary>
                    <ol>
                      {task.howTo.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                    {task.requirements.length > 0 ? (
                      <p className="grind-requirements">Needs: {task.requirements.join(" · ")}</p>
                    ) : null}
                  </details>
                ) : (
                  <p className="grind-requirements">
                    <Clock3 size={11} /> ~{task.minutes} min
                    {task.requirements.length ? ` · Needs: ${task.requirements.join(" · ")}` : ""}
                  </p>
                )}

                {draftForId === task.id || task.draft ? (
                  <div className="grind-draft">
                    <div className="grind-draft-head">
                      <span className="micro-label">
                        DRAFT {task.draftSource === "agent" ? "· AGENT" : "· TEMPLATE"}
                      </span>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => setDraftForId(draftForId === task.id ? null : task.id)}
                      >
                        {draftForId === task.id ? "Hide draft" : "Show draft"}
                      </button>
                    </div>
                    {draftForId === task.id ? (
                      <textarea
                        value={task.draft}
                        rows={6}
                        aria-label="Proposal draft"
                        onChange={(event) => {
                          const next = updateGrindTask(task.id, {
                            draft: event.target.value,
                          });
                          setTasks(next);
                        }}
                      />
                    ) : null}
                  </div>
                ) : null}

                <div className="job-cta-row">
                  <span className="source-time">
                    {task.status === "queued"
                      ? "Queued to Agent jobs"
                      : task.status === "declined"
                        ? "Passed"
                        : "Waiting on you"}
                  </span>
                  <div className="job-cta-buttons">
                    {task.status === "lead" ? (
                      <>
                        <button
                          className="secondary-button small-primary"
                          type="button"
                          disabled={draftingId === task.id}
                          onClick={() => void runDraft(task)}
                        >
                          {draftingId === task.id ? (
                            <LoaderCircle size={13} className="spin" />
                          ) : (
                            <Pencil size={13} />
                          )}
                          {task.draft ? "Redraft" : "Draft with agent"}
                        </button>
                        <button
                          className="primary-button small-primary"
                          type="button"
                          onClick={() => approve(task)}
                        >
                          <CheckCircle2 size={13} /> Approve &amp; queue
                        </button>
                        <button
                          className="secondary-button small-primary job-decline"
                          type="button"
                          onClick={() => decline(task)}
                        >
                          Not for me
                        </button>
                      </>
                    ) : task.status === "queued" ? (
                      <button
                        className="secondary-button small-primary"
                        type="button"
                        onClick={onOpenJobs}
                      >
                        <ListChecks size={13} /> Open approval card
                      </button>
                    ) : (
                      <button
                        className="secondary-button small-primary"
                        type="button"
                        onClick={() => reconsider(task)}
                      >
                        <Flame size={13} /> Reconsider
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="grind-footer">
        <Lock size={13} /> Nothing on this board is auto-submitted or auto-signed. Every queue
        action creates a normal approval card in Agent jobs — the agent only starts its preparation
        work after you tap approve there.
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
