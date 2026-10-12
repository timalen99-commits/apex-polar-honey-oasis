import { i as __toESM } from "../_runtime.mjs";
import { b as require_jsx_runtime, q as require_react } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as Radio, c as Clock3, i as Repeat2, o as Plus, r as RotateCw, s as ExternalLink, t as X } from "../_libs/lucide-react.mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { c as scorePost, i as isClear, n as SEED_POSTS, o as passedCount, s as relTime, t as DEFAULT_DESK } from "./model-DFEEyXUc.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-Cx98G1nV.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var sweepMentions = createServerFn({ method: "POST" }).validator((input) => {
	if (input && typeof input === "object") return {};
	return {};
}).handler(createSsrRpc("5a28b678d27221ae935d25d5de2888cc6135d39faa011cfcdcc21c950467b662"));
var STORE = "relay.v1";
var DEFAULT_FLOORS = {
	minReplies: 40,
	minReposts: 20,
	minNew: 3
};
function freshPrefs() {
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
		log: []
	};
}
function todayKey() {
	const d = /* @__PURE__ */ new Date();
	return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function loadPrefs() {
	const base = freshPrefs();
	try {
		const raw = localStorage.getItem(STORE);
		if (!raw) return base;
		const parsed = JSON.parse(raw);
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
			minNew: clamp(parsed.minNew, 1, 12, 3)
		};
	} catch {
		return base;
	}
}
function clamp(value, min, max, fallback) {
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, Math.round(n)));
}
function initials(name) {
	const parts = name.replace(/[™']/g, "").split(/\s+/).filter(Boolean);
	return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}
function RelayDesk() {
	const [prefs, setPrefs] = (0, import_react.useState)(freshPrefs);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)(null);
	const [handleDraft, setHandleDraft] = (0, import_react.useState)("");
	const [now, setNow] = (0, import_react.useState)(() => Date.now());
	const [hydrated, setHydrated] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		setPrefs(loadPrefs());
		setHydrated(true);
		const timer = window.setInterval(() => setNow(Date.now()), 3e4);
		return () => window.clearInterval(timer);
	}, []);
	(0, import_react.useEffect)(() => {
		if (!hydrated) return;
		localStorage.setItem(STORE, JSON.stringify(prefs));
	}, [prefs, hydrated]);
	const floors = prefs ? {
		minReplies: prefs.minReplies,
		minReposts: prefs.minReposts,
		minNew: prefs.minNew
	} : DEFAULT_FLOORS;
	const desk = prefs?.desk ?? DEFAULT_DESK;
	const posts = prefs?.posts ?? SEED_POSTS;
	const skipped = new Set(prefs?.skipped ?? []);
	const sent = new Set(prefs?.sent ?? []);
	const scored = (0, import_react.useMemo)(() => {
		return posts.filter((post) => !skipped.has(post.id)).map((post) => ({
			post,
			gates: scorePost(post, desk, floors, now)
		})).sort((a, b) => {
			const aw = a.gates.find((g) => g.key === "window")?.pass ? 1 : 0;
			const bw = b.gates.find((g) => g.key === "window")?.pass ? 1 : 0;
			if (aw !== bw) return bw - aw;
			const ac = isClear(a.gates) ? 1 : 0;
			const bc = isClear(b.gates) ? 1 : 0;
			if (ac !== bc) return bc - ac;
			return passedCount(b.gates) - passedCount(a.gates);
		});
	}, [
		posts,
		desk,
		floors,
		now,
		skipped
	]);
	const clear = scored.filter((item) => isClear(item.gates) && !sent.has(item.post.id));
	const held = scored.filter((item) => !isClear(item.gates) && !sent.has(item.post.id));
	const opened = scored.filter((item) => sent.has(item.post.id));
	const cap = prefs?.cap ?? 10;
	const used = prefs?.sent.length ?? 0;
	const capFull = used >= cap;
	function patch(next) {
		setPrefs((current) => ({
			...current,
			...next
		}));
	}
	function repost(post) {
		if (capFull || sent.has(post.id)) return;
		window.open(`https://x.com/intent/retweet?tweet_id=${post.id}`, "_blank", "noopener,noreferrer");
		patch({
			sent: [...prefs.sent, post.id],
			log: [{
				id: post.id,
				action: "repost",
				at: (/* @__PURE__ */ new Date()).toISOString(),
				handle: post.handle
			}, ...prefs.log].slice(0, 24)
		});
	}
	function skip(post) {
		patch({
			skipped: [...prefs.skipped, post.id],
			log: [{
				id: post.id,
				action: "skip",
				at: (/* @__PURE__ */ new Date()).toISOString(),
				handle: post.handle
			}, ...prefs.log].slice(0, 24)
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
		let result;
		try {
			result = await sweepMentions();
		} catch (err) {
			result = {
				ok: false,
				error: err instanceof Error ? err.message : "Sweep failed."
			};
		}
		setBusy(false);
		if (!result.ok) {
			setError(result.error);
			return;
		}
		patch({
			posts: result.posts,
			sweptAt: result.sweptAt,
			note: result.note
		});
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "mx-auto min-h-screen max-w-5xl px-4 py-5 sm:px-6 sm:py-8",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "border-ink border-t-4 pt-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-start justify-between gap-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-brass text-xs font-semibold tracking-widest uppercase",
								children: "Wire desk"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
								className: "font-display text-ink mt-1 text-5xl leading-none font-semibold sm:text-6xl",
								children: "Relay"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-muted mt-2 max-w-xl text-base leading-relaxed",
								children: [
									"Posts that mention Elon, from Catturd-style US patriot creators, with a heavy older-American reply pile and new 2026 accounts in the comments. Last ",
									8,
									" hours only."
								]
							})
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "border-signal text-signal hidden shrink-0 -rotate-6 border-2 px-3 py-2 sm:block",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-display text-sm font-semibold tracking-widest uppercase",
							children: "Confirm"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-center text-xs tracking-widest uppercase",
							children: "on X"
						})]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "border-line mt-5 flex flex-wrap items-center gap-3 border-y py-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "text-ink inline-flex items-center gap-2 text-sm font-semibold",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clock3, {
									className: "size-4",
									"aria-hidden": "true"
								}),
								"Last ",
								8,
								" hours"
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "text-muted text-sm tabular-nums",
							children: [
								used,
								" of ",
								cap,
								" opened today"
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: sweep,
							disabled: busy,
							className: "bg-signal text-signal-ink ml-auto inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-60",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RotateCw, {
								className: busy ? "size-4 animate-spin" : "size-4",
								"aria-hidden": "true"
							}), busy ? "Sweeping…" : "Sweep mentions"]
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-muted mt-3 text-sm leading-relaxed",
					children: [
						prefs.note ?? "Held snapshot from this morning. Sweep pulls a fresh set from the last 8 hours.",
						prefs.sweptAt ? ` · ${relTime(prefs.sweptAt, now)}` : "",
						" ",
						"Repost opens X’s confirm screen on your account. Relay never posts by itself."
					]
				}),
				error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "border-signal text-signal mt-3 rounded-2xl border bg-sheet px-4 py-3 text-sm",
					role: "alert",
					children: error
				}) : null
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-6 grid gap-6 lg:grid-cols-4",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
				className: "order-2 space-y-4 lg:order-1 lg:col-span-1",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "bg-sheet border-line rounded-card border p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-xl font-semibold",
							children: "What gets through"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
							className: "mt-3 space-y-2 text-sm leading-snug",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Rule, {
									title: "Mentions Elon",
									detail: "The post itself names him."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Rule, {
									title: "Patriot desk",
									detail: "Catturd-style US creators. Add a handle if yours is missing."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Rule, {
									title: "Heavy pile",
									detail: "Replies and reposts, not a quiet mention."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Rule, {
									title: `Older USA ≥ 80%`,
									detail: `A bio read of sampled replies. Needs at least 5 people before it counts. Not a census.`
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Rule, {
									title: "Joined in 2026",
									detail: "New accounts that actually replied."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Rule, {
									title: "Last 8 hours",
									detail: "You moved this off the 2-day window."
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "bg-sheet border-line rounded-card border p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-xl font-semibold",
							children: "Floors"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-3 space-y-3",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Floor, {
									label: "Replies",
									value: prefs.minReplies,
									onChange: (minReplies) => patch({ minReplies })
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Floor, {
									label: "Reposts",
									value: prefs.minReposts,
									onChange: (minReposts) => patch({ minReposts })
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Floor, {
									label: "2026 replies",
									value: prefs.minNew,
									onChange: (minNew) => patch({ minNew })
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Floor, {
									label: "Daily cap",
									value: prefs.cap,
									onChange: (cap) => patch({ cap })
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "bg-sheet border-line rounded-card border p-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "font-display text-xl font-semibold",
								children: "Desk"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
								className: "mt-3 flex flex-wrap gap-2",
								children: prefs.desk.map((handle) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: () => patch({ desk: prefs.desk.filter((name) => name !== handle) }),
									className: "border-line bg-paper text-ink inline-flex h-9 items-center gap-1 rounded-full border px-3 text-sm",
									children: [
										"@",
										handle,
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, {
											className: "size-3.5",
											"aria-hidden": "true"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "sr-only",
											children: ["Remove @", handle]
										})
									]
								}) }, handle))
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
								className: "mt-3 flex gap-2",
								onSubmit: (event) => {
									event.preventDefault();
									addHandle();
								},
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
										className: "sr-only",
										htmlFor: "desk-handle",
										children: "Add a creator handle"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										id: "desk-handle",
										value: handleDraft,
										onChange: (event) => setHandleDraft(event.target.value),
										placeholder: "@handle",
										className: "border-line bg-paper text-ink h-11 min-w-0 flex-1 rounded-full border px-3 text-sm"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
										type: "submit",
										className: "border-ink text-ink inline-flex h-11 items-center gap-1 rounded-full border px-3 text-sm font-semibold",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, {
											className: "size-4",
											"aria-hidden": "true"
										}), "Add"]
									})
								]
							})
						]
					}),
					prefs.log.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "bg-sheet border-line rounded-card border p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-xl font-semibold",
							children: "Today’s tape"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "mt-3 space-y-2",
							children: prefs.log.slice(0, 6).map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "text-muted text-sm",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-ink font-medium",
										children: item.action === "repost" ? "Opened" : "Skipped"
									}),
									" ",
									"@",
									item.handle,
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "tabular-nums",
										children: [" · ", relTime(item.at, now)]
									})
								]
							}, `${item.action}-${item.id}-${item.at}`))
						})]
					}) : null
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "order-1 min-w-0 space-y-5 lg:order-2 lg:col-span-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Queue, {
						title: "Clear to repost",
						empty: "Nothing in the last 8 hours clears every gate. The closest posts are under it. Lower a floor or sweep again.",
						items: clear,
						capFull,
						now,
						onRepost: repost,
						onSkip: skip
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Queue, {
						title: "Held",
						empty: "The held pile is empty.",
						items: held,
						capFull,
						now,
						onRepost: repost,
						onSkip: skip
					}),
					opened.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Queue, {
						title: "Opened on X",
						empty: "",
						items: opened,
						capFull: true,
						now,
						onRepost: repost,
						onSkip: skip,
						done: true
					}) : null
				]
			})]
		})]
	});
}
function Rule({ title, detail }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-ink font-medium",
		children: title
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-muted",
		children: detail
	})] });
}
function Floor({ label, value, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "flex items-center justify-between gap-3 text-sm",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-muted",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			type: "number",
			inputMode: "numeric",
			value,
			min: 0,
			onChange: (event) => onChange(clamp(event.target.value, 0, 500, value)),
			className: "border-line bg-paper text-ink h-11 w-20 rounded-xl border px-2 text-right tabular-nums"
		})]
	});
}
function Queue({ title, empty, items, capFull, now, onRepost, onSkip, done = false }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mb-3 flex items-baseline justify-between gap-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
			className: "font-display text-2xl font-semibold",
			children: title
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-muted text-sm tabular-nums",
			children: items.length
		})]
	}), items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "border-line text-muted bg-sheet rounded-card border border-dashed px-4 py-6 text-sm leading-relaxed",
		children: empty
	}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
		className: "space-y-4",
		children: items.map(({ post, gates }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PostCard, {
			post,
			gates,
			now,
			capFull,
			done,
			onRepost: () => onRepost(post),
			onSkip: () => onSkip(post)
		}) }, post.id))
	})] });
}
function PostCard({ post, gates, now, capFull, done, onRepost, onSkip }) {
	const [photo, setPhoto] = (0, import_react.useState)(true);
	const clear = isClear(gates);
	const misses = gates.filter((gate) => !gate.pass);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: "bg-sheet border-line rounded-card relative overflow-hidden border p-4 sm:p-5",
		children: [
			clear ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "border-good text-good pointer-events-none absolute top-4 right-4 -rotate-6 border-2 px-2 py-1 text-xs font-semibold tracking-widest uppercase",
				children: "Clear"
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex gap-3",
				children: [photo && post.avatar ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: post.avatar,
					alt: "",
					width: 48,
					height: 48,
					className: "border-line size-12 shrink-0 rounded-full border object-cover",
					onError: () => setPhoto(false)
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "bg-paper text-ink border-line inline-flex size-12 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
					children: initials(post.authorName)
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "text-ink truncate text-base font-semibold",
						children: post.authorName
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-muted truncate text-sm",
						children: [
							"@",
							post.handle,
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "tabular-nums",
								children: [" · ", relTime(post.postedAt, now)]
							}),
							post.media ? ` · ${post.media}` : ""
						]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-ink mt-3 text-base leading-relaxed whitespace-pre-wrap",
				children: post.text
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
				className: "mt-4 grid grid-cols-3 gap-2 text-center",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Replies",
						value: post.replies
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Reposts",
						value: post.reposts
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Likes",
						value: post.likes
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-4 flex flex-wrap gap-2",
				children: gates.map((gate) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
					title: gate.detail,
					className: gate.pass ? "bg-good text-good-ink rounded-full px-2.5 py-1 text-xs font-medium" : "border-line text-muted rounded-full border px-2.5 py-1 text-xs",
					children: gate.label
				}, gate.key))
			}),
			misses.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-muted mt-3 text-sm leading-relaxed",
				children: misses.map((gate) => gate.detail).join(" ")
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-good mt-3 inline-flex items-center gap-2 text-sm font-medium",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Radio, {
					className: "size-4",
					"aria-hidden": "true"
				}), "Clears the desk. Confirm the repost on X."]
			}),
			post.commenters.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-3 space-y-1",
				children: post.commenters.slice(0, 4).map((person) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "text-muted text-sm leading-snug",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "text-ink",
							children: ["@", person.handle]
						}),
						person.joined ? ` · joined ${person.joined.slice(0, 4)}` : " · join year unseen",
						person.olderUsa ? " · older USA read" : "",
						person.bio ? ` · ${person.bio}` : ""
					]
				}, person.handle))
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 flex flex-wrap gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: onRepost,
						disabled: capFull || done,
						className: "bg-ink text-paper inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-50",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Repeat2, {
							className: "size-4",
							"aria-hidden": "true"
						}), done ? "Opened" : capFull ? "Daily cap hit" : clear ? "Repost" : "Repost anyway"]
					}),
					done ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: onSkip,
						className: "border-line text-ink inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold",
						children: "Skip"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
						href: `https://x.com/${post.handle}/status/${post.id}`,
						target: "_blank",
						rel: "noreferrer",
						className: "border-line text-ink inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExternalLink, {
							className: "size-4",
							"aria-hidden": "true"
						}), "Open"]
					})
				]
			})
		]
	});
}
function Stat({ label, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "bg-paper border-line rounded-xl border px-2 py-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
			className: "text-muted text-xs",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
			className: "text-ink text-lg font-semibold tabular-nums",
			children: value.toLocaleString()
		})]
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RelayDesk, {});
}
//#endregion
export { Home as component };
