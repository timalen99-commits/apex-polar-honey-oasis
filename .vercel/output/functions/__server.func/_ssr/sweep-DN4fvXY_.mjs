import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
import { a as joinedFromId, r as inferOlderUsa, t as DEFAULT_DESK } from "./model-DFEEyXUc.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/sweep-DN4fvXY_.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var DESK = DEFAULT_DESK.join(", ");
var lastSweep = 0;
var inflight = false;
function asText(value, max = 600) {
	if (typeof value !== "string") return "";
	return value.replace(/\s+/g, " ").trim().slice(0, max);
}
function asCount(value) {
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(n) || n < 0) return 0;
	return Math.round(n);
}
function mentions(text, flagged) {
	if (/\belon\b|@elonmusk/i.test(text)) return true;
	return flagged === true;
}
function cleanCommenter(raw) {
	const handle = asText(raw.handle, 40).replace(/^@/, "");
	if (!handle) return null;
	const name = asText(raw.name, 80) || handle;
	const bio = asText(raw.bio, 240);
	return {
		handle,
		name,
		bio,
		joined: joinedFromId(asText(raw.userId, 22)),
		olderUsa: inferOlderUsa(bio, name)
	};
}
function cleanPost(raw) {
	const id = asText(raw.id, 22);
	if (!/^\d{8,22}$/.test(id)) return null;
	const text = typeof raw.text === "string" ? raw.text.trim().slice(0, 700) : "";
	if (!text) return null;
	const posted = asText(raw.postedAt, 40);
	const postedAt = new Date(posted);
	if (Number.isNaN(postedAt.getTime())) return null;
	const handle = asText(raw.handle, 40).replace(/^@/, "");
	if (!handle) return null;
	const commenters = Array.isArray(raw.commenters) ? raw.commenters.slice(0, 6).map((item) => cleanCommenter(item ?? {})).filter((item) => item !== null) : [];
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
		creatorNote: deskHit ? "On the Catturd-style patriot desk." : "Found in the sweep. Not on the patriot desk unless you add the handle.",
		media: asText(raw.media, 24) || void 0,
		commenters
	};
}
function extractText(body) {
	if (!body || typeof body !== "object") return "";
	const record = body;
	if (typeof record.output_text === "string") return record.output_text;
	if (!Array.isArray(record.output)) return "";
	const chunks = [];
	for (const item of record.output) {
		if (!item || typeof item !== "object") continue;
		const content = item.content;
		if (!Array.isArray(content)) continue;
		for (const part of content) {
			if (!part || typeof part !== "object") continue;
			const text = part.text;
			if (typeof text === "string") chunks.push(text);
		}
	}
	return chunks.join("\n");
}
function parsePosts(text) {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start < 0 || end <= start) throw new Error("Sweep came back without a post list.");
	const parsed = JSON.parse(text.slice(start, end + 1));
	return {
		posts: Array.isArray(parsed.posts) ? parsed.posts.slice(0, 8).map((item) => cleanPost(item ?? {})).filter((item) => item !== null) : [],
		note: asText(parsed.note, 280) || "Sweep finished."
	};
}
var sweepMentions_createServerFn_handler = createServerRpc({
	id: "5a28b678d27221ae935d25d5de2888cc6135d39faa011cfcdcc21c950467b662",
	name: "sweepMentions",
	filename: "src/lib/relay/sweep.ts"
}, (opts) => sweepMentions.__executeServer(opts));
var sweepMentions = createServerFn({ method: "POST" }).validator((input) => {
	if (input && typeof input === "object") return {};
	return {};
}).handler(sweepMentions_createServerFn_handler, async () => {
	const apiKey = process.env.XAI_API_KEY;
	if (!apiKey) return {
		ok: false,
		error: "Live sweep isn’t available in this preview."
	};
	const now = Date.now();
	if (inflight) return {
		ok: false,
		error: "A sweep is already running."
	};
	if (now - lastSweep < 45e3) return {
		ok: false,
		error: "Wait a minute before sweeping again."
	};
	inflight = true;
	const clock = new Date(now).toISOString();
	const from = (/* @__PURE__ */ new Date(now - 1296e5)).toISOString().slice(0, 10);
	const to = new Date(now + 864e5).toISOString().slice(0, 10);
	try {
		const res = await fetch("https://api.x.ai/v1/responses", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`
			},
			signal: AbortSignal.timeout(5e4),
			body: JSON.stringify({
				model: "grok-4.7",
				max_output_tokens: 2200,
				input: [{
					role: "user",
					content: `Current UTC time: ${clock}.
Search X once or twice, no more. Only posts from the last 8 hours.
Desk of USA retired-patriot creators in the Catturd voice: ${DESK}.
Find posts that mention Elon or @elonmusk, preferably from that desk, with heavy replies and reposts.
Also include a strong off-desk Elon mention from the last 8 hours if the desk is quiet.
Return ONLY JSON:
{"note":"one sentence","posts":[{"id":"status id","text":"exact text","postedAt":"ISO","authorName":"","handle":"no @","avatar":"","bio":"","authorId":"numeric user id","likes":0,"reposts":0,"replies":0,"views":0,"mentionsElon":true,"media":"photo|video|none","commenters":[{"handle":"","name":"","bio":"","userId":"numeric user id"}]}]}
Do not invent posts, counts, or ids. At most 8 posts and 6 real repliers each. If a user id was not shown, leave userId empty. Skip anything older than 8 hours.`
				}],
				tools: [{
					type: "x_search",
					from_date: from,
					to_date: to
				}]
			})
		});
		if (!res.ok) {
			const short = (await res.text()).replace(/\s+/g, " ").slice(0, 180);
			if (res.status === 402 || /credit|quota|billing/i.test(short)) return {
				ok: false,
				error: "Sweep is out of Grok credits. The held queue stays until credits are added."
			};
			return {
				ok: false,
				error: `Sweep failed (${res.status}). ${short}`
			};
		}
		const { posts, note } = parsePosts(extractText(await res.json()));
		lastSweep = Date.now();
		if (posts.length === 0) return {
			ok: false,
			error: "Sweep ran, but nothing in the last 8 hours came back with a real post id."
		};
		return {
			ok: true,
			posts,
			note,
			sweptAt: (/* @__PURE__ */ new Date()).toISOString()
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : "Sweep failed.";
		if (/abort|timeout/i.test(message)) return {
			ok: false,
			error: "Sweep took too long. Try again in a minute."
		};
		return {
			ok: false,
			error: message.slice(0, 180)
		};
	} finally {
		inflight = false;
	}
});
//#endregion
export { sweepMentions_createServerFn_handler };
