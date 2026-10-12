import { useEffect, useMemo, useState } from "react";
import {
  Clock3,
  ExternalLink,
  Plus,
  Radio,
  Repeat2,
  RotateCw,
  X,
} from "lucide-react";
import {
  AUDIENCE_PCT,
  DEFAULT_DESK,
  MIN_SAMPLE,
  SEED_POSTS,
  SNAPSHOT_NOTE,
  WINDOW_HOURS,
  isClear,
  passedCount,
  relTime,
  scorePost,
  type Floors,
  type Gate,
  type RelayPost,
} from "@/lib/relay/model";
import { sweepMentions, type SweepResult } from "@/lib/relay/sweep";

type LogItem = {
  id: string;
  action: "repost" | "skip";
  at: string;
  handle: string;
};

type Prefs = {
  day: string;
  sent: string[];
  skipped: string[];
  cap: number;
  minReplies: number;
  minReposts: number;
  minNew: number;
  desk: string[];
  posts: RelayPost[] | null;
  sweptAt: string | null;
  note: string | null;
  log: LogItem[];
};

const STORE = "relay.v1";

const DEFAULT_FLOORS: Floors = { minReplies: 40, minReposts: 20, minNew: 3 };

function freshPrefs(): Prefs {
  return {
    day: todayKey(),
    sent: [],
    skipped: [],
    cap: 10,
    ...DEFAULT_FLOORS,
    desk: DEFAULT_DESK,
    posts: null,
    sweptAt: null,
    note: null,
    log: [],
  };
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function loadPrefs(): Prefs {
  const base = freshPrefs();
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    const day = parsed.day === todayKey() ? parsed.day : todayKey();
    return {
      ...base,
      ...parsed,
      day,
      sent: day === parsed.day && Array.isArray(parsed.sent) ? parsed.sent : [],
      skipped: Array.isArray(parsed.skipped) ? parsed.skipped : [],
      desk: Array.isArray(parsed.desk) && parsed.desk.length > 0 ? parsed.desk : DEFAULT_DESK,
      log: Array.isArray(parsed.log) ? parsed.log.slice(0, 24) : [],
      cap: clamp(parsed.cap, 1, 30, 10),
      minReplies: clamp(parsed.minReplies, 0, 500, 40),
      minReposts: clamp(parsed.minReposts, 0, 500, 20),
      minNew: clamp(parsed.minNew, 1, 12, 3),
    };
  } catch {
    return base;
  }
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function initials(name: string): string {
  const parts = name.replace(/[™']/g, "").split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

export function RelayDesk() {
  const [prefs, setPrefs] = useState<Prefs>(freshPrefs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handleDraft, setHandleDraft] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPrefs(loadPrefs());
    setHydrated(true);
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORE, JSON.stringify(prefs));
  }, [prefs, hydrated]);

  const floors: Floors = prefs
    ? { minReplies: prefs.minReplies, minReposts: prefs.minReposts, minNew: prefs.minNew }
    : DEFAULT_FLOORS;
  const desk = prefs?.desk ?? DEFAULT_DESK;
  const posts = prefs?.posts ?? SEED_POSTS;
  const skipped = new Set(prefs?.skipped ?? []);
  const sent = new Set(prefs?.sent ?? []);

  const scored = useMemo(() => {
    return posts
      .filter((post) => !skipped.has(post.id))
      .map((post) => ({ post, gates: scorePost(post, desk, floors, now) }))
      .sort((a, b) => {
        const aw = a.gates.find((g) => g.key === "window")?.pass ? 1 : 0;
        const bw = b.gates.find((g) => g.key === "window")?.pass ? 1 : 0;
        if (aw !== bw) return bw - aw;
        const ac = isClear(a.gates) ? 1 : 0;
        const bc = isClear(b.gates) ? 1 : 0;
        if (ac !== bc) return bc - ac;
        return passedCount(b.gates) - passedCount(a.gates);
      });
  }, [posts, desk, floors, now, skipped]);

  const clear = scored.filter((item) => isClear(item.gates) && !sent.has(item.post.id));
  const held = scored.filter((item) => !isClear(item.gates) && !sent.has(item.post.id));
  const opened = scored.filter((item) => sent.has(item.post.id));
  const cap = prefs?.cap ?? 10;
  const used = prefs?.sent.length ?? 0;
  const capFull = used >= cap;

  function patch(next: Partial<Prefs>) {
    setPrefs((current) => ({ ...current, ...next }));
  }

  function repost(post: RelayPost) {
    if (capFull || sent.has(post.id)) return;
    window.open(`https://x.com/intent/retweet?tweet_id=${post.id}`, "_blank", "noopener,noreferrer");
    patch({
      sent: [...prefs.sent, post.id],
      log: [
        { id: post.id, action: "repost" as const, at: new Date().toISOString(), handle: post.handle },
        ...prefs.log,
      ].slice(0, 24),
    });
  }

  function skip(post: RelayPost) {
    patch({
      skipped: [...prefs.skipped, post.id],
      log: [
        { id: post.id, action: "skip" as const, at: new Date().toISOString(), handle: post.handle },
        ...prefs.log,
      ].slice(0, 24),
    });
  }

  function addHandle() {
    const handle = handleDraft.replace(/^@/, "").trim();
    if (!/^[A-Za-z0-9_]{1,20}$/.test(handle)) return;
    if (prefs.desk.some((name) => name.toLowerCase() === handle.toLowerCase())) {
      setHandleDraft("");
      return;
    }
    patch({ desk: [...prefs.desk, handle] });
    setHandleDraft("");
  }

  async function sweep() {
    if (busy) return;
    setBusy(true);
    setError(null);
    let result: SweepResult;
    try {
      result = await sweepMentions();
    } catch (err) {
      result = { ok: false, error: err instanceof Error ? err.message : "Sweep failed." };
    }
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    patch({ posts: result.posts, sweptAt: result.sweptAt, note: result.note });
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-5 sm:px-6 sm:py-8">
      <header className="border-ink border-t-4 pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-brass text-xs font-semibold tracking-widest uppercase">Wire desk</p>
            <h1 className="font-display text-ink mt-1 text-5xl leading-none font-semibold sm:text-6xl">
              Relay
            </h1>
            <p className="text-muted mt-2 max-w-xl text-base leading-relaxed">
              Posts that mention Elon, from Catturd-style US patriot creators, with a heavy older-American reply pile and new 2026 accounts in the comments. Last {WINDOW_HOURS} hours only.
            </p>
          </div>
          <div className="border-signal text-signal hidden shrink-0 -rotate-6 border-2 px-3 py-2 sm:block">
            <p className="font-display text-sm font-semibold tracking-widest uppercase">Confirm</p>
            <p className="text-center text-xs tracking-widest uppercase">on X</p>
          </div>
        </div>
        <div className="border-line mt-5 flex flex-wrap items-center gap-3 border-y py-3">
          <span className="text-ink inline-flex items-center gap-2 text-sm font-semibold">
            <Clock3 className="size-4" aria-hidden="true" />
            Last {WINDOW_HOURS} hours
          </span>
          <span className="text-muted text-sm tabular-nums">
            {used} of {cap} opened today
          </span>
          <button
            type="button"
            onClick={sweep}
            disabled={busy}
            className="bg-signal text-signal-ink ml-auto inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-60"
          >
            <RotateCw className={busy ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
            {busy ? "Sweeping…" : "Sweep mentions"}
          </button>
        </div>
        <p className="text-muted mt-3 text-sm leading-relaxed">
          {prefs.note ?? SNAPSHOT_NOTE}
          {prefs.sweptAt ? ` · ${relTime(prefs.sweptAt, now)}` : ""}
          {" "}
          Repost opens X’s confirm screen on your account. Relay never posts by itself.
        </p>
        {error ? (
          <p className="border-signal text-signal mt-3 rounded-2xl border bg-sheet px-4 py-3 text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-4">
        <aside className="order-2 space-y-4 lg:order-1 lg:col-span-1">
          <section className="bg-sheet border-line rounded-card border p-4">
            <h2 className="font-display text-xl font-semibold">What gets through</h2>
            <ul className="mt-3 space-y-2 text-sm leading-snug">
              <Rule title="Mentions Elon" detail="The post itself names him." />
              <Rule title="Patriot desk" detail="Catturd-style US creators. Add a handle if yours is missing." />
              <Rule title="Heavy pile" detail="Replies and reposts, not a quiet mention." />
              <Rule
                title={`Older USA ≥ ${AUDIENCE_PCT}%`}
                detail={`A bio read of sampled replies. Needs at least ${MIN_SAMPLE} people before it counts. Not a census.`}
              />
              <Rule title="Joined in 2026" detail="New accounts that actually replied." />
              <Rule title="Last 8 hours" detail="You moved this off the 2-day window." />
            </ul>
          </section>

          <section className="bg-sheet border-line rounded-card border p-4">
            <h2 className="font-display text-xl font-semibold">Floors</h2>
            <div className="mt-3 space-y-3">
              <Floor
                label="Replies"
                value={prefs.minReplies}
                onChange={(minReplies) => patch({ minReplies })}
              />
              <Floor
                label="Reposts"
                value={prefs.minReposts}
                onChange={(minReposts) => patch({ minReposts })}
              />
              <Floor
                label="2026 replies"
                value={prefs.minNew}
                onChange={(minNew) => patch({ minNew })}
              />
              <Floor label="Daily cap" value={prefs.cap} onChange={(cap) => patch({ cap })} />
            </div>
          </section>

          <section className="bg-sheet border-line rounded-card border p-4">
            <h2 className="font-display text-xl font-semibold">Desk</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {prefs.desk.map((handle) => (
                <li key={handle}>
                  <button
                    type="button"
                    onClick={() => patch({ desk: prefs.desk.filter((name) => name !== handle) })}
                    className="border-line bg-paper text-ink inline-flex h-9 items-center gap-1 rounded-full border px-3 text-sm"
                  >
                    @{handle}
                    <X className="size-3.5" aria-hidden="true" />
                    <span className="sr-only">Remove @{handle}</span>
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                addHandle();
              }}
            >
              <label className="sr-only" htmlFor="desk-handle">
                Add a creator handle
              </label>
              <input
                id="desk-handle"
                value={handleDraft}
                onChange={(event) => setHandleDraft(event.target.value)}
                placeholder="@handle"
                className="border-line bg-paper text-ink h-11 min-w-0 flex-1 rounded-full border px-3 text-sm"
              />
              <button
                type="submit"
                className="border-ink text-ink inline-flex h-11 items-center gap-1 rounded-full border px-3 text-sm font-semibold"
              >
                <Plus className="size-4" aria-hidden="true" />
                Add
              </button>
            </form>
          </section>

          {prefs.log.length > 0 ? (
            <section className="bg-sheet border-line rounded-card border p-4">
              <h2 className="font-display text-xl font-semibold">Today’s tape</h2>
              <ul className="mt-3 space-y-2">
                {prefs.log.slice(0, 6).map((item) => (
                  <li key={`${item.action}-${item.id}-${item.at}`} className="text-muted text-sm">
                    <span className="text-ink font-medium">
                      {item.action === "repost" ? "Opened" : "Skipped"}
                    </span>{" "}
                    @{item.handle}
                    <span className="tabular-nums"> · {relTime(item.at, now)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>

        <section className="order-1 min-w-0 space-y-5 lg:order-2 lg:col-span-3">
          <Queue
            title="Clear to repost"
            empty="Nothing in the last 8 hours clears every gate. The closest posts are under it. Lower a floor or sweep again."
            items={clear}
            capFull={capFull}
            now={now}
            onRepost={repost}
            onSkip={skip}
          />
          <Queue
            title="Held"
            empty="The held pile is empty."
            items={held}
            capFull={capFull}
            now={now}
            onRepost={repost}
            onSkip={skip}
          />
          {opened.length > 0 ? (
            <Queue
              title="Opened on X"
              empty=""
              items={opened}
              capFull
              now={now}
              onRepost={repost}
              onSkip={skip}
              done
            />
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Rule({ title, detail }: { title: string; detail: string }) {
  return (
    <li>
      <p className="text-ink font-medium">{title}</p>
      <p className="text-muted">{detail}</p>
    </li>
  );
}

function Floor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={0}
        onChange={(event) => onChange(clamp(event.target.value, 0, 500, value))}
        className="border-line bg-paper text-ink h-11 w-20 rounded-xl border px-2 text-right tabular-nums"
      />
    </label>
  );
}

function Queue({
  title,
  empty,
  items,
  capFull,
  now,
  onRepost,
  onSkip,
  done = false,
}: {
  title: string;
  empty: string;
  items: { post: RelayPost; gates: Gate[] }[];
  capFull: boolean;
  now: number;
  onRepost: (post: RelayPost) => void;
  onSkip: (post: RelayPost) => void;
  done?: boolean;
}) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
        <span className="text-muted text-sm tabular-nums">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="border-line text-muted bg-sheet rounded-card border border-dashed px-4 py-6 text-sm leading-relaxed">
          {empty}
        </p>
      ) : (
        <ul className="space-y-4">
          {items.map(({ post, gates }) => (
            <li key={post.id}>
              <PostCard
                post={post}
                gates={gates}
                now={now}
                capFull={capFull}
                done={done}
                onRepost={() => onRepost(post)}
                onSkip={() => onSkip(post)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PostCard({
  post,
  gates,
  now,
  capFull,
  done,
  onRepost,
  onSkip,
}: {
  post: RelayPost;
  gates: Gate[];
  now: number;
  capFull: boolean;
  done: boolean;
  onRepost: () => void;
  onSkip: () => void;
}) {
  const [photo, setPhoto] = useState(true);
  const clear = isClear(gates);
  const misses = gates.filter((gate) => !gate.pass);

  return (
    <article className="bg-sheet border-line rounded-card relative overflow-hidden border p-4 sm:p-5">
      {clear ? (
        <p className="border-good text-good pointer-events-none absolute top-4 right-4 -rotate-6 border-2 px-2 py-1 text-xs font-semibold tracking-widest uppercase">
          Clear
        </p>
      ) : null}
      <div className="flex gap-3">
        {photo && post.avatar ? (
          <img
            src={post.avatar}
            alt=""
            width={48}
            height={48}
            className="border-line size-12 shrink-0 rounded-full border object-cover"
            onError={() => setPhoto(false)}
          />
        ) : (
          <span className="bg-paper text-ink border-line inline-flex size-12 shrink-0 items-center justify-center rounded-full border text-sm font-semibold">
            {initials(post.authorName)}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-ink truncate text-base font-semibold">{post.authorName}</h3>
          <p className="text-muted truncate text-sm">
            @{post.handle}
            <span className="tabular-nums"> · {relTime(post.postedAt, now)}</span>
            {post.media ? ` · ${post.media}` : ""}
          </p>
        </div>
      </div>
      <p className="text-ink mt-3 text-base leading-relaxed whitespace-pre-wrap">{post.text}</p>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Replies" value={post.replies} />
        <Stat label="Reposts" value={post.reposts} />
        <Stat label="Likes" value={post.likes} />
      </dl>
      <ul className="mt-4 flex flex-wrap gap-2">
        {gates.map((gate) => (
          <li
            key={gate.key}
            title={gate.detail}
            className={
              gate.pass
                ? "bg-good text-good-ink rounded-full px-2.5 py-1 text-xs font-medium"
                : "border-line text-muted rounded-full border px-2.5 py-1 text-xs"
            }
          >
            {gate.label}
          </li>
        ))}
      </ul>
      {misses.length > 0 ? (
        <p className="text-muted mt-3 text-sm leading-relaxed">{misses.map((gate) => gate.detail).join(" ")}</p>
      ) : (
        <p className="text-good mt-3 inline-flex items-center gap-2 text-sm font-medium">
          <Radio className="size-4" aria-hidden="true" />
          Clears the desk. Confirm the repost on X.
        </p>
      )}
      {post.commenters.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {post.commenters.slice(0, 4).map((person) => (
            <li key={person.handle} className="text-muted text-sm leading-snug">
              <span className="text-ink">@{person.handle}</span>
              {person.joined ? ` · joined ${person.joined.slice(0, 4)}` : " · join year unseen"}
              {person.olderUsa ? " · older USA read" : ""}
              {person.bio ? ` · ${person.bio}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRepost}
          disabled={capFull || done}
          className="bg-ink text-paper inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-50"
        >
          <Repeat2 className="size-4" aria-hidden="true" />
          {done ? "Opened" : capFull ? "Daily cap hit" : clear ? "Repost" : "Repost anyway"}
        </button>
        {done ? null : (
          <button
            type="button"
            onClick={onSkip}
            className="border-line text-ink inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold"
          >
            Skip
          </button>
        )}
        <a
          href={`https://x.com/${post.handle}/status/${post.id}`}
          target="_blank"
          rel="noreferrer"
          className="border-line text-ink inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          Open
        </a>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-paper border-line rounded-xl border px-2 py-2">
      <dt className="text-muted text-xs">{label}</dt>
      <dd className="text-ink text-lg font-semibold tabular-nums">{value.toLocaleString()}</dd>
    </div>
  );
}
