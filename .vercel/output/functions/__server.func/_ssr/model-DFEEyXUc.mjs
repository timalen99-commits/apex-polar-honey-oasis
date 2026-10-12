//#region node_modules/.nitro/vite/services/ssr/assets/model-DFEEyXUc.js
var DEFAULT_DESK = [
	"catturd2",
	"GuntherEagleman",
	"DC_Draino",
	"RealJamesWoods",
	"MarkLevinShow",
	"seanhannity",
	"larryelder",
	"ScottPresler",
	"DineshDSouza",
	"TuckerCarlson"
];
var TWITTER_EPOCH = 1288834974657n;
function joinedFromId(id) {
	if (!id || !/^\d{6,22}$/.test(id)) return void 0;
	try {
		const ms = (BigInt(id) >> 22n) + TWITTER_EPOCH;
		const date = new Date(Number(ms));
		const year = date.getUTCFullYear();
		if (Number.isNaN(date.getTime()) || year < 2006 || year > 2027) return void 0;
		return date.toISOString();
	} catch {
		return;
	}
}
function inferOlderUsa(bio, name = "") {
	const blob = `${name} ${bio}`;
	if (/\b(india|indian|pakistan|ukrain|lagos|delhi|mumbai|brasil|brazil|nigeria|beijing|china)\b/i.test(blob) && !/\b(usa|u\.s\.|america|american|florida|texas)\b/i.test(blob)) return false;
	const age = /\b(retired|veteran|grandma|grandpa|grandmother|grandfather|mom\b|dad\b|mother|father|dar\b|boomer|widow|senior|generational)\b/i.test(blob);
	const usa = /\b(usa|u\.s\.|united states|america|american|maga|florida|texas|ohio|patriot|veteran|trump|constitution|god bless|dar\b|retired)\b/i.test(blob);
	return age && usa;
}
function yearOf(iso) {
	if (!iso) return null;
	const year = new Date(iso).getUTCFullYear();
	return Number.isNaN(year) ? null : year;
}
function relTime(iso, now = Date.now()) {
	const delta = now - Date.parse(iso);
	if (!Number.isFinite(delta)) return "unknown time";
	const mins = Math.round(delta / 6e4);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 48) return `${hours}h ${mins % 60}m ago`;
	return `${Math.floor(hours / 24)}d ago`;
}
function inWindow(iso, now = Date.now()) {
	const delta = now - Date.parse(iso);
	return delta >= -6e4 && delta <= 288e5;
}
function onDesk(handle, desk) {
	const key = handle.replace(/^@/, "").toLowerCase();
	return desk.some((name) => name.replace(/^@/, "").toLowerCase() === key);
}
function scorePost(post, desk, floors, now = Date.now()) {
	const sample = post.commenters.length;
	const older = post.commenters.filter((c) => c.olderUsa).length;
	const pct = sample === 0 ? 0 : Math.round(older / sample * 100);
	const newcomers = post.commenters.filter((c) => yearOf(c.joined) === 2026).length;
	const deskHit = onDesk(post.handle, desk);
	return [
		{
			key: "window",
			label: "Last 8 hours",
			pass: inWindow(post.postedAt, now),
			detail: inWindow(post.postedAt, now) ? `Posted ${relTime(post.postedAt, now)}.` : `Posted ${relTime(post.postedAt, now)} — outside the 8-hour window.`
		},
		{
			key: "mention",
			label: "Mentions Elon",
			pass: post.mentionsElon,
			detail: post.mentionsElon ? "Elon is named in the post." : "Elon is not named."
		},
		{
			key: "desk",
			label: "Patriot desk",
			pass: deskHit,
			detail: deskHit ? post.creatorNote || "On the Catturd-style desk." : post.creatorNote || "Not on the retired-patriot desk."
		},
		{
			key: "replies",
			label: `${floors.minReplies}+ replies`,
			pass: post.replies >= floors.minReplies,
			detail: `${post.replies.toLocaleString()} replies.`
		},
		{
			key: "reposts",
			label: `${floors.minReposts}+ reposts`,
			pass: post.reposts >= floors.minReposts,
			detail: `${post.reposts.toLocaleString()} reposts.`
		},
		{
			key: "audience",
			label: "Older USA ≥ 80%",
			pass: sample >= 5 && pct >= 80,
			detail: sample < 5 ? `${older} of ${sample} sampled replies read as older USA. Need 5 before 80% counts.` : `${pct}% of ${sample} sampled replies read as older USA.`
		},
		{
			key: "newcomers",
			label: `${floors.minNew}+ joined in 2026`,
			pass: newcomers >= floors.minNew,
			detail: newcomers === 0 ? "No 2026 accounts in the sampled replies." : `${newcomers} sampled repl${newcomers === 1 ? "y" : "ies"} joined in 2026.`
		}
	];
}
function passedCount(gates) {
	return gates.filter((g) => g.pass).length;
}
function isClear(gates) {
	return gates.every((g) => g.pass);
}
function commenter(handle, name, bio, joined, olderUsa) {
	return {
		handle,
		name,
		bio,
		joined,
		olderUsa: olderUsa ?? inferOlderUsa(bio, name)
	};
}
/** Real posts from the morning of 12 Oct 2026. Counts were live at snapshot time. */
var SEED_POSTS = [
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
			commenter("TheSilverJMung", "JMung", "American/British guy back in Florida. Software engineering.", void 0, false),
			commenter("shopkins776", "Cave Man Steve", "Political satire. Conservative.", void 0, false)
		]
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
			commenter("ThePatriotTea", "ThePatriot", "America First. Breaking ICE, ballot and court news.", void 0, false),
			commenter("drtaubraun", "Dr. Tau Braun", "Counterterrorism and Biothreat Expert.", void 0, false),
			commenter("ExiledonMoon", "The Lunar Misfit", "The news, decoded.", void 0, false)
		]
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
			commenter("bbear111670", "bbear1116", "Constitutional Conservative, MAGA, deep faith. Female.", "2023-05-09T22:33:03.316Z", false),
			commenter("Ice85942789", "SBR/ICE", "DAR Member", void 0, true),
			commenter("Lynyrds_Mom", "LynyrdsMom", "Descendant of Revolutionary and Civil war Patriots. A generational Republican.", "2022-03-01T10:47:02.600Z", true),
			commenter("SSailor8", "eelonstusk", "Critical of the MAGA replies on this post.", void 0, false),
			commenter("bill_adkins_dem", "bill adkins", "Replying against the post. Not an older USA patriot reader.", void 0, false)
		]
	}
];
//#endregion
export { joinedFromId as a, scorePost as c, isClear as i, SEED_POSTS as n, passedCount as o, inferOlderUsa as r, relTime as s, DEFAULT_DESK as t };
