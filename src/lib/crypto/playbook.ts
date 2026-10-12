export type RiskLevel = "lower" | "moderate" | "high";
export type MethodCategory = "no-capital" | "capital" | "skill";

export type StrategyStep = { title: string; detail: string };

export type EarningStrategy = {
  id: string;
  rank: number;
  name: string;
  category: MethodCategory;
  summary: string;
  effort: string;
  capital: string;
  realistic: string;
  risk: RiskLevel;
  setup: StrategyStep[];
  dailyOps: string[];
  withdrawPath: string[];
  automation: string;
  flags: string[];
};

export const CATEGORY_LABEL: Record<MethodCategory, string> = {
  "no-capital": "No capital needed",
  capital: "Capital required",
  skill: "Skill / time based",
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  lower: "Lower risk",
  moderate: "Moderate risk",
  high: "Higher risk",
};

export const STRATEGIES: EarningStrategy[] = [
  {
    id: "airdrop-ops",
    rank: 1,
    name: "Daily Airdrop & Reward Ops",
    category: "no-capital",
    summary:
      "The strongest no-capital setup: hunt fresh, source-backed campaigns daily, complete public tasks, and claim only from verified official pages. Pays in tokens when projects launch — lumpy, but historically the largest upside per hour worked.",
    effort: "20–40 min/day",
    capital: "None",
    realistic: "$0 most months; $50–$1,000+ in good months when a claim pays. Never guaranteed.",
    risk: "moderate",
    setup: [
      {
        title: "Dedicated ops wallet",
        detail:
          "A fresh hot wallet used only for campaign tasks and claims. Keep savings in a separate wallet (ideally hardware). Never reuse the ops seed anywhere.",
      },
      {
        title: "Claim-ready accounts",
        detail:
          "X, Discord, and at least one quest profile (Galxe/Zealy). Accounts must be real and aged — projects filter farmed/fake accounts.",
      },
      {
        title: "Daily scan routine",
        detail:
          "Open ChainScout each morning, run the campaign scan, save candidates to your watchlist, and verify each source link yourself before acting.",
      },
      {
        title: "Eligibility log",
        detail:
          "Record every campaign you complete in the Earnings tracker with the wallet you used. Claims you cannot find later are wasted work.",
      },
    ],
    dailyOps: [
      "Run the daily scan prompt and the in-app campaign scan; check watchlist items for deadlines.",
      "Complete only public, no-cost tasks (follows, testnet usage, content). Stop at anything asking for an upfront payment.",
      "When a claim opens, verify the exact domain from the project's official channels, then claim from the ops wallet only.",
    ],
    withdrawPath: [
      "Claim tokens to your ops wallet and verify receipt on a block explorer.",
      "Convert to a major asset or stablecoin via a reputable swap or exchange — check the token is real first (scam lookalikes exist).",
      "Send to your exchange account or savings wallet with a small test transaction first.",
      "Off-ramp to your bank on an exchange that supports your country, or hold stables as your base.",
    ],
    automation: "daily-scan",
    flags: [
      "Token price can be near zero at claim time",
      "Fake 'claim' sites are the #1 loss vector — always verify the domain",
      "Gas fees on some chains add up on many small claims",
    ],
  },
  {
    id: "points-testnets",
    rank: 2,
    name: "Testnet & Points Programs",
    category: "no-capital",
    summary:
      "Consistent, repeatable engagement: testnet usage, quest platforms, and points campaigns that later convert to rewards. Lower per-event upside than surprise airdrops, but the highest frequency of real payouts over a year.",
    effort: "30–60 min/day",
    capital: "None (testnets are free)",
    realistic:
      "Points carry no guaranteed value; when a program pays, payouts often land in the $50–$5,000 range per program. Many pay nothing.",
    risk: "moderate",
    setup: [
      {
        title: "Quest profiles",
        detail:
          "Set up Galxe/Zeasy-style quest profiles linked to your ops wallet and socials. Complete profile setup once so daily quests are fast.",
      },
      {
        title: "Testnet wallet hygiene",
        detail:
          "Use the ops wallet for testnets. Never bridge real funds into an unaudited testnet app, and never sign blind approvals.",
      },
      {
        title: "Program calendar",
        detail:
          "Track start/end dates and snapshot expectations in the Earnings tracker notes so you know what each effort is worth watching.",
      },
    ],
    dailyOps: [
      "Work the top 3–5 active programs; ignore programs with anonymous teams or unclear token plans.",
      "Prefer protocols with funding, audits, and a plausible token — those are the ones that pay.",
      "Log every program started with the wallet used and expected snapshot date.",
    ],
    withdrawPath: [
      "When a program pays, tokens/points convert land in the linked wallet.",
      "Treat the claim exactly like an airdrop: verify, convert, test-transaction, off-ramp.",
    ],
    automation: "daily-scan",
    flags: [
      "Points can be devalued or cancelled at the team's discretion",
      "Sybil filters can exclude accounts that look farmed",
    ],
  },
  {
    id: "stable-yield",
    rank: 3,
    name: "Established Stablecoin Yield",
    category: "capital",
    summary:
      "The most reliable method where real money earns real, withdrawable yield: lend USDC/USDT on battle-tested money markets (Aave, Morpho, Compound) or reputable exchange savings. Not risk-free — but honest, withdrawable, and no reliance on airdrop luck.",
    effort: "~10 min/week",
    capital: "Start with what you can leave untouched (even $100+)",
    realistic:
      "Roughly 3–10% APY variable on stables today. Rates move with demand. Never 'guaranteed'.",
    risk: "lower",
    setup: [
      {
        title: "Fund via a reputable path",
        detail:
          "Buy stables on an exchange you trust, withdraw to your savings wallet, then deposit into the protocol from the official domain only (bookmark it).",
      },
      {
        title: "Diversify platforms",
        detail:
          "Split across 2–3 venues (e.g. one lending market + one exchange savings) so no single failure is total.",
      },
      {
        title: "Know your exit before you enter",
        detail:
          "Confirm the withdrawal path works with small amounts first. Yield you cannot withdraw is not earnings.",
      },
    ],
    dailyOps: [
      "Weekly: check rates, check the protocol's health (utilization, any governance drama), and skim ChainScout's liquidity feed for comparables.",
      "Compound rewards stay productive unless you need the funds; never chase a rate spike into an unknown protocol.",
    ],
    withdrawPath: [
      "Withdraw from the lending market to your savings wallet (usually instant; some markets have withdrawal queues).",
      "If the stable is on a sidechain/L2, bridge via the canonical bridge or send via your exchange.",
      "Sell to your local currency on your exchange and withdraw to your bank.",
    ],
    automation: "weekly-review",
    flags: [
      "Smart-contract risk (use audited, long-lived protocols only)",
      "Stablecoin depeg risk — a depeg is how 'safe' stable yield loses money",
      "Rates are variable and can fall to near zero",
    ],
  },
  {
    id: "blue-chip-lp",
    rank: 4,
    name: "Blue-chip Liquidity Providing",
    category: "capital",
    summary:
      "Supply liquidity to deep, established pools (stable-stable or ETH/LST pairs) and earn fees plus incentives. Real yield, real withdrawal — but IL and incentive decay are real, so keep it to pairs you understand.",
    effort: "~30 min/week",
    capital: "Comfortably riskable capital only",
    realistic:
      "Roughly 2–25% APY variable depending on the pool and incentives. Fee APY is the durable part.",
    risk: "high",
    setup: [
      {
        title: "Pick depth, not hype",
        detail:
          "Only pools with large TVL, long history, and a reputable DEX. Compare live pools in the Liquidity view — watch for suspiciously high APY with thin TVL.",
      },
      {
        title: "Prefer correlated pairs",
        detail:
          "Stable-stable or ETH/wstETH-type pairs minimize impermanent loss. Avoid two tokens that can diverge 80%.",
      },
      {
        title: "Model the exit cost",
        detail:
          "Check fees and slippage to exit before depositing. A 1% exit cost eats months of a 4% pool.",
      },
    ],
    dailyOps: [
      "Weekly: check your pool's fee APY vs. reward APY split — when incentives dry up, consider rotating.",
      "Watch for TVL collapse or governance changes; exit before the crowd when fundamentals change.",
    ],
    withdrawPath: [
      "Remove liquidity from the pool back to the pair's tokens.",
      "Swap to stables on the same DEX (or a CEX for large size), then follow the stable off-ramp path.",
    ],
    automation: "weekly-review",
    flags: [
      "Impermanent loss can exceed the fees earned",
      "Incentive APY is temporary and often front-loaded",
      "Smart-contract and oracle risk",
    ],
  },
  {
    id: "staking",
    rank: 5,
    name: "Native / Liquid Staking",
    category: "capital",
    summary:
      "Stake majors (ETH, SOL) directly or via established liquid-staking tokens. The slowest, steadiest yield in crypto — closest thing to 'boring real earnings' on-chain, with lockup and validator risk.",
    effort: "~15 min/month",
    capital: "Any amount via exchanges; solo staking needs more",
    realistic: "Roughly 3–8% APY variable, paid in the staked asset.",
    risk: "moderate",
    setup: [
      {
        title: "Choose the venue by size",
        detail:
          "Small amounts: exchange staking is simplest. Larger savings: liquid staking tokens or direct staking from your own wallet keeps custody yours.",
      },
      {
        title: "Understand lockups",
        detail:
          "Unstaking queues (ETH ~days, SOL ~epochs) mean your exit is not instant. Stake only what you won't need suddenly.",
      },
    ],
    dailyOps: [
      "Monthly: check that rewards are compounding and the provider/validator set is healthy.",
    ],
    withdrawPath: [
      "Unstake (wait out the unbonding queue) or sell the liquid-staking token on a DEX/exchange.",
      "Follow the standard convert → test transaction → bank off-ramp path.",
    ],
    automation: "weekly-review",
    flags: [
      "Slashing risk with bad validators",
      "LST depeg risk",
      "Opportunity cost if markets run without you",
    ],
  },
  {
    id: "bounties-work",
    rank: 6,
    name: "Bounties & Paid Crypto Work",
    category: "skill",
    summary:
      "The only method here that is literally work for money: bug bounties (Immunefi-style), content/ambassador programs, design/dev gigs paid in crypto. If you want the closest thing to 'guaranteed' earnings, this is it — you trade skill for payment.",
    effort: "Flexible, project-based",
    capital: "None — your skill and time",
    realistic:
      "$50 per small bounty/content task up to $10,000+ for real security bounties. Paid per completed work.",
    risk: "lower",
    setup: [
      {
        title: "Pick one skill lane",
        detail:
          "Security research, content, design, or development. Depth beats scattering; show real work samples.",
      },
      {
        title: "Payment terms first",
        detail:
          "Agree amount, asset, and deadline in writing before starting. Escrow for anything large. Never accept 'payment after you pay a fee'.",
      },
    ],
    dailyOps: [
      "Check bounty boards and program dashboards for new scopes; keep 2–3 applications in flight.",
      "Deliver on time — repeat clients are the compounding part of this method.",
    ],
    withdrawPath: [
      "Invoices pay out to your wallet or exchange account in USDC/USDT or the platform's token.",
      "Convert to your base asset and off-ramp via your exchange. Keep invoices for tax records.",
    ],
    automation: "weekly-review",
    flags: [
      "Fake 'job' offers that demand upfront fees are pure scam",
      "Payment volatility if paid in a project token — swap to stables early",
    ],
  },
];

export type FoundationItem = { title: string; detail: string };

export const FOUNDATION_ITEMS: FoundationItem[] = [
  {
    title: "Two-wallet system",
    detail:
      "Ops wallet (hot) for tasks, claims, and experiments. Savings wallet (ideally hardware) that never touches airdrop sites. Most drain attacks stop at the ops wallet this way.",
  },
  {
    title: "Secrets are never shared",
    detail:
      "No legitimate project, support agent, or 'admin' ever needs your seed phrase, recovery phrase, or private key. Anyone asking is stealing from you — without exception.",
  },
  {
    title: "Claim-ready accounts",
    detail:
      "Real X, Discord, and quest-platform accounts with 2FA on. Aged and genuine beats ten fresh farmed accounts.",
  },
  {
    title: "Record keeping = withdrawals",
    detail:
      "Every earned amount goes into the Earnings tracker with its claim date, wallet, and status. You cannot withdraw what you lose track of, and tax season needs records.",
  },
  {
    title: "Official links only",
    detail:
      "Bookmark claim pages and exchanges from official channels the first time you use them. Re-type domains yourself; search ads are full of clones.",
  },
  {
    title: "Only risk capital in yield",
    detail:
      "Money you need next month does not belong in LP positions or new protocols. Stable yield and bounties first; risk capital last.",
  },
];

export type WithdrawalStep = { step: string; title: string; detail: string };

export const WITHDRAWAL_PATH: WithdrawalStep[] = [
  {
    step: "01",
    title: "Earn and receive",
    detail:
      "Complete the method's work and confirm the funds actually landed — on a block explorer for on-chain rewards, or in your platform balance for work payments.",
  },
  {
    step: "02",
    title: "Convert to your base",
    detail:
      "Swap reward tokens to a major asset or stablecoin on a reputable venue. Check the token contract is the real one — fake lookalikes are common around claim events.",
  },
  {
    step: "03",
    title: "Test transaction",
    detail:
      "Moving anything significant? Send a small test amount first and confirm it arrives before sending the rest. This one habit saves entire balances.",
  },
  {
    step: "04",
    title: "Off-ramp to your bank",
    detail:
      "Use an exchange that supports withdrawals to your country (bank transfer, or card where available). Complete KYC on that platform before you need it. P2P only with established escrow and care.",
  },
  {
    step: "05",
    title: "Log it as withdrawn",
    detail:
      "Mark the entry withdrawn in your tracker with the method and date. Keep records — gains are taxable in most jurisdictions.",
  },
];

export const RED_FLAGS: string[] = [
  "Any 'guaranteed' returns, fixed APY, or 'risk-free' crypto earning",
  "Requests for your seed phrase, recovery phrase, or private key — ever",
  "Upfront fees, 'taxes', or deposits required to unlock or withdraw a prize",
  "Unsolicited DMs, 'support agents', or admin accounts that contacted you first",
  "Lookalike domains, search-ad links, and shortened URLs for claim pages",
  "Pressure to sign blind wallet approvals or 'just one transaction' quickly",
  "Anonymous teams, unaudited contracts, or yields far above every honest comparable",
  "Withdrawal fees demanded in advance, or 'verify your wallet' wallet-connection requests",
];

export type PromptPackItem = {
  id: string;
  name: string;
  when: string;
  summary: string;
  prompt: string;
};

export const PROMPT_PACK: PromptPackItem[] = [
  {
    id: "daily-scan",
    name: "Daily Opportunity Scan",
    when: "Every day · 08:00 UTC",
    summary: "Fresh airdrops, giveaways, and yield — dated sources only, no invented results.",
    prompt: `You are my cautious, research-only crypto opportunity scout. Run this check once per day at 08:00 UTC, and never take actions for me.

1. Search public, dated sources from the last 24 hours for active airdrops, retroactive reward programs, and no-purchase crypto giveaways. Prioritize announcements on a project's official site or an account linked from that site. Include the original source URL and its publish date for every item. If authenticity or current status is unclear, label it UNCONFIRMED or omit it. If nothing qualifies, say so plainly; never invent opportunities, rewards, dates, eligibility, or links.
2. Check public DeFi yield data (for example, DeFiLlama) and report a small set of pools with protocol, chain, pair, current TVL, current APY, base-versus-reward APY, and the exact time checked. Treat APY as variable and not a forecast. Flag unusually high APY, low TVL, non-stable assets, smart-contract / bridge risk, and possible impermanent loss. Do not call a pool safe or promise a return.
3. Exclude unsolicited DMs, referral spam, guaranteed-profit language, expired campaigns, and anything asking for a seed phrase, recovery phrase, private key, upfront fee, or transfer to unlock a reward.
4. Do not connect a wallet, claim, trade, bridge, stake, deposit, approve a contract, sign a message, or send funds. Do not ask me for wallet secrets. Return research only and wait for my explicit review before any next step.

Format the result as a concise table with: type, project, chain, current status, published/checked time (UTC), reward or APY, public eligibility, source URL, and risk flags. Put a short scam-safety checklist at the end. State clearly that rewards are not guaranteed and daily income is not promised.`,
  },
  {
    id: "vet-offer",
    name: "Offer & Scam Vetting",
    when: "Before touching any offer",
    summary: "Paste any airdrop, DM, or link and get a source-verified verdict before you act.",
    prompt: `Act as my research-only offer screener. I will paste an offer, DM, airdrop announcement, or URL. Never connect a wallet, sign anything, claim, trade, or send funds — and never ask for my seed phrase or private keys.

For the offer I paste:
1. Identify the project and find its established official website and official social accounts. Treat any link in the offer as untrusted until you can verify it is linked from those established channels. Report exact domains and flag lookalikes or typosquats.
2. Check whether the offer is real and currently active: official announcement URL and date, eligibility rules, whether it asks for any payment, deposit, approval, or wallet connection, and whether the reward terms are consistent across sources.
3. List concrete red flags (guaranteed returns, upfront fees, seed-phrase or 'wallet verification' asks, urgency/pressure, unsolicited contact, anonymous team, unaudited contracts, blind approvals).
4. Give a verdict of CONFIRMED OFFICIAL, UNCONFIRMED, or LIKELY SCAM, with your confidence and the exact evidence URLs. When sources conflict or are missing, say so — never fill gaps with guesses.

End with the safest next step for me to take manually, and repeat that you have taken no action.`,
  },
  {
    id: "weekly-review",
    name: "Weekly Earnings & Risk Review",
    when: "Every Sunday",
    summary: "Review what I actually earned, what's pending, and where to focus next week.",
    prompt: `Act as my research-only earnings reviewer. I will paste my earnings log (entries with date, source/method, amount, and status: pending / received / withdrawn). Never connect to anything, transact, or ask for wallet secrets.

1. Summarize realized earnings (received + withdrawn), pending amounts, and my real withdrawal rate. Distinguish money actually in my possession from expected or unclaimed amounts.
2. Flag anything stale: pending entries older than 30 days, claims I should verify, or entries missing a withdrawal path. Note where a reward token's price risk is unmanaged (holding everything in the reward token vs. converting to stables).
3. Check my methods against current risk: concentration in one protocol/platform, stablecoin depeg exposure, contract risk, and any reliance on incentive APY that may decay.
4. Recommend next week's focus based on effort vs. expected value from my log: continue, rotate, or stop each method. If capital is idle and my risk tolerance is conservative, compare current safe stable yield options with their sources and dates.

Format: a short P&L table, a risk list, and a next-week plan of at most 5 actions. State clearly that past results do not guarantee future earnings.`,
  },
  {
    id: "withdraw-brief",
    name: "Safe Withdrawal Brief",
    when: "Every time I cash out",
    summary: "Official routes, test transactions, fees and taxes for getting value out safely.",
    prompt: `Act as my research-only withdrawal guide. I will tell you the asset, approximate amount, platform it sits on, and my country. Never connect a wallet, initiate transfers, sign anything, or ask for my seed phrase, private keys, or exchange codes.

1. Research the current, official off-ramp routes available in my country (exchanges that support bank withdrawal of this asset), and the canonical path to get the funds there from where they sit (native transfer, official bridge, or exchange deposit address). Cite official docs/URLs for each step and warn about unofficial bridges and P2P scams.
2. Give the concrete safe sequence: convert to a base asset or stablecoin if needed (real venue only), send a small test transaction first, confirm receipt, then send the remainder. Include the exact checks at each step (network matches the deposit address, contract addresses verified from official sources, fee estimate).
3. Estimate realistic fees and timing, and note tax/reporting basics for my jurisdiction at a high level with a reminder that I should confirm with a local tax professional.
4. List the specific scams that target people at withdrawal time: fake support, 'withdrawal verification' wallet connects, advance-fee demands, phishing 'exchange' sites, and QR/address swap malware.

Format: a numbered checklist I can follow manually, a red-flag list, and sources. End with the reminder that you have taken no action.`,
  },
];
