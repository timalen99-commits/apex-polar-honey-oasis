import { createServerFn } from "@tanstack/react-start";

export type CampaignOpportunity = {
  id: string;
  kind: "airdrop" | "giveaway";
  project: string;
  title: string;
  chain: string;
  summary: string;
  reward: string;
  requirements: string[];
  publishedAt: string;
  expiresAt: string | null;
  sourceLabel: string;
  sourceUrl: string;
  projectUrl: string | null;
  checkedAt: string;
};

export type YieldPool = {
  id: string;
  protocol: string;
  chain: string;
  pair: string;
  apy: number;
  baseApy: number;
  rewardApy: number;
  tvlUsd: number;
  stablecoin: boolean;
  impermanentLoss: string | null;
  poolUrl: string;
};

export type YieldSnapshot =
  | { ok: true; pools: YieldPool[]; fetchedAt: string; totalPools: number }
  | { ok: false; error: string };

export type CampaignScanResult =
  | { ok: true; campaigns: CampaignOpportunity[]; scannedAt: string; note: string }
  | { ok: false; error: string; code: "not-configured" | "cooldown" | "unavailable" };

type LlamaPool = {
  pool?: unknown;
  project?: unknown;
  chain?: unknown;
  symbol?: unknown;
  apy?: unknown;
  apyBase?: unknown;
  apyReward?: unknown;
  tvlUsd?: unknown;
  stablecoin?: unknown;
  ilRisk?: unknown;
};

type RawCampaign = {
  type?: unknown;
  project?: unknown;
  title?: unknown;
  chain?: unknown;
  summary?: unknown;
  reward?: unknown;
  requirements?: unknown;
  publishedAt?: unknown;
  expiresAt?: unknown;
  sourceLabel?: unknown;
  sourceUrl?: unknown;
  projectUrl?: unknown;
};

type Cache = { at: number; snapshot: YieldSnapshot };

const YIELDS_URL = "https://yields.llama.fi/pools";
const YIELD_CACHE_MS = 60_000;
const SCAN_COOLDOWN_MS = 120_000;
const MIN_POOL_TVL_USD = 500_000;
const MAX_POOL_APY = 150;

let yieldCache: Cache | null = null;
let lastCampaignScan = 0;
let campaignScanInFlight = false;

function cleanText(value: unknown, max = 240): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function finiteNumber(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function safeHttpsUrl(value: unknown): string | null {
  const text = cleanText(value, 500);
  if (!text || !/^https:\/\//i.test(text)) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (!url.hostname.includes(".") || url.hostname.endsWith(".")) return null;
    if (url.hostname === "localhost" || /^\d+(?:\.\d+){3}$/.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function mapPool(raw: LlamaPool): YieldPool | null {
  const id = cleanText(raw.pool, 100);
  const protocol = cleanText(raw.project, 80);
  const chain = cleanText(raw.chain, 50);
  const pair = cleanText(raw.symbol, 100);
  const apy = finiteNumber(raw.apy);
  const tvlUsd = finiteNumber(raw.tvlUsd);
  if (!id || !protocol || !chain || !pair) return null;
  if (apy <= 0 || apy > MAX_POOL_APY || tvlUsd < MIN_POOL_TVL_USD) return null;

  return {
    id,
    protocol,
    chain,
    pair,
    apy: Math.round(apy * 100) / 100,
    baseApy: Math.max(0, Math.round(finiteNumber(raw.apyBase) * 100) / 100),
    rewardApy: Math.max(0, Math.round(finiteNumber(raw.apyReward) * 100) / 100),
    tvlUsd: Math.round(tvlUsd),
    stablecoin: raw.stablecoin === true,
    impermanentLoss: cleanText(raw.ilRisk, 24) || null,
    poolUrl: `https://defillama.com/yields/pool/${encodeURIComponent(id)}`,
  };
}

export const getYieldSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<YieldSnapshot> => {
    const now = Date.now();
    if (yieldCache && now - yieldCache.at < YIELD_CACHE_MS) return yieldCache.snapshot;

    try {
      const response = await fetch(YIELDS_URL, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) {
        return { ok: false, error: `The public yield feed returned ${response.status}.` };
      }

      const body: unknown = await response.json();
      const data =
        body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data)
          ? ((body as { data: LlamaPool[] }).data ?? [])
          : [];
      const pools = data
        .map(mapPool)
        .filter((pool): pool is YieldPool => pool !== null)
        .sort((a, b) => b.tvlUsd - a.tvlUsd)
        .slice(0, 40);
      if (pools.length === 0) {
        return {
          ok: false,
          error: "The public yield feed returned no pools that pass the basic data filters.",
        };
      }

      const snapshot: YieldSnapshot = {
        ok: true,
        pools,
        fetchedAt: new Date(now).toISOString(),
        totalPools: pools.length,
      };
      yieldCache = { at: now, snapshot };
      return snapshot;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The public yield feed could not be reached.";
      if (/abort|timeout/i.test(message)) {
        return { ok: false, error: "The public yield feed timed out. Try refreshing in a moment." };
      }
      return { ok: false, error: "The public yield feed could not be reached right now." };
    }
  },
);

function extractText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const record = body as { output_text?: unknown; output?: unknown };
  if (typeof record.output_text === "string") return record.output_text;
  if (!Array.isArray(record.output)) return "";

  const chunks: string[] = [];
  for (const item of record.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") chunks.push(text);
    }
  }
  return chunks.join("\n");
}

function parseCampaigns(
  text: string,
  checkedAt: string,
): { campaigns: CampaignOpportunity[]; note: string } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start)
    throw new Error("The search returned no structured campaign list.");

  const parsed = JSON.parse(text.slice(start, end + 1)) as {
    campaigns?: unknown;
    note?: unknown;
  };
  const now = Date.parse(checkedAt);
  const lookbackMs = 14 * 24 * 60 * 60 * 1000;
  const campaigns = Array.isArray(parsed.campaigns)
    ? parsed.campaigns
        .slice(0, 8)
        .map((item): CampaignOpportunity | null => {
          const raw = (item ?? {}) as RawCampaign;
          const project = cleanText(raw.project, 80);
          const title = cleanText(raw.title, 120);
          const summary = cleanText(raw.summary, 420);
          const sourceUrl = safeHttpsUrl(raw.sourceUrl);
          const projectUrl = safeHttpsUrl(raw.projectUrl);
          const publishedAt = cleanText(raw.publishedAt, 50);
          const publishedMs = Date.parse(publishedAt);
          if (
            !project ||
            !title ||
            !summary ||
            !sourceUrl ||
            !Number.isFinite(publishedMs) ||
            publishedMs > now + 60_000 ||
            now - publishedMs > lookbackMs
          ) {
            return null;
          }

          const expiresAtText = cleanText(raw.expiresAt, 50);
          const expiresAtDate = expiresAtText ? new Date(expiresAtText) : null;
          const expiresAt =
            expiresAtDate && !Number.isNaN(expiresAtDate.getTime())
              ? expiresAtDate.toISOString()
              : null;
          if (expiresAt && Date.parse(expiresAt) < now) return null;

          const rawRequirements = Array.isArray(raw.requirements) ? raw.requirements : [];
          const requirements = rawRequirements
            .map((step) => cleanText(step, 140))
            .filter(Boolean)
            .slice(0, 4);
          const kind =
            cleanText(raw.type, 24).toLowerCase() === "giveaway" ? "giveaway" : "airdrop";
          const idBase = `${project}-${publishedAt}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

          return {
            id: `${kind}-${idBase}`,
            kind,
            project,
            title,
            chain: cleanText(raw.chain, 48) || "Not specified",
            summary,
            reward: cleanText(raw.reward, 100) || "Not disclosed",
            requirements,
            publishedAt: new Date(publishedMs).toISOString(),
            expiresAt,
            sourceLabel: cleanText(raw.sourceLabel, 50) || "Public source",
            sourceUrl,
            projectUrl,
            checkedAt,
          };
        })
        .filter((item): item is CampaignOpportunity => item !== null)
    : [];

  return {
    campaigns,
    note:
      cleanText(parsed.note, 220) ||
      "Campaign search finished. Review each source before taking action.",
  };
}

export const scanCampaigns = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (input && typeof input === "object") return {};
    return {};
  })
  .handler(async (): Promise<CampaignScanResult> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        code: "not-configured",
        error:
          "Live campaign search is not connected in this environment. Use the agent brief to run a source-backed scan with your preferred browsing agent.",
      };
    }

    const now = Date.now();
    if (campaignScanInFlight) {
      return { ok: false, code: "cooldown", error: "A campaign scan is already running." };
    }
    if (now - lastCampaignScan < SCAN_COOLDOWN_MS) {
      return {
        ok: false,
        code: "cooldown",
        error: "Please wait two minutes before starting another live campaign scan.",
      };
    }

    campaignScanInFlight = true;
    lastCampaignScan = now;
    const scannedAt = new Date(now).toISOString();
    const fromDate = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const toDate = new Date(now + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    try {
      const response = await fetch("https://api.x.ai/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(50_000),
        body: JSON.stringify({
          model: "grok-4.7",
          max_output_tokens: 2800,
          input: [
            {
              role: "user",
              content: `Current UTC time: ${scannedAt}.
Search public X posts from the last 14 days for active crypto airdrops, retroactive reward programs, and no-purchase crypto giveaways. Search at most twice. Prefer announcements from official project accounts; only call a source official if you can establish the account or domain is linked by the project. Exclude expired campaigns, referral spam, unsolicited DMs, guaranteed-profit claims, and any offer asking for an upfront payment, seed phrase, recovery phrase, private key, or a transfer to unlock a prize. Do not invent campaigns, dates, reward amounts, task requirements, or URLs. Never suggest signing or sending a transaction.
Return ONLY JSON in this shape: {"note":"short summary","campaigns":[{"type":"airdrop|giveaway","project":"","title":"","chain":"","summary":"one concise factual sentence","reward":"known reward or Not disclosed","requirements":["public task only"],"publishedAt":"ISO-8601 date of source post","expiresAt":"ISO-8601 date or empty string","sourceLabel":"official account or source","sourceUrl":"https:// full source post URL","projectUrl":"https:// official project URL or empty string"}]}. Return at most 8 items. An empty campaigns array is better than uncertain results.`,
            },
          ],
          tools: [{ type: "x_search", from_date: fromDate, to_date: toDate }],
        }),
      });

      if (!response.ok) {
        const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 160);
        if (response.status === 402 || /credit|quota|billing/i.test(detail)) {
          return {
            ok: false,
            code: "unavailable",
            error:
              "Live search is temporarily out of credits. The agent brief is still available, and no wallet actions were taken.",
          };
        }
        return {
          ok: false,
          code: "unavailable",
          error: `Campaign search could not complete (${response.status}). ${detail}`,
        };
      }

      const body: unknown = await response.json();
      const { campaigns, note } = parseCampaigns(extractText(body), scannedAt);
      return { ok: true, campaigns, scannedAt, note };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Campaign search could not complete.";
      if (/abort|timeout/i.test(message)) {
        return {
          ok: false,
          code: "unavailable",
          error: "Campaign search took too long. Try again later.",
        };
      }
      return {
        ok: false,
        code: "unavailable",
        error: "Campaign search returned an unreadable response. Try again later.",
      };
    } finally {
      campaignScanInFlight = false;
    }
  });
