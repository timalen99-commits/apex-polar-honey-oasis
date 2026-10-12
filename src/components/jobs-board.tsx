import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRight,
  Briefcase,
  Check,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Hand,
  ListChecks,
  LoaderCircle,
  Plus,
  Sparkles,
  Timer,
  X,
  Zap,
} from "lucide-react";
import {
  buildPlan,
  createManualJob,
  KIND_LABEL,
  loadJobs,
  STATUS_LABEL,
  updateJob,
  WORK_PHASES,
  type AgentJob,
  type JobStatus,
} from "@/lib/crypto/jobs";

type JobsBoardProps = {
  confirmJobId: string | null;
  onConfirmConsumed: () => void;
  reloadKey: number;
  onOpenEarnings: () => void;
};

const ACTIVE_FILTER: JobStatus[] = ["awaiting", "working", "ready"];

export function JobsBoard({
  confirmJobId,
  onConfirmConsumed,
  reloadKey,
  onOpenEarnings,
}: JobsBoardProps) {
  const [jobs, setJobs] = useState<AgentJob[]>([]);
  const [confirmJob, setConfirmJob] = useState<AgentJob | null>(null);
  const [workingJobId, setWorkingJobId] = useState<string | null>(null);
  const [workPhase, setWorkPhase] = useState(0);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<"active" | "done" | "all">("active");
  const [adding, setAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftLink, setDraftLink] = useState("");
  const [draftReward, setDraftReward] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const workTimers = useRef<number[]>([]);

  function refresh() {
    setJobs(loadJobs());
  }

  useEffect(() => {
    refresh();
    setHydrated(true);
    return () => {
      for (const timer of workTimers.current) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    refresh();
  }, [reloadKey]);

  useEffect(() => {
    if (!confirmJobId) return;
    const job = loadJobs().find((item) => item.id === confirmJobId) ?? null;
    if (job && job.status === "awaiting") {
      setConfirmJob(job);
    }
    onConfirmConsumed();
  }, [confirmJobId, onConfirmConsumed]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const counts = useMemo(
    () => ({
      awaiting: jobs.filter((job) => job.status === "awaiting").length,
      working: jobs.filter((job) => job.status === "working").length,
      ready: jobs.filter((job) => job.status === "ready").length,
      done: jobs.filter((job) => job.status === "done").length,
    }),
    [jobs],
  );

  const visible = useMemo(() => {
    if (filter === "all") return jobs;
    if (filter === "done")
      return jobs.filter((job) => job.status === "done" || job.status === "declined");
    return jobs.filter((job) => ACTIVE_FILTER.includes(job.status));
  }, [jobs, filter]);

  /** The agent's preparation work runs ONLY after the user approves. */
  function approveJob(job: AgentJob) {
    setConfirmJob(null);
    updateJob(job.id, { status: "working", approvedAt: new Date().toISOString(), workNote: "" });
    refresh();
    setWorkingJobId(job.id);
    setWorkPhase(0);
    for (const timer of workTimers.current) window.clearTimeout(timer);
    workTimers.current = [
      window.setTimeout(() => setWorkPhase(1), 900),
      window.setTimeout(() => setWorkPhase(2), 1800),
      window.setTimeout(() => {
        updateJob(job.id, {
          status: "ready",
          finishedAt: new Date().toISOString(),
          plan: buildPlan(job),
          workNote:
            "Preparation work done. This was research and planning only — nothing was signed or sent. The checklist is yours to run when you're ready.",
        });
        setWorkingJobId(null);
        refresh();
        setNotice("Job prepared — your checklist is ready");
      }, 2800),
    ];
  }

  function declineJob(job: AgentJob) {
    setConfirmJob(null);
    updateJob(job.id, {
      status: "declined",
      finishedAt: new Date().toISOString(),
      workNote: "Passed on this one. The agent did not start any work.",
    });
    refresh();
    setNotice("Passed — the agent will skip it");
  }

  function markDone(job: AgentJob) {
    updateJob(job.id, { status: "done", finishedAt: new Date().toISOString() });
    refresh();
    setNotice("Nice — marked completed");
  }

  function reopen(job: AgentJob) {
    updateJob(job.id, {
      status: "awaiting",
      plan: [],
      workNote: "",
      approvedAt: null,
      finishedAt: null,
    });
    refresh();
    setNotice("Back to the approval queue");
  }

  function addManualJob() {
    if (!draftTitle.trim()) {
      setNotice("Give the task a short title first");
      return;
    }
    const job = createManualJob({ title: draftTitle, link: draftLink, reward: draftReward });
    setDraftTitle("");
    setDraftLink("");
    setDraftReward("");
    setAdding(false);
    refresh();
    setConfirmJob(job);
    setNotice("Task added — approval card is up");
  }

  return (
    <section className="jobs-section" aria-label="Agent jobs">
      <div className="jobs-hero">
        <div className="jobs-hero-icon">
          <Hand size={22} aria-hidden="true" />
        </div>
        <div>
          <span className="micro-label">YOUR AGENT WORKS ON APPROVAL ONLY</span>
          <h2>Jobs waiting for your yes</h2>
          <p>
            When the agent finds a crypto task, it writes up a job card and stops. Nothing starts
            until you tap <strong>Approve</strong> — then it prepares your research and checklist.
            You stay in charge of every real step.
          </p>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={() => setAdding((value) => !value)}
        >
          <Plus size={16} aria-hidden="true" />
          Add a task
        </button>
      </div>

      {adding ? (
        <div className="tracker-form-panel add-job-panel">
          <div className="tracker-form-head">
            <h3>Add a task for the agent</h3>
            <button className="text-button" type="button" onClick={() => setAdding(false)}>
              Cancel <X size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="tracker-form-grid add-job-grid">
            <label className="form-field form-field-wide">
              <span className="field-label">Task title</span>
              <input
                type="text"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="e.g. Finish the LayerZero quest"
                aria-label="Task title"
              />
            </label>
            <label className="form-field">
              <span className="field-label">Link (optional)</span>
              <input
                type="url"
                value={draftLink}
                onChange={(event) => setDraftLink(event.target.value)}
                placeholder="https://…"
                aria-label="Task link"
              />
            </label>
            <label className="form-field">
              <span className="field-label">Reward (optional)</span>
              <input
                type="text"
                value={draftReward}
                onChange={(event) => setDraftReward(event.target.value)}
                placeholder="e.g. 250 tokens"
                aria-label="Reward"
              />
            </label>
          </div>
          <div className="tracker-form-actions">
            <button className="primary-button" type="button" onClick={addManualJob}>
              <Sparkles size={16} aria-hidden="true" />
              Save & ask my approval
            </button>
            <span className="scan-meta">It will wait for your tap before doing anything</span>
          </div>
        </div>
      ) : null}

      <div className="stat-grid jobs-stats" aria-label="Job summary">
        <JobsStat label="Needs your OK" value={String(counts.awaiting)} icon={Hand} />
        <JobsStat label="Working now" value={String(counts.working)} icon={Zap} />
        <JobsStat label="Checklists ready" value={String(counts.ready)} icon={ClipboardList} />
        <JobsStat label="Completed" value={String(counts.done)} icon={CheckCircle2} />
      </div>

      <div className="feed-heading-row tracker-list-head">
        <div>
          <div className="section-kicker">
            <span className="live-mark" />
            JOB CARDS
          </div>
          <h2>
            {filter === "active" ? "Active jobs" : filter === "done" ? "Finished jobs" : "All jobs"}
          </h2>
        </div>
        <div className="filter-chips" role="group" aria-label="Filter jobs">
          {(["active", "done", "all"] as const).map((key) => (
            <button
              key={key}
              type="button"
              className={`filter-chip ${filter === key ? "is-active" : ""}`}
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
            >
              {key === "active"
                ? `Active (${counts.awaiting + counts.working + counts.ready})`
                : key === "done"
                  ? "Finished"
                  : `All (${jobs.length})`}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state compact-empty">
          <Briefcase size={22} aria-hidden="true" />
          <h3>No jobs here yet</h3>
          <p>
            Run a campaign scan and the agent will bring you job cards to approve — or add a task
            above and the agent will prep it for you.
          </p>
        </div>
      ) : (
        <div className="job-list">
          {visible.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              working={workingJobId === job.id}
              workPhase={workPhase}
              onApprove={() => approveJob(job)}
              onDecline={() => declineJob(job)}
              onDone={() => markDone(job)}
              onReopen={() => reopen(job)}
              onOpenEarnings={onOpenEarnings}
            />
          ))}
        </div>
      )}

      <JobConfirmDialog
        job={confirmJob}
        onApprove={approveJob}
        onDecline={declineJob}
        onClose={() => setConfirmJob(null)}
      />

      {notice ? (
        <div className="toast-message" role="status" aria-live="polite">
          <CheckCircle2 size={16} aria-hidden="true" />
          {notice}
        </div>
      ) : null}
      {!hydrated ? null : null}
    </section>
  );
}

function JobsStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Briefcase;
}) {
  return (
    <article className="stat-card stat-mint jobs-stat-card">
      <div className="stat-topline">
        <span>{label}</span>
        <span className="stat-icon">
          <Icon size={16} aria-hidden="true" />
        </span>
      </div>
      <strong className="stat-value">{value}</strong>
    </article>
  );
}

function JobCard({
  job,
  working,
  workPhase,
  onApprove,
  onDecline,
  onDone,
  onReopen,
  onOpenEarnings,
}: {
  job: AgentJob;
  working: boolean;
  workPhase: number;
  onApprove: () => void;
  onDecline: () => void;
  onDone: () => void;
  onReopen: () => void;
  onOpenEarnings: () => void;
}) {
  return (
    <article className={`job-card job-${job.status}`}>
      <div className="card-main-row">
        <div className={`project-avatar job-avatar job-avatar-${job.status}`} aria-hidden="true">
          {job.status === "awaiting" ? (
            <Hand size={18} />
          ) : job.status === "working" ? (
            <Zap size={18} />
          ) : job.status === "ready" ? (
            <ClipboardList size={18} />
          ) : job.status === "done" ? (
            <Check size={18} />
          ) : (
            <X size={18} />
          )}
        </div>
        <div className="card-title-block">
          <div className="card-title-line">
            <h3>{job.title}</h3>
            <span className={`kind-chip job-status-chip job-status-${job.status}`}>
              {STATUS_LABEL[job.status]}
            </span>
          </div>
          <p className="card-subtitle">
            {KIND_LABEL[job.kind]} <span className="middle-dot">·</span> {job.project}{" "}
            <span className="middle-dot">·</span> {job.chain}
          </p>
        </div>
      </div>

      {job.summary ? <p className="campaign-summary job-summary">{job.summary}</p> : null}

      {working ? (
        <div className="job-progress" role="status">
          <ul>
            {WORK_PHASES.map((phase, index) => (
              <li
                key={phase}
                className={
                  index < workPhase ? "phase-done" : index === workPhase ? "phase-active" : ""
                }
              >
                {index < workPhase ? (
                  <Check size={13} aria-hidden="true" />
                ) : index === workPhase ? (
                  <LoaderCircle className="spin" size={13} aria-hidden="true" />
                ) : (
                  <Timer size={13} aria-hidden="true" />
                )}
                <span>{phase}</span>
              </li>
            ))}
          </ul>
          <p className="job-progress-note">
            Working only on your approval — research and planning, no wallet actions.
          </p>
        </div>
      ) : null}

      {job.status === "ready" && job.plan.length > 0 ? (
        <div className="job-plan">
          <h4>
            <ListChecks size={13} aria-hidden="true" /> Your task checklist
          </h4>
          <ol>
            {job.plan.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {job.workNote ? <p className="job-work-note">{job.workNote}</p> : null}
        </div>
      ) : null}

      {job.status === "awaiting" ? (
        <div className="job-cta-row">
          <span className="review-badge">
            <Sparkles size={13} aria-hidden="true" /> The agent is holding — tap approve to let it
            start
          </span>
          <div className="job-cta-buttons">
            <button className="secondary-button job-decline" type="button" onClick={onDecline}>
              Not now
            </button>
            <button className="primary-button" type="button" onClick={onApprove}>
              <Check size={16} aria-hidden="true" />
              Approve & let it work
            </button>
          </div>
        </div>
      ) : null}

      {job.status === "ready" ? (
        <div className="card-bottom-row job-bottom-row">
          <span className="review-badge">
            <CheckCircle2 size={13} aria-hidden="true" /> Prep done — you run the steps yourself
          </span>
          <div className="job-cta-buttons">
            {job.sourceUrl ? (
              <a
                className="job-source-link"
                href={job.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open source <ExternalLink size={13} aria-hidden="true" />
              </a>
            ) : null}
            <button className="secondary-button job-decline" type="button" onClick={onReopen}>
              Reopen
            </button>
            <button className="primary-button" type="button" onClick={onDone}>
              <Check size={16} aria-hidden="true" />
              Mark completed
            </button>
          </div>
        </div>
      ) : null}

      {job.status === "done" ? (
        <div className="card-bottom-row job-bottom-row">
          <span className="review-badge status-done-badge">
            <CheckCircle2 size={13} aria-hidden="true" /> Completed{" "}
            {job.finishedAt ? new Date(job.finishedAt).toLocaleDateString() : ""}
          </span>
          <div className="job-cta-buttons">
            <button className="card-action" type="button" onClick={onOpenEarnings}>
              Log the payout <ArrowRight size={14} aria-hidden="true" />
            </button>
            <button className="secondary-button job-decline" type="button" onClick={onReopen}>
              Reopen
            </button>
          </div>
        </div>
      ) : null}

      {job.status === "declined" ? (
        <div className="card-bottom-row job-bottom-row">
          <span className="review-badge">
            <X size={13} aria-hidden="true" /> Passed — no work was started
          </span>
          <button className="card-action" type="button" onClick={onReopen}>
            Reconsider <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </article>
  );
}

function JobConfirmDialog({
  job,
  onApprove,
  onDecline,
  onClose,
}: {
  job: AgentJob | null;
  onApprove: (job: AgentJob) => void;
  onDecline: (job: AgentJob) => void;
  onClose: () => void;
}) {
  return (
    <Dialog.Root
      open={Boolean(job)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="job-confirm-dialog" aria-describedby="job-confirm-desc">
          <div className="job-confirm-illustration" aria-hidden="true">
            <span className="job-confirm-emoji-ring">
              <Hand size={26} />
            </span>
          </div>
          <span className="micro-label job-confirm-kicker">A JOB FOR YOU</span>
          <Dialog.Title className="job-confirm-title">Want me to work on this?</Dialog.Title>
          <Dialog.Description id="job-confirm-desc" className="job-confirm-desc">
            The agent found a crypto task and prepared a summary. It will{" "}
            <strong>do nothing</strong> until you say yes — approve and it starts the research and
            checklist right away.
          </Dialog.Description>

          {job ? (
            <div className="job-confirm-card">
              <div className="card-title-line">
                <h3>{job.title}</h3>
                <span className="kind-chip kind-airdrop">{KIND_LABEL[job.kind]}</span>
              </div>
              <p>{job.summary || "A task ready for preparation."}</p>
              <dl className="job-confirm-facts">
                <div>
                  <dt>PROJECT</dt>
                  <dd>{job.project}</dd>
                </div>
                <div>
                  <dt>CHAIN</dt>
                  <dd>{job.chain}</dd>
                </div>
                <div>
                  <dt>REWARD</dt>
                  <dd>{job.reward}</dd>
                </div>
              </dl>
            </div>
          ) : null}

          <div className="job-confirm-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => job && onDecline(job)}
            >
              <Hand size={15} aria-hidden="true" />
              Not now
            </button>
            <button
              className="primary-button job-approve-big"
              type="button"
              onClick={() => job && onApprove(job)}
            >
              <Check size={17} aria-hidden="true" />
              Approve & let it work
            </button>
          </div>
          <p className="job-confirm-footnote">
            Research & planning only. Your wallet is never connected, and nothing is ever signed
            automatically.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
