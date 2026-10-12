import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Bot,
  Brain,
  Briefcase,
  Check,
  CheckCircle2,
  Clock3,
  Coins,
  Copy,
  ExternalLink,
  Gift,
  LayoutDashboard,
  LoaderCircle,
  Radar,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  TriangleAlert,
  Trophy,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import {
  getYieldSnapshot,
  scanCampaigns,
  type CampaignOpportunity,
  type YieldPool,
} from "@/lib/crypto/scanner";
import { PROMPT_PACK } from "@/lib/crypto/playbook";
import { appendJobsFromCampaigns, countAwaiting, loadJobs } from "@/lib/crypto/jobs";
import { awardXp } from "@/lib/crypto/goals";
import { AgentBrainView } from "@/components/agent-brain";
import { DailyGoalView } from "@/components/daily-goal";
import { EarningsTracker } from "@/components/earnings-tracker";
import { EarningsEngine } from "@/components/earnings-engine";
import { JobsBoard } from "@/components/jobs-board";
import { PlaybookView } from "@/components/playbook-view";

type View =
  | "overview"
  | "jobs"
  | "quests"
  | "airdrops"
  | "giveaways"
  | "liquidity"
  | "playbook"
  | "earn"
  | "earnings"
  | "saved"
  | "brain"
  | "agent";
type YieldState = "loading" | "ready" | "error";
type Opportunity =
  | { kind: "campaign"; key: string; item: CampaignOpportunity }
  | { kind: "yield"; key: string; item: YieldPool };

type SavedState = {
  campaigns: CampaignOpportunity[];
  savedIds: string[];
  scannedAt: string | null;
  scanNote: string;
};

const STORAGE_KEY = "chainscout.workspace.v1";
const REFRESH_INTERVAL_MS = 90_000;

const VIEWS: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "jobs", label: "Agent jobs", icon: Briefcase },
  { id: "quests", label: "Daily quests", icon: Target },
  { id: "airdrops", label: "Airdrops", icon: Sparkles },
  { id: "giveaways", label: "Giveaways", icon: Gift },
  { id: "liquidity", label: "Liquidity pools", icon: Coins },
  { id: "playbook", label: "Best setup", icon: Trophy },
  { id: "earn", label: "Earn now", icon: Zap },
  { id: "earnings", label: "Earnings log", icon: Wallet },
  { id: "saved", label: "Watchlist", icon: Bookmark },
  { id: "brain", label: "Agent brain", icon: Brain },
  { id: "agent", label: "Agent prompts", icon: Bot },
];

const VIEW_COPY: Record<View, { eyebrow: string; title: string; description: string }> = {
  overview: {
    eyebrow: "Your friendly daily desk",
    title: "Opportunity radar",
    description:
      "Fresh signals and live yields in one calm view. Your agent prepares the work — you approve every step.",
  },
  jobs: {
    eyebrow: "Approve · then the agent works",
    title: "Agent jobs",
    description:
      "Every crypto task the agent finds becomes a job card. It waits for your tap on the approval card — only then does the preparation work start.",
  },
  quests: {
    eyebrow: "Daily grind · $40 target",
    title: "Daily quests",
    description:
      "Your worker game: a $40/day target ring, streaks, levels, and quests — all tracked from real logged earnings. XP is play; the payouts are real.",
  },
  brain: {
    eyebrow: "Free LLM stack",
    title: "Agent brain",
    description:
      "Stack free Gemini, Groq, and OpenRouter keys so the agent can plan, draft, and grind 24/7. xAI Grok optional. Keys stay in this browser.",
  },
  airdrops: {
    eyebrow: "Campaign discovery",
    title: "Airdrops & rewards",
    description:
      "Recent public reward-program announcements. Every result needs your own source check.",
  },
  giveaways: {
    eyebrow: "Campaign discovery",
    title: "Giveaway signals",
    description:
      "No-purchase giveaway announcements found in public sources, not a promise of eligibility or payout.",
  },
  liquidity: {
    eyebrow: "Live public data",
    title: "Liquidity pools",
    description:
      "Current pool snapshots from DeFiLlama. APY moves; supplying liquidity can lose principal.",
  },
  saved: {
    eyebrow: "Your local list",
    title: "Watchlist",
    description:
      "Saved on this device only. Use it to keep track of opportunities you still want to verify.",
  },
  playbook: {
    eyebrow: "Ranked strategy + setup",
    title: "Best setup & earning methods",
    description:
      "The strongest legitimate path to real, withdrawable earnings — ranked methods, the foundation setup, and the exact path to your first withdrawal.",
  },
  earn: {
    eyebrow: "Real-time money engine",
    title: "Earn now",
    description:
      "Watch real yield tick up every second at live APYs — plus the micro-earning programs that pay a little something with zero capital.",
  },
  earnings: {
    eyebrow: "Earn → receive → withdraw",
    title: "Earnings & withdrawals",
    description:
      "Log every reward from claim to bank. Only received and withdrawn amounts count as real earnings.",
  },
  agent: {
    eyebrow: "Scheduled research brief",
    title: "Your automation prompt pack",
    description:
      "Four research-only prompts that run the daily scan, vet every offer, review weekly earnings, and guide safe withdrawals.",
  },
};

function isFreshCampaign(value: unknown): value is CampaignOpportunity {
  if (!value || typeof value !== "object") return false;
  const campaign = value as Partial<CampaignOpportunity>;
  if (
    typeof campaign.id !== "string" ||
    typeof campaign.project !== "string" ||
    typeof campaign.title !== "string" ||
    typeof campaign.summary !== "string" ||
    (campaign.kind !== "airdrop" && campaign.kind !== "giveaway") ||
    !Array.isArray(campaign.requirements) ||
    typeof campaign.sourceUrl !== "string" ||
    !campaign.sourceUrl.startsWith("https://") ||
    typeof campaign.publishedAt !== "string"
  ) {
    return false;
  }
  const publishedAt = Date.parse(campaign.publishedAt);
  const age = Date.now() - publishedAt;
  const expiresAt = campaign.expiresAt ? Date.parse(campaign.expiresAt) : null;
  return (
    Number.isFinite(publishedAt) &&
    age >= -60_000 &&
    age <= 14 * 24 * 60 * 60 * 1000 &&
    (expiresAt === null || (Number.isFinite(expiresAt) && expiresAt >= Date.now()))
  );
}

function readSavedState(): SavedState {
  const empty: SavedState = { campaigns: [], savedIds: [], scannedAt: null, scanNote: "" };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<SavedState>;
    const scannedAt = typeof parsed.scannedAt === "string" ? parsed.scannedAt : null;
    const scanAge = scannedAt ? Date.now() - Date.parse(scannedAt) : Number.POSITIVE_INFINITY;
    return {
      campaigns: Array.isArray(parsed.campaigns)
        ? parsed.campaigns.filter(isFreshCampaign).slice(0, 40)
        : [],
      savedIds: Array.isArray(parsed.savedIds)
        ? parsed.savedIds.filter((id): id is string => typeof id === "string").slice(0, 200)
        : [],
      scannedAt: scanAge >= 0 && scanAge <= 14 * 24 * 60 * 60 * 1000 ? scannedAt : null,
      scanNote: typeof parsed.scanNote === "string" ? parsed.scanNote.slice(0, 220) : "",
    };
  } catch {
    return empty;
  }
}

function timeAgo(value: string | null): string {
  if (!value) return "Not scanned yet";
  const age = Date.now() - Date.parse(value);
  if (!Number.isFinite(age) || age < 0) return "Just checked";
  const minutes = Math.floor(age / 60_000);
  if (minutes < 1) return "Just checked";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function dateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function compactUsd(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function campaignKey(campaign: CampaignOpportunity): string {
  return `campaign:${campaign.id}`;
}

function yieldKey(pool: YieldPool): string {
  return `yield:${pool.id}`;
}

function campaignLabel(kind: CampaignOpportunity["kind"]): string {
  return kind === "giveaway" ? "Giveaway" : "Airdrop";
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "Unrecognized source";
  }
}

export function OpportunityRadar() {
  const [view, setView] = useState<View>("overview");
  const [campaigns, setCampaigns] = useState<CampaignOpportunity[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [scanNote, setScanNote] = useState("");
  const [pools, setPools] = useState<YieldPool[]>([]);
  const [yieldState, setYieldState] = useState<YieldState>("loading");
  const [yieldError, setYieldError] = useState("");
  const [yieldFetchedAt, setYieldFetchedAt] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanSuccess, setScanSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "apy" | "tvl">("recent");
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const yieldRequest = useRef(false);
  const hasPools = useRef(false);
  const [jobsVersion, setJobsVersion] = useState(0);
  const [confirmJobId, setConfirmJobId] = useState<string | null>(null);

  const awaitingJobs = useMemo(() => {
    // jobsVersion bumps whenever the external jobs store mutates; read it so React recomputes.
    void jobsVersion;
    if (!hydrated) return 0;
    return countAwaiting(loadJobs());
  }, [hydrated, jobsVersion]);

  const refreshYields = useCallback(async (quiet = false) => {
    if (yieldRequest.current) return;
    yieldRequest.current = true;
    if (!quiet || !hasPools.current) setYieldState("loading");
    try {
      const result = await getYieldSnapshot();
      if (result.ok) {
        hasPools.current = result.pools.length > 0;
        setPools(result.pools);
        setYieldFetchedAt(result.fetchedAt);
        setYieldError("");
        setYieldState("ready");
      } else {
        setYieldError(result.error);
        setYieldState(hasPools.current ? "ready" : "error");
      }
    } catch {
      setYieldError("The public yield feed could not be reached right now.");
      setYieldState(hasPools.current ? "ready" : "error");
    } finally {
      yieldRequest.current = false;
    }
  }, []);

  useEffect(() => {
    const stored = readSavedState();
    setCampaigns(stored.campaigns);
    setSavedIds(stored.savedIds);
    setScannedAt(stored.scannedAt);
    setScanNote(stored.scanNote);
    setHydrated(true);
    void refreshYields();

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshYields(true);
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refreshYields]);

  useEffect(() => {
    if (!hydrated) return;
    const saved: SavedState = { campaigns, savedIds, scannedAt, scanNote };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }, [campaigns, savedIds, scannedAt, scanNote, hydrated]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const latestView = VIEW_COPY[view];

  const opportunities = useMemo<Opportunity[]>(() => {
    const all: Opportunity[] = [
      ...campaigns.map((item) => ({ kind: "campaign" as const, key: campaignKey(item), item })),
      ...pools.map((item) => ({ kind: "yield" as const, key: yieldKey(item), item })),
    ];
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = all.filter((entry) => {
      if (view === "airdrops" && !(entry.kind === "campaign" && entry.item.kind === "airdrop"))
        return false;
      if (view === "giveaways" && !(entry.kind === "campaign" && entry.item.kind === "giveaway"))
        return false;
      if (view === "liquidity" && entry.kind !== "yield") return false;
      if (view === "saved" && !savedIds.includes(entry.key)) return false;
      if (!normalizedQuery) return true;
      const content =
        entry.kind === "campaign"
          ? `${entry.item.project} ${entry.item.title} ${entry.item.chain} ${entry.item.summary}`
          : `${entry.item.protocol} ${entry.item.pair} ${entry.item.chain}`;
      return content.toLowerCase().includes(normalizedQuery);
    });

    return filtered.sort((a, b) => {
      if (sortBy === "apy") {
        const aApy = a.kind === "yield" ? a.item.apy : -1;
        const bApy = b.kind === "yield" ? b.item.apy : -1;
        return bApy - aApy;
      }
      if (sortBy === "tvl") {
        const aTvl = a.kind === "yield" ? a.item.tvlUsd : -1;
        const bTvl = b.kind === "yield" ? b.item.tvlUsd : -1;
        return bTvl - aTvl;
      }
      const aTime =
        a.kind === "campaign" ? Date.parse(a.item.publishedAt) : Date.parse(yieldFetchedAt ?? "");
      const bTime =
        b.kind === "campaign" ? Date.parse(b.item.publishedAt) : Date.parse(yieldFetchedAt ?? "");
      return bTime - aTime;
    });
  }, [campaigns, pools, query, savedIds, sortBy, view, yieldFetchedAt]);

  const counts = useMemo(
    () => ({
      all: campaigns.length + pools.length,
      airdrops: campaigns.filter((item) => item.kind === "airdrop").length,
      giveaways: campaigns.filter((item) => item.kind === "giveaway").length,
      pools: pools.length,
      saved: savedIds.length,
    }),
    [campaigns, pools, savedIds],
  );

  async function runCampaignScan() {
    if (scanning) return;
    setScanning(true);
    setScanError("");
    setScanSuccess("");
    try {
      const result = await scanCampaigns();
      if (!result.ok) {
        setScanError(result.error);
        return;
      }
      setCampaigns(result.campaigns);
      setScannedAt(result.scannedAt);
      setScanNote(result.note);
      setScanSuccess(result.note);
      awardXp("scan");
      const createdJobs = appendJobsFromCampaigns(
        result.campaigns.map((campaign) => ({
          id: campaign.id,
          project: campaign.project,
          title: campaign.title,
          kind: campaign.kind,
          chain: campaign.chain,
          reward: campaign.reward,
          summary: campaign.summary,
          sourceUrl: campaign.sourceUrl,
        })),
      );
      if (createdJobs.length > 0) {
        setJobsVersion((version) => version + 1);
        setConfirmJobId(createdJobs[0].id);
        setNotice(
          `The agent found ${createdJobs.length} job${createdJobs.length === 1 ? "" : "s"} — approval card ready`,
        );
      }
      if (result.campaigns.length === 0)
        setNotice("No source-backed campaigns passed the freshness checks.");
    } catch {
      setScanError("Campaign search could not complete. No wallet action was taken.");
    } finally {
      setScanning(false);
    }
  }

  function toggleSaved(key: string) {
    setSavedIds((current) => {
      const next = current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key];
      setNotice(current.includes(key) ? "Removed from watchlist" : "Saved to watchlist");
      return next;
    });
  }

  async function copyPrompt(promptId: string) {
    const item = PROMPT_PACK.find((entry) => entry.id === promptId) ?? PROMPT_PACK[0];
    try {
      await navigator.clipboard.writeText(item.prompt);
      setCopiedId(item.id);
      setNotice(`${item.name} copied`);
      window.setTimeout(() => setCopiedId(null), 2200);
    } catch {
      const textarea = document.querySelector<HTMLTextAreaElement>("#agent-prompt");
      textarea?.focus();
      textarea?.select();
      setNotice("Prompt selected — copy it from the text box");
    }
  }

  function openOpportunity(entry: Opportunity) {
    setSelected(entry);
  }

  function renderEmptyState() {
    if (query.trim()) {
      return (
        <div className="empty-state compact-empty">
          <Search size={22} aria-hidden="true" />
          <h3>No matches found</h3>
          <p>Try a different token, protocol, campaign, or chain.</p>
        </div>
      );
    }
    if (view === "saved") {
      return (
        <div className="empty-state compact-empty">
          <Bookmark size={23} aria-hidden="true" />
          <h3>Your watchlist is clear</h3>
          <p>Save a campaign or pool to keep it here on this device.</p>
          <button className="text-button" type="button" onClick={() => setView("overview")}>
            Browse opportunities <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      );
    }
    if (view === "liquidity" && yieldState === "loading") {
      return (
        <div className="empty-state compact-empty">
          <LoaderCircle className="spin" size={22} aria-hidden="true" />
          <h3>Loading live pool data</h3>
          <p>Checking the public liquidity feed now.</p>
        </div>
      );
    }
    if (view === "liquidity" && yieldState === "error") {
      return (
        <div className="empty-state compact-empty">
          <TriangleAlert size={22} aria-hidden="true" />
          <h3>Pool data is temporarily unavailable</h3>
          <p>{yieldError || "Try the public feed again in a moment."}</p>
          <button className="text-button" type="button" onClick={() => void refreshYields()}>
            Retry feed <RefreshCw size={15} aria-hidden="true" />
          </button>
        </div>
      );
    }
    if ((view === "airdrops" || view === "giveaways") && scannedAt) {
      return (
        <div className="empty-state compact-empty">
          <ShieldCheck size={23} aria-hidden="true" />
          <h3>No fresh, source-backed results</h3>
          <p>{scanNote || "Nothing from the latest scan passed the date and source checks."}</p>
          <button className="text-button" type="button" onClick={() => void runCampaignScan()}>
            Scan again <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      );
    }
    if (
      view === "overview" &&
      campaigns.length === 0 &&
      pools.length === 0 &&
      yieldState === "loading"
    ) {
      return (
        <div className="empty-state compact-empty">
          <LoaderCircle className="spin" size={22} aria-hidden="true" />
          <h3>Connecting to public feeds</h3>
          <p>Live liquidity data will appear here when the feed responds.</p>
        </div>
      );
    }
    return (
      <div className="empty-state">
        <div className="empty-orbit">
          <Radar size={28} aria-hidden="true" />
        </div>
        <span className="micro-label">No confirmed campaigns yet</span>
        <h3>Start with a source-backed scan</h3>
        <p>
          Search recent public announcements. Only campaigns with a dated source link make it into
          the feed, and each one stays marked for your review.
        </p>
        <button
          className="primary-button small-primary"
          type="button"
          onClick={() => void runCampaignScan()}
          disabled={scanning}
        >
          {scanning ? (
            <LoaderCircle className="spin" size={16} aria-hidden="true" />
          ) : (
            <Radar size={16} aria-hidden="true" />
          )}
          {scanning ? "Scanning sources…" : "Scan campaign sources"}
        </button>
        <span className="empty-footnote">
          No wallet connection · no auto-claims · no guaranteed rewards
        </span>
      </div>
    );
  }

  return (
    <div className="scout-shell">
      <aside className="sidebar">
        <a
          className="brand-lockup"
          href="#overview"
          onClick={(event) => {
            event.preventDefault();
            setView("overview");
          }}
          aria-label="ChainScout overview"
        >
          <span className="brand-icon">
            <Radar size={21} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <span className="brand-wordmark">
            chain<span>scout</span>
            <sup>beta</sup>
          </span>
        </a>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {VIEWS.map(({ id, label, icon: Icon }) => {
            const count =
              id === "jobs"
                ? awaitingJobs
                : id === "airdrops"
                  ? counts.airdrops
                  : id === "giveaways"
                    ? counts.giveaways
                    : id === "liquidity"
                      ? counts.pools
                      : id === "saved"
                        ? counts.saved
                        : null;
            return (
              <button
                className={`nav-link ${view === id ? "is-active" : ""}`}
                type="button"
                key={id}
                onClick={() => setView(id)}
                aria-current={view === id ? "page" : undefined}
              >
                <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
                <span>{label}</span>
                {count !== null ? <span className="nav-count">{count}</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-spacer" />
        <div className="read-only-card">
          <div className="read-only-icon">
            <ShieldCheck size={16} aria-hidden="true" />
          </div>
          <div>
            <strong>Read-only by design</strong>
            <span>No wallet connect or transaction signing.</span>
          </div>
        </div>
        <div className="sidebar-footer">
          <span className="avatar-small">CS</span>
          <div className="footer-user">
            <strong>Personal workspace</strong>
            <span>Saved on this device</span>
          </div>
          <span className="local-dot" title="Local-only preferences" />
        </div>
      </aside>

      <div className="main-panel">
        <header className="topbar">
          <div className="crumbs">
            <span>Workspace</span>
            <span className="crumb-divider">/</span>
            <strong>{latestView.title}</strong>
          </div>
          <div className="topbar-right">
            <div
              className={`feed-status ${yieldState === "ready" ? "feed-live" : yieldState === "error" ? "feed-offline" : "feed-syncing"}`}
            >
              <span className="status-dot" />
              {yieldState === "ready"
                ? "Public feeds live"
                : yieldState === "error"
                  ? "Feed unavailable"
                  : "Syncing feeds"}
            </div>
            <button
              className="icon-button top-refresh"
              type="button"
              onClick={() => void refreshYields()}
              aria-label="Refresh live pool feed"
              title="Refresh live pool feed"
            >
              <RefreshCw size={16} aria-hidden="true" />
            </button>
          </div>
        </header>

        <main className="dashboard-content">
          <section className="page-heading">
            <div className="heading-copy">
              <div className="eyebrow-line">
                <span className="eyebrow-dot" />
                {latestView.eyebrow}
              </div>
              <h1>{latestView.title}</h1>
              <p>{latestView.description}</p>
            </div>
            <div className="heading-actions">
              {view === "playbook" || view === "earn" || view === "earnings" || view === "agent" ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() =>
                    void copyPrompt(view === "earnings" ? "weekly-review" : "daily-scan")
                  }
                >
                  {copiedId ? (
                    <Check size={17} aria-hidden="true" />
                  ) : (
                    <Copy size={16} aria-hidden="true" />
                  )}
                  {copiedId
                    ? "Copied"
                    : view === "earnings"
                      ? "Copy weekly review"
                      : "Copy daily automation"}
                </button>
              ) : (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void runCampaignScan()}
                  disabled={scanning}
                >
                  {scanning ? (
                    <LoaderCircle className="spin" size={17} aria-hidden="true" />
                  ) : (
                    <Radar size={17} aria-hidden="true" />
                  )}
                  {scanning ? "Scanning…" : "Scan campaigns"}
                </button>
              )}
              {view === "playbook" || view === "earn" || view === "earnings" || view === "agent" ? (
                <span className="scan-meta">Research only · no transaction execution</span>
              ) : (
                <span className="scan-meta">Manual scan · source links required</span>
              )}
            </div>
          </section>

          {scanError ? (
            <div className="alert-panel" role="alert">
              <div className="alert-icon">
                <TriangleAlert size={17} aria-hidden="true" />
              </div>
              <div>
                <strong>Campaign scan unavailable</strong>
                <p>{scanError}</p>
              </div>
              <button
                className="alert-dismiss"
                type="button"
                onClick={() => setScanError("")}
                aria-label="Dismiss message"
              >
                <X size={16} />
              </button>
            </div>
          ) : null}
          {scanSuccess ? (
            <div className="success-panel" role="status">
              <CheckCircle2 size={17} aria-hidden="true" />
              <p>{scanSuccess}</p>
              <button
                className="alert-dismiss"
                type="button"
                onClick={() => setScanSuccess("")}
                aria-label="Dismiss message"
              >
                <X size={16} />
              </button>
            </div>
          ) : null}

          {view === "playbook" ||
          view === "earn" ||
          view === "earnings" ||
          view === "quests" ||
          view === "brain" ||
          view === "agent" ? null : (
            <>
              {view === "overview" && awaitingJobs > 0 ? (
                <button className="jobs-peek-card" type="button" onClick={() => setView("jobs")}>
                  <span className="jobs-peek-icon" aria-hidden="true">
                    <Briefcase size={18} />
                  </span>
                  <span className="jobs-peek-copy">
                    <strong>
                      Your agent has {awaitingJobs} job{awaitingJobs === 1 ? "" : "s"} waiting for
                      your OK
                    </strong>
                    <span>Open the approval cards — work only starts when you tap approve.</span>
                  </span>
                  <span className="jobs-peek-cta">
                    Review jobs <ArrowRight size={15} aria-hidden="true" />
                  </span>
                </button>
              ) : null}
              <section className="stat-grid" aria-label="Opportunity summary">
                <StatCard
                  icon={Activity}
                  label="Tracked signals"
                  value={counts.all.toString()}
                  footnote={
                    campaigns.length
                      ? `${campaigns.length} campaign · ${pools.length} pool`
                      : `${pools.length} live pool snapshot${pools.length === 1 ? "" : "s"}`
                  }
                  accent="mint"
                />
                <StatCard
                  icon={Sparkles}
                  label="Campaigns found"
                  value={campaigns.length.toString()}
                  footnote={
                    scannedAt ? `Last scan ${timeAgo(scannedAt)}` : "Run a manual source scan"
                  }
                  accent="lime"
                />
                <StatCard
                  icon={TrendingUp}
                  label="Liquidity snapshots"
                  value={pools.length.toString()}
                  footnote={
                    yieldFetchedAt
                      ? `Updated ${timeAgo(yieldFetchedAt)}`
                      : yieldState === "loading"
                        ? "Checking public feed…"
                        : "Feed not connected"
                  }
                  accent="blue"
                />
                <StatCard
                  icon={Bookmark}
                  label="Watchlist"
                  value={counts.saved.toString()}
                  footnote="Stored locally on this device"
                  accent="amber"
                />
              </section>

              <section className="safety-strip" aria-label="Safety note">
                <ShieldAlert size={18} aria-hidden="true" />
                <p>
                  <strong>No daily income is guaranteed.</strong> Airdrops may pay nothing;
                  liquidity can lose principal. Verify every source independently.
                </p>
                <span className="safety-strip-tag">Research only</span>
              </section>
            </>
          )}

          {view === "playbook" ? (
            <PlaybookView onCopyPrompt={(id) => void copyPrompt(id)} />
          ) : view === "quests" ? (
            <DailyGoalView onNavigate={(target) => setView(target)} />
          ) : view === "brain" ? (
            <AgentBrainView />
          ) : view === "jobs" ? (
            <JobsBoard
              confirmJobId={confirmJobId}
              onConfirmConsumed={() => setConfirmJobId(null)}
              reloadKey={jobsVersion}
              onOpenEarnings={() => setView("earnings")}
            />
          ) : view === "earn" ? (
            <EarningsEngine pools={pools} />
          ) : view === "earnings" ? (
            <EarningsTracker />
          ) : view === "agent" ? (
            <PromptPackView copiedId={copiedId} onCopy={(id) => void copyPrompt(id)} />
          ) : (
            <section className="feed-section" aria-labelledby="feed-title">
              <div className="feed-heading-row">
                <div>
                  <div className="section-kicker">
                    <span className="live-mark" />
                    LIVE RESEARCH FEED
                  </div>
                  <h2 id="feed-title">
                    {view === "saved"
                      ? "Your watchlist"
                      : view === "liquidity"
                        ? "Liquidity opportunities"
                        : "Fresh signals"}
                  </h2>
                  <p className="feed-subtitle">
                    {view === "liquidity"
                      ? `DeFiLlama snapshot${yieldFetchedAt ? ` · refreshed ${timeAgo(yieldFetchedAt)}` : ""}. Not a recommendation.`
                      : scannedAt
                        ? `Campaign sources checked ${timeAgo(scannedAt)} · ${scanNote || "Review dates and source links before acting."}`
                        : "Campaign results appear after a manual scan. Public pool data refreshes while this page is open."}
                  </p>
                </div>
                <span className="result-count">
                  {opportunities.length} {opportunities.length === 1 ? "result" : "results"}
                </span>
              </div>

              <div className="feed-toolbar">
                <label className="search-field">
                  <Search size={17} aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search protocol, chain, or campaign"
                    aria-label="Search opportunities"
                  />
                  {query ? (
                    <button
                      type="button"
                      className="clear-search"
                      onClick={() => setQuery("")}
                      aria-label="Clear search"
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </label>
                <label className="sort-select">
                  <span>Sort by</span>
                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value as "recent" | "apy" | "tvl")}
                    aria-label="Sort results"
                  >
                    <option value="recent">Most recent</option>
                    <option value="apy">Highest APY</option>
                    <option value="tvl">Largest TVL</option>
                  </select>
                </label>
                <button
                  className="refresh-button"
                  type="button"
                  onClick={() => void refreshYields()}
                  aria-label="Refresh liquidity data"
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  <span>Refresh</span>
                </button>
              </div>

              {yieldError && view !== "liquidity" && pools.length === 0 ? (
                <div className="feed-inline-warning">
                  <TriangleAlert size={16} aria-hidden="true" />
                  <span>
                    Live liquidity data is currently unavailable. Campaign search can still be run
                    separately.
                  </span>
                </div>
              ) : null}

              {opportunities.length === 0 ? (
                renderEmptyState()
              ) : (
                <div className="opportunity-list">
                  {opportunities
                    .slice(0, 24)
                    .map((entry) =>
                      entry.kind === "campaign" ? (
                        <CampaignCard
                          key={entry.key}
                          campaign={entry.item}
                          saved={savedIds.includes(entry.key)}
                          onSave={() => toggleSaved(entry.key)}
                          onOpen={() => openOpportunity(entry)}
                        />
                      ) : (
                        <YieldCard
                          key={entry.key}
                          pool={entry.item}
                          fetchedAt={yieldFetchedAt}
                          saved={savedIds.includes(entry.key)}
                          onSave={() => toggleSaved(entry.key)}
                          onOpen={() => openOpportunity(entry)}
                        />
                      ),
                    )}
                </div>
              )}
              <div className="feed-bottom-note">
                <ShieldCheck size={15} aria-hidden="true" />
                <span>
                  Research only. ChainScout never connects a wallet, signs, claims, trades, or
                  deposits.
                </span>
              </div>
            </section>
          )}

          <footer className="page-footer">
            <span>
              ChainScout <span className="footer-divider">·</span> Public data, independent
              decisions
            </span>
            <span>Never share a seed phrase or private key</span>
          </footer>
        </main>
      </div>

      <OpportunityDialog opportunity={selected} onClose={() => setSelected(null)} />
      {notice ? (
        <div className="toast-message" role="status" aria-live="polite">
          <CheckCircle2 size={16} aria-hidden="true" />
          {notice}
        </div>
      ) : null}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  footnote,
  accent,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  footnote: string;
  accent: "mint" | "lime" | "blue" | "amber";
}) {
  return (
    <article className={`stat-card stat-${accent}`}>
      <div className="stat-topline">
        <span>{label}</span>
        <span className="stat-icon">
          <Icon size={17} aria-hidden="true" />
        </span>
      </div>
      <strong className="stat-value">{value}</strong>
      <span className="stat-footnote">{footnote}</span>
    </article>
  );
}

function CampaignCard({
  campaign,
  saved,
  onSave,
  onOpen,
}: {
  campaign: CampaignOpportunity;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
}) {
  const isGiveaway = campaign.kind === "giveaway";
  return (
    <article className="opportunity-card campaign-card">
      <div className="card-main-row">
        <div
          className={`project-avatar ${isGiveaway ? "avatar-giveaway" : "avatar-airdrop"}`}
          aria-hidden="true"
        >
          {isGiveaway ? <Gift size={19} /> : <Sparkles size={19} />}
        </div>
        <div className="card-title-block">
          <div className="card-title-line">
            <h3>{campaign.project}</h3>
            <span className={`kind-chip ${isGiveaway ? "kind-giveaway" : "kind-airdrop"}`}>
              {campaignLabel(campaign.kind)}
            </span>
          </div>
          <p className="card-subtitle">{campaign.title}</p>
        </div>
        <button
          className={`save-control ${saved ? "saved" : ""}`}
          type="button"
          onClick={onSave}
          aria-label={saved ? "Remove from watchlist" : "Save to watchlist"}
          aria-pressed={saved}
          title={saved ? "Saved" : "Save opportunity"}
        >
          <Bookmark size={17} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
        </button>
      </div>

      <p className="campaign-summary">{campaign.summary}</p>
      <div className="campaign-detail-grid">
        <div>
          <span>CHAIN</span>
          <strong>{campaign.chain}</strong>
        </div>
        <div>
          <span>REWARD</span>
          <strong>{campaign.reward}</strong>
        </div>
        <div>
          <span>SOURCE DATE</span>
          <strong>{dateTime(campaign.publishedAt)}</strong>
        </div>
        <div>
          <span>ENDS</span>
          <strong>{campaign.expiresAt ? dateTime(campaign.expiresAt) : "Not stated"}</strong>
        </div>
      </div>
      <div className="card-bottom-row">
        <span className="review-badge">
          <ShieldAlert size={13} aria-hidden="true" />
          Review source before action
        </span>
        <button className="card-action" type="button" onClick={onOpen}>
          Review details <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function YieldCard({
  pool,
  fetchedAt,
  saved,
  onSave,
  onOpen,
}: {
  pool: YieldPool;
  fetchedAt: string | null;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
}) {
  const elevated = pool.apy >= 20;
  return (
    <article className="opportunity-card yield-card">
      <div className="card-main-row">
        <div className="project-avatar avatar-yield" aria-hidden="true">
          <Coins size={19} />
        </div>
        <div className="card-title-block">
          <div className="card-title-line">
            <h3>{pool.protocol}</h3>
            <span className={`kind-chip ${elevated ? "kind-risk" : "kind-live"}`}>
              {elevated ? "Elevated APY" : "Live snapshot"}
            </span>
          </div>
          <p className="card-subtitle">
            {pool.pair} <span className="middle-dot">·</span> {pool.chain}
          </p>
        </div>
        <button
          className={`save-control ${saved ? "saved" : ""}`}
          type="button"
          onClick={onSave}
          aria-label={saved ? "Remove from watchlist" : "Save to watchlist"}
          aria-pressed={saved}
          title={saved ? "Saved" : "Save pool"}
        >
          <Bookmark size={17} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
        </button>
      </div>
      <div className="yield-metrics">
        <div className="apy-metric">
          <span>Current APY</span>
          <strong>
            {pool.apy.toFixed(2)}
            <small>%</small>
          </strong>
        </div>
        <div>
          <span>Pool TVL</span>
          <strong>{compactUsd(pool.tvlUsd)}</strong>
        </div>
        <div>
          <span>Base / reward</span>
          <strong>
            {pool.baseApy.toFixed(2)}% <em>/</em> {pool.rewardApy.toFixed(2)}%
          </strong>
        </div>
      </div>
      <div className="card-bottom-row">
        <div className="pool-badges">
          {pool.stablecoin ? (
            <span className="stable-badge">
              <CheckCircle2 size={12} aria-hidden="true" />
              Stablecoin pool
            </span>
          ) : (
            <span className="variable-badge">
              <Activity size={12} aria-hidden="true" />
              Variable assets
            </span>
          )}
          <span className="source-time">
            <Clock3 size={12} aria-hidden="true" />
            {fetchedAt ? `Updated ${timeAgo(fetchedAt)}` : "Live data"}
          </span>
        </div>
        <button className="card-action" type="button" onClick={onOpen}>
          Pool details <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function PromptPackView({
  copiedId,
  onCopy,
}: {
  copiedId: string | null;
  onCopy: (promptId: string) => void;
}) {
  const [activeId, setActiveId] = useState(PROMPT_PACK[0].id);
  const active = PROMPT_PACK.find((item) => item.id === activeId) ?? PROMPT_PACK[0];

  return (
    <section className="agent-brief-section">
      <div className="agent-intro-card">
        <div className="agent-symbol">
          <Bot size={22} aria-hidden="true" />
        </div>
        <div>
          <span className="micro-label">AUTOMATION BLUEPRINT</span>
          <h2>Four prompts that run the whole operation</h2>
          <p>
            Copy each brief into an agent with web browsing and scheduled tasks. They ask for dated
            evidence, exclude common wallet traps, and explicitly block transactions — automation
            that researches for you, never one that moves your money.
          </p>
        </div>
      </div>

      <div className="prompt-pack-tabs" role="tablist" aria-label="Automation prompts">
        {PROMPT_PACK.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={activeId === item.id}
            className={`prompt-pack-tab ${activeId === item.id ? "is-active" : ""}`}
            onClick={() => setActiveId(item.id)}
          >
            <strong>{item.name}</strong>
            <span>{item.when}</span>
          </button>
        ))}
      </div>

      <div className="agent-layout-grid">
        <div className="prompt-panel">
          <div className="prompt-panel-header">
            <div>
              <span className="section-kicker">{active.when.toUpperCase()}</span>
              <span className="prompt-readonly">Ready to copy</span>
            </div>
            <button
              className="secondary-button copy-prompt-button"
              type="button"
              onClick={() => onCopy(active.id)}
            >
              {copiedId === active.id ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <Copy size={16} aria-hidden="true" />
              )}
              {copiedId === active.id ? "Copied" : "Copy prompt"}
            </button>
          </div>
          <textarea
            id="agent-prompt"
            value={active.prompt}
            readOnly
            rows={18}
            aria-label={`Automation prompt: ${active.name}`}
          />
          <div className="prompt-footnote">
            <ShieldCheck size={14} aria-hidden="true" />
            {active.summary} Your agent still needs a browser/search tool and its own schedule.
            Nothing here can guarantee earnings.
          </div>
        </div>

        <aside className="agent-setup-card">
          <span className="section-kicker">SETUP CHECKLIST</span>
          <ol className="setup-list">
            <li>
              <span>01</span>
              <div>
                <strong>Choose a browsing agent</strong>
                <p>
                  Use an agent with web search and scheduled tasks. This dashboard does not run in
                  the background when closed.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Set the schedule</strong>
                <p>
                  Daily scan at 08:00 UTC, offer-vetting on demand, weekly review each Sunday,
                  withdrawal brief every time you cash out.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Review evidence yourself</strong>
                <p>
                  Open official sources independently. Ignore DMs, paid unlocks, seed-phrase
                  requests, and surprise approvals.
                </p>
              </div>
            </li>
            <li>
              <span>04</span>
              <div>
                <strong>Log results in the tracker</strong>
                <p>
                  Every payout gets an entry and moves pending → received → withdrawn. That log is
                  what turns "opportunity" into real, withdrawable earnings.
                </p>
              </div>
            </li>
          </ol>
          <div className="no-wallet-callout">
            <ShieldAlert size={16} aria-hidden="true" />
            <span>
              <strong>No wallet automation.</strong> Nothing here claims, signs, trades, bridges, or
              deposits — and no legitimate service can guarantee earnings.
            </span>
          </div>
          <button className="text-button" type="button" onClick={() => onCopy("daily-scan")}>
            Copy the daily brief <ArrowRight size={15} aria-hidden="true" />
          </button>
        </aside>
      </div>
    </section>
  );
}

function OpportunityDialog({
  opportunity,
  onClose,
}: {
  opportunity: Opportunity | null;
  onClose: () => void;
}) {
  const isCampaign = opportunity?.kind === "campaign";
  const campaign = isCampaign ? opportunity.item : null;
  const pool = opportunity?.kind === "yield" ? opportunity.item : null;
  const title = campaign ? campaign.project : (pool?.protocol ?? "Opportunity details");

  return (
    <Dialog.Root
      open={Boolean(opportunity)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="details-dialog">
          <div className="dialog-header">
            <div>
              <span className="section-kicker">
                {campaign ? "CAMPAIGN SOURCE CHECK" : "LIVE POOL SNAPSHOT"}
              </span>
              <Dialog.Title className="dialog-title">{title}</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button className="icon-button dialog-close" type="button" aria-label="Close details">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          {campaign ? (
            <>
              <Dialog.Description className="dialog-description">
                {campaign.summary}
              </Dialog.Description>
              <div className="dialog-data-grid">
                <div>
                  <span>Campaign type</span>
                  <strong>{campaignLabel(campaign.kind)}</strong>
                </div>
                <div>
                  <span>Chain</span>
                  <strong>{campaign.chain}</strong>
                </div>
                <div>
                  <span>Potential reward</span>
                  <strong>{campaign.reward}</strong>
                </div>
                <div>
                  <span>Source posted</span>
                  <strong>{dateTime(campaign.publishedAt)}</strong>
                </div>
                <div>
                  <span>Ends</span>
                  <strong>
                    {campaign.expiresAt ? dateTime(campaign.expiresAt) : "No date provided"}
                  </strong>
                </div>
                <div>
                  <span>Scanner checked</span>
                  <strong>{dateTime(campaign.checkedAt)}</strong>
                </div>
                <div>
                  <span>Reported source</span>
                  <strong>
                    {campaign.sourceLabel} · {sourceHost(campaign.sourceUrl)}
                  </strong>
                </div>
              </div>
              {campaign.requirements.length > 0 ? (
                <div className="requirements-box">
                  <h3>Reported public steps</h3>
                  <ul>
                    {campaign.requirements.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="dialog-links">
                <a href={campaign.sourceUrl} target="_blank" rel="noopener noreferrer">
                  Open source evidence <ExternalLink size={15} aria-hidden="true" />
                </a>
                {campaign.projectUrl ? (
                  <a href={campaign.projectUrl} target="_blank" rel="noopener noreferrer">
                    Open reported project site <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                ) : null}
              </div>
              <div className="dialog-warning">
                <TriangleAlert size={17} aria-hidden="true" />
                <p>
                  <strong>AI-found does not mean verified.</strong> Check that the account and
                  domain are linked from the project's established channels. Never connect a wallet
                  or sign anything just to inspect an offer.
                </p>
              </div>
            </>
          ) : pool ? (
            <>
              <Dialog.Description className="dialog-description">
                {pool.pair} on {pool.chain}. This public data snapshot is informational only and may
                change at any time.
              </Dialog.Description>
              <div className="dialog-data-grid">
                <div>
                  <span>Current APY</span>
                  <strong>{pool.apy.toFixed(2)}%</strong>
                </div>
                <div>
                  <span>Pool TVL</span>
                  <strong>{compactUsd(pool.tvlUsd)}</strong>
                </div>
                <div>
                  <span>Base APY</span>
                  <strong>{pool.baseApy.toFixed(2)}%</strong>
                </div>
                <div>
                  <span>Reward APY</span>
                  <strong>{pool.rewardApy.toFixed(2)}%</strong>
                </div>
                <div>
                  <span>Stablecoin label</span>
                  <strong>{pool.stablecoin ? "Yes, per source" : "No / not indicated"}</strong>
                </div>
                <div>
                  <span>Impermanent-loss field</span>
                  <strong>{pool.impermanentLoss || "Not reported"}</strong>
                </div>
              </div>
              <div className="dialog-warning">
                <TriangleAlert size={17} aria-hidden="true" />
                <p>
                  <strong>Liquidity can lose principal.</strong> APY is variable and excludes your
                  personal costs. Smart-contract, token, oracle, bridge, liquidation, and
                  impermanent-loss risks may apply.
                </p>
              </div>
              <div className="dialog-links">
                <a href={pool.poolUrl} target="_blank" rel="noopener noreferrer">
                  Review pool on DeFiLlama <ExternalLink size={15} aria-hidden="true" />
                </a>
              </div>
            </>
          ) : null}
          <div className="dialog-footer">
            <ShieldCheck size={15} aria-hidden="true" />
            Research only · ChainScout does not connect to your wallet.
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
