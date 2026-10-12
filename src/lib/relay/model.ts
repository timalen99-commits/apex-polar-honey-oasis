export type Commenter = {
  handle: string;
  name: string;
  bio: string;
  joined?: string;
  olderUsa: boolean;
};

export type RelayPost = {
  id: string;
  text: string;
  postedAt: string;
  authorName: string;
  handle: string;
  avatar: string;
  bio: string;
  likes: number;
  reposts: number;
  replies: number;
  views: number;
  mentionsElon: boolean;
  creatorNote: string;
  commenters: Commenter[];
  media?: string;
};

export type Gate = {
  key: string;
  label: string;
  pass: boolean;
  detail: string;
};

export type Floors = {
  minReplies: number;
  minReposts: number;
  minNew: number;
};

export const WINDOW_HOURS = 8;
export const AUDIENCE_PCT = 80;
export const MIN_SAMPLE = 5;

export const DEFAULT_DESK = [
  "catturd2",
  "GuntherEagleman",
  "DC_Draino",
  "RealJamesWoods",
  "MarkLevinShow",
  "seanhannity",
  "larryelder",
  "ScottPresler",
  "DineshDSouza",
  "TuckerCarlson",
];

export const SNAPSHOT_NOTE =
  "Held snapshot from this morning. Sweep pulls a fresh set from the last 8 hours.";

const TWITTER_EPOCH = 1288834974657n;

export function joinedFromId(id: string | undefined): string | undefined {
  if (!id || !/^\d{6,22}$/.test(id)) return undefined;
  try {
    const ms = (BigInt(id) >> 22n) + TWITTER_EPOCH;
    const date = new Date(Number(ms));
    const year = date.getUTCFullYear();
    if (Number.isNaN(date.getTime()) || year < 2006 || year > 2027) return undefined;
    return date.toISOString();
  } catch {
    return undefined;
  }
}

export function inferOlderUsa(bio: string, name = ""): boolean {
  const blob = `${name} ${bio}`;
  const foreign =
    /\b(india|indian|pakistan|ukrain|lagos|delhi|mumbai|brasil|brazil|nigeria|beijing|china)\b/i.test(
      blob,
    ) && !/\b(usa|u\.s\.|america|american|florida|texas)\b/i.test(blob);
  if (foreign) return false;
  const age =
    /\b(retired|veteran|grandma|grandpa|grandmother|grandfather|mom\b|dad\b|mother|father|dar\b|boomer|widow|senior|generational)\b/i.test(
      blob,
    );
  const usa =
    /\b(usa|u\.s\.|united states|america|american|maga|florida|texas|ohio|patriot|veteran|trump|constitution|god bless|dar\b|retired)\b/i.test(
      blob,
    );
  return age && usa;
}

export function yearOf(iso: string | undefined): number | null {
  if (!iso) return null;
  const year = new Date(iso).getUTCFullYear();
  return Number.isNaN(year) ? null : year;
}

export function relTime(iso: string, now = Date.now()): string {
  const delta = now - Date.parse(iso);
  if (!Number.isFinite(delta)) return "unknown time";
  const mins = Math.round(delta / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function inWindow(iso: string, now = Date.now()): boolean {
  const delta = now - Date.parse(iso);
  return delta >= -60_000 && delta <= WINDOW_HOURS * 60 * 60 * 1000;
}

export function onDesk(handle: string, desk: string[]): boolean {
  const key = handle.replace(/^@/, "").toLowerCase();
  return desk.some((name) => name.replace(/^@/, "").toLowerCase() === key);
}

export function scorePost(
  post: RelayPost,
  desk: string[],
  floors: Floors,
  now = Date.now(),
): Gate[] {
  const sample = post.commenters.length;
  const older = post.commenters.filter((c) => c.olderUsa).length;
  const pct = sample === 0 ? 0 : Math.round((older / sample) * 100);
  const newcomers = post.commenters.filter((c) => yearOf(c.joined) === 2026).length;
  const deskHit = onDesk(post.handle, desk);

  return [
    {
      key: "window",
      label: "Last 8 hours",
      pass: inWindow(post.postedAt, now),
      detail: inWindow(post.postedAt, now)
        ? `Posted ${relTime(post.postedAt, now)}.`
        : `Posted ${relTime(post.postedAt, now)} — outside the 8-hour window.`,
    },
    {
      key: "mention",
      label: "Mentions Elon",
      pass: post.mentionsElon,
      detail: post.mentionsElon ? "Elon is named in the post." : "Elon is not named.",
    },
    {
      key: "desk",
      label: "Patriot desk",
      pass: deskHit,
      detail: deskHit
        ? post.creatorNote || "On the Catturd-style desk."
        : post.creatorNote || "Not on the retired-patriot desk.",
    },
    {
      key: "replies",
      label: `${floors.minReplies}+ replies`,
      pass: post.replies >= floors.minReplies,
      detail: `${post.replies.toLocaleString()} replies.`,
    },
    {
      key: "reposts",
      label: `${floors.minReposts}+ reposts`,
      pass: post.reposts >= floors.minReposts,
      detail: `${post.reposts.toLocaleString()} reposts.`,
    },
    {
      key: "audience",
      label: "Older USA ≥ 80%",
      pass: sample >= MIN_SAMPLE && pct >= AUDIENCE_PCT,
      detail:
        sample < MIN_SAMPLE
          ? `${older} of ${sample} sampled replies read as older USA. Need ${MIN_SAMPLE} before 80% counts.`
          : `${pct}% of ${sample} sampled replies read as older USA.`,
    },
    {
      key: "newcomers",
      label: `${floors.minNew}+ joined in 2026`,
      pass: newcomers >= floors.minNew,
      detail:
        newcomers === 0
          ? "No 2026 accounts in the sampled replies."
          : `${newcomers} sampled repl${newcomers === 1 ? "y" : "ies"} joined in 2026.`,
    },
  ];
}

export function passedCount(gates: Gate[]): number {
  return gates.filter((g) => g.pass).length;
}

export function isClear(gates: Gate[]): boolean {
  return gates.every((g) => g.pass);
}

function commenter(
  handle: string,
  name: string,
  bio: string,
  joined: string | undefined,
  olderUsa?: boolean,
): Commenter {
  return {
    handle,
    name,
    bio,
    joined,
    olderUsa: olderUsa ?? inferOlderUsa(bio, name),
  };
}

/** Real posts from the morning of 12 Oct 2026. Counts were live at snapshot time. */
export const SEED_POSTS: RelayPost[] = [
  {
    id: "2109563209858551883",
    text: "Seth Rogen says Elon Musk shouldn't be charging people at the Tesla Diner in LA because he's rich.\n\n\"I’m sick of these billionaires charging us for burgers.\"\n\nJust so you know, Google estimates Rogen to be worth around $80 million. I reckon it's more.",
    postedAt: "2026-10-12T08:33:57.000Z",
    authorName: "Defiant L’s",
    handle: "DefiantLs",
    avatar: "https://pbs.twimg.com/profile_images/1428167484406964229/Q8fS7M5X.jpg",
    bio: "Exposing hypocrisy, one day at a time.",
    likes: 824,
    reposts: 57,
    replies: 93,
    views: 25020,
    mentionsElon: true,
    creatorNote: "US commentary account. Not the retired-patriot desk (Catturd, Eagleman, Woods).",
    media: "video",
    commenters: [
      commenter("ElenaSWVA", "Elena", "", "2025-01-20T19:29:04.712Z", false),
      commenter(
        "TheSilverJMung",
        "JMung",
        "American/British guy back in Florida. Software engineering.",
        undefined,
        false,
      ),
      commenter(
        "shopkins776",
        "Cave Man Steve",
        "Political satire. Conservative.",
        undefined,
        false,
      ),
    ],
  },
  {
    id: "2109465462035951902",
    text: "Meta's chief AI officer Alexandr Wang says @ElonMusk taught him something that helped shape Meta's AI strategy. You don't necessarily need thousands of engineers to move fast. You need a small group of exceptionally talented people, very little hierarchy, and the freedom to get things done.",
    postedAt: "2026-10-12T02:05:32.000Z",
    authorName: "Mario Nawfal",
    handle: "MarioNawfal",
    avatar: "https://pbs.twimg.com/profile_images/1938244629071015936/UwtzYY-R.jpg",
    bio: "Largest Show on X. News writer, not a patriot creator.",
    likes: 993,
    reposts: 109,
    replies: 31,
    views: 115629,
    mentionsElon: true,
    creatorNote: "News show. Mentions Elon, but not a retired US patriot creator.",
    media: "video",
    commenters: [
      commenter(
        "ThePatriotTea",
        "ThePatriot",
        "America First. Breaking ICE, ballot and court news.",
        undefined,
        false,
      ),
      commenter(
        "drtaubraun",
        "Dr. Tau Braun",
        "Counterterrorism and Biothreat Expert.",
        undefined,
        false,
      ),
      commenter(
        "ExiledonMoon",
        "The Lunar Misfit",
        "The news, decoded.",
        undefined,
        false,
      ),
    ],
  },
  {
    id: "2109077875672699023",
    text: "Elon knows",
    postedAt: "2026-10-11T00:25:24.000Z",
    authorName: "Catturd ™",
    handle: "catturd2",
    avatar: "https://pbs.twimg.com/profile_images/1043187066832650240/6iaOQ7xL.jpg",
    bio: "The turd you can’t flush.",
    likes: 31246,
    reposts: 3236,
    replies: 558,
    views: 236447,
    mentionsElon: true,
    creatorNote: "Reference voice for this desk. Posted yesterday, so the 8-hour window keeps it out.",
    media: "photo",
    commenters: [
      commenter(
        "bbear111670",
        "bbear1116",
        "Constitutional Conservative, MAGA, deep faith. Female.",
        "2023-05-09T22:33:03.316Z",
        false,
      ),
      commenter("Ice85942789", "SBR/ICE", "DAR Member", undefined, true),
      commenter(
        "Lynyrds_Mom",
        "LynyrdsMom",
        "Descendant of Revolutionary and Civil war Patriots. A generational Republican.",
        "2022-03-01T10:47:02.600Z",
        true,
      ),
      commenter(
        "SSailor8",
        "eelonstusk",
        "Critical of the MAGA replies on this post.",
        undefined,
        false,
      ),
      commenter(
        "bill_adkins_dem",
        "bill adkins",
        "Replying against the post. Not an older USA patriot reader.",
        undefined,
        false,
      ),
    ],
  },
];
