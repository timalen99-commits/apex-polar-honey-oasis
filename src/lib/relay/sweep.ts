import { createServerFn } from "@tanstack/react-start";
import {
  DEFAULT_DESK,
  inferOlderUsa,
  joinedFromId,
  type Commenter,
  type RelayPost,
} from "@/lib/relay/model";

export type SweepResult =
  | { ok: true; posts: RelayPost[]; note: string; sweptAt: string }
  | { ok: false; error: string };

const DESK = DEFAULT_DESK.join(", ");
let lastSweep = 0;
let inflight = false;

type RawCommenter = {
  handle?: unknown;
  name?: unknown;
  bio?: unknown;
  userId?: unknown;
};

type RawPost = {
  id?: unknown;
  text?: unknown;
  postedAt?: unknown;
  authorName?: unknown;
  handle?: unknown;
  avatar?: unknown;
  bio?: unknown;
  authorId?: unknown;
  likes?: unknown;
  reposts?: unknown;
  replies?: unknown;
  views?: unknown;
  mentionsElon?: unknown;
  media?: unknown;
  commenters?: unknown;
};

function asText(value: unknown, max = 600): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function asCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function mentions(text: string, flagged: unknown): boolean {
  if (/\belon\b|@elonmusk/i.test(text)) return true;
  return flagged === true;
}

function cleanCommenter(raw: RawCommenter): Commenter | null {
  const handle = asText(raw.handle, 40).replace(/^@/, "");
  if (!handle) return null;
  const name = asText(raw.name, 80) || handle;
  const bio = asText(raw.bio, 240);
  const joined = joinedFromId(asText(raw.userId, 22));
  return { handle, name, bio, joined, olderUsa: inferOlderUsa(bio, name) };
}

function cleanPost(raw: RawPost): RelayPost | null {
  const id = asText(raw.id, 22);
  if (!/^\d{8,22}$/.test(id)) return null;
  const text = typeof raw.text === "string" ? raw.text.trim().slice(0, 700) : "";
  if (!text) return null;
  const posted = asText(raw.postedAt, 40);
  const postedAt = new Date(posted);
  if (Number.isNaN(postedAt.getTime())) return null;
  const handle = asText(raw.handle, 40).replace(/^@/, "");
  if (!handle) return null;
  const commenters = Array.isArray(raw.commenters)
    ? raw.commenters
        .slice(0, 6)
        .map((item) => cleanCommenter((item ?? {}) as RawCommenter))
        .filter((item): item is Commenter => item !== null)
    : [];
  const deskHit = DEFAULT_DESK.some((name) => name.toLowerCase() === handle.toLowerCase());
  return {
    id,
    text,
    postedAt: postedAt.toISOString(),
    authorName: asText(raw.authorName, 80) || handle,
    handle,
    avatar: asText(raw.avatar, 240),
    bio: asText(raw.bio, 240),
    likes: asCount(raw.likes),
    reposts: asCount(raw.reposts),
    replies: asCount(raw.replies),
    views: asCount(raw.views),
    mentionsElon: mentions(text, raw.mentionsElon),
    creatorNote: deskHit
      ? "On the Catturd-style patriot desk."
      : "Found in the sweep. Not on the patriot desk unless you add the handle.",
    media: asText(raw.media, 24) || undefined,
    commenters,
  };
}

function extractText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const record = body as {
    output_text?: unknown;
    output?: unknown;
  };
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

function parsePosts(text: string): { posts: RelayPost[]; note: string } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Sweep came back without a post list.");
  const parsed = JSON.parse(text.slice(start, end + 1)) as {
    posts?: unknown;
    note?: unknown;
  };
  const posts = Array.isArray(parsed.posts)
    ? parsed.posts
        .slice(0, 8)
        .map((item) => cleanPost((item ?? {}) as RawPost))
        .filter((item): item is RelayPost => item !== null)
    : [];
  return {
    posts,
    note: asText(parsed.note, 280) || "Sweep finished.",
  };
}

export const sweepMentions = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (input && typeof input === "object") return {};
    return {};
  })
  .handler(async (): Promise<SweepResult> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "Live sweep isn’t available in this preview." };
    }
    const now = Date.now();
    if (inflight) return { ok: false, error: "A sweep is already running." };
    if (now - lastSweep < 45_000) {
      return { ok: false, error: "Wait a minute before sweeping again." };
    }
    inflight = true;
    const clock = new Date(now).toISOString();
    const from = new Date(now - 36 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = new Date(now + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    try {
      const res = await fetch("https://api.x.ai/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(50_000),
        body: JSON.stringify({
          model: "grok-4.7",
          max_output_tokens: 2200,
          input: [
            {
              role: "user",
              content: `Current UTC time: ${clock}.
Search X once or twice, no more. Only posts from the last 8 hours.
Desk of USA retired-patriot creators in the Catturd voice: ${DESK}.
Find posts that mention Elon or @elonmusk, preferably from that desk, with heavy replies and reposts.
Also include a strong off-desk Elon mention from the last 8 hours if the desk is quiet.
Return ONLY JSON:
{"note":"one sentence","posts":[{"id":"status id","text":"exact text","postedAt":"ISO","authorName":"","handle":"no @","avatar":"","bio":"","authorId":"numeric user id","likes":0,"reposts":0,"replies":0,"views":0,"mentionsElon":true,"media":"photo|video|none","commenters":[{"handle":"","name":"","bio":"","userId":"numeric user id"}]}]}
Do not invent posts, counts, or ids. At most 8 posts and 6 real repliers each. If a user id was not shown, leave userId empty. Skip anything older than 8 hours.`,
            },
          ],
          tools: [
            {
              type: "x_search",
              from_date: from,
              to_date: to,
            },
          ],
        }),
      });
      if (!res.ok) {
        const detail = await res.text();
        const short = detail.replace(/\s+/g, " ").slice(0, 180);
        if (res.status === 402 || /credit|quota|billing/i.test(short)) {
          return {
            ok: false,
            error: "Sweep is out of Grok credits. The held queue stays until credits are added.",
          };
        }
        return { ok: false, error: `Sweep failed (${res.status}). ${short}` };
      }
      const body: unknown = await res.json();
      const { posts, note } = parsePosts(extractText(body));
      lastSweep = Date.now();
      if (posts.length === 0) {
        return {
          ok: false,
          error: "Sweep ran, but nothing in the last 8 hours came back with a real post id.",
        };
      }
      return { ok: true, posts, note, sweptAt: new Date().toISOString() };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sweep failed.";
      if (/abort|timeout/i.test(message)) {
        return { ok: false, error: "Sweep took too long. Try again in a minute." };
      }
      return { ok: false, error: message.slice(0, 180) };
    } finally {
      inflight = false;
    }
  });
