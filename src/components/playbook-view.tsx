import {
  AlertOctagon,
  ArrowRight,
  BanknoteArrowDown,
  Compass,
  ListChecks,
  RefreshCcwDot,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Wallet,
} from "lucide-react";
import {
  CATEGORY_LABEL,
  FOUNDATION_ITEMS,
  PROMPT_PACK,
  RED_FLAGS,
  RISK_LABEL,
  STRATEGIES,
  WITHDRAWAL_PATH,
  type EarningStrategy,
} from "@/lib/crypto/playbook";

const CATEGORY_ICON: Record<EarningStrategy["category"], typeof Compass> = {
  "no-capital": Sparkles,
  capital: TrendingUp,
  skill: Target,
};

export function PlaybookView({ onCopyPrompt }: { onCopyPrompt: (promptId: string) => void }) {
  return (
    <section className="playbook-section">
      <div className="honesty-banner" role="note">
        <ShieldAlert size={19} aria-hidden="true" />
        <p>
          <strong>No method can guarantee earnings.</strong> Crypto rewards are lumpy, yields move,
          and anyone promising “guaranteed profit” or “guaranteed withdrawal” is almost certainly
          running a scam. What follows is the strongest legitimate setup for{" "}
          <em>real, withdrawable</em> earnings — ranked by effort, risk, and how often people
          actually get paid.
        </p>
      </div>

      <div className="playbook-hero">
        <div>
          <div className="section-kicker">
            <span className="live-mark" />
            THE BEST SETUP · RANKED
          </div>
          <h2>Six methods that produce real, withdrawable value</h2>
          <p>
            Run the no-capital track daily, the capital track on autopilot, and log everything in
            the Earnings tracker. First withdrawal is the only milestone that matters.
          </p>
        </div>
        <button className="primary-button" type="button" onClick={() => onCopyPrompt("daily-scan")}>
          <RefreshCcwDot size={16} aria-hidden="true" />
          Copy daily automation
        </button>
      </div>

      <div className="playbook-grid">
        {STRATEGIES.map((strategy) => {
          const CategoryIcon = CATEGORY_ICON[strategy.category];
          return (
            <article className="strategy-card" key={strategy.id}>
              <div className="strategy-head">
                <div className="strategy-rank" aria-hidden="true">
                  {strategy.rank}
                </div>
                <div className="strategy-title-block">
                  <div className="card-title-line">
                    <h3>{strategy.name}</h3>
                    <span className={`kind-chip risk-chip risk-${strategy.risk}`}>
                      {RISK_LABEL[strategy.risk]}
                    </span>
                  </div>
                  <div className="strategy-subline">
                    <CategoryIcon size={13} aria-hidden="true" />
                    {CATEGORY_LABEL[strategy.category]}
                  </div>
                </div>
              </div>

              <p className="strategy-summary">{strategy.summary}</p>

              <div className="strategy-meta">
                <div>
                  <span>TIME</span>
                  <strong>{strategy.effort}</strong>
                </div>
                <div>
                  <span>CAPITAL</span>
                  <strong>{strategy.capital}</strong>
                </div>
                <div>
                  <span>REALISTIC RANGE</span>
                  <strong>{strategy.realistic}</strong>
                </div>
              </div>

              <div className="strategy-columns">
                <div>
                  <h4>
                    <ListChecks size={13} aria-hidden="true" /> Setup
                  </h4>
                  <ul>
                    {strategy.setup.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong> — {item.detail}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4>
                    <RefreshCcwDot size={13} aria-hidden="true" /> Daily ops
                  </h4>
                  <ul>
                    {strategy.dailyOps.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4>
                    <BanknoteArrowDown size={13} aria-hidden="true" /> How it withdraws
                  </h4>
                  <ol>
                    {strategy.withdrawPath.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                </div>
              </div>

              <div className="strategy-foot">
                <div className="strategy-flags">
                  {strategy.flags.map((flag) => (
                    <span key={flag}>{flag}</span>
                  ))}
                </div>
                <button
                  className="card-action"
                  type="button"
                  onClick={() => onCopyPrompt(strategy.automation)}
                >
                  Copy its automation <ArrowRight size={15} aria-hidden="true" />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="playbook-lower-grid">
        <section className="foundation-panel">
          <div className="section-kicker">
            <span className="live-mark" />
            FOUNDATION
          </div>
          <h2>
            <Wallet size={18} aria-hidden="true" /> The setup everything else depends on
          </h2>
          <div className="foundation-grid">
            {FOUNDATION_ITEMS.map((item) => (
              <div className="foundation-item" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <aside className="red-flags-panel">
          <div className="section-kicker">
            <span className="live-mark" />
            INSTANT NO
          </div>
          <h2>
            <AlertOctagon size={18} aria-hidden="true" /> Scam red flags
          </h2>
          <p className="red-flags-intro">
            One hit means walk away. Real opportunities survive scrutiny; scams need you to skip it.
          </p>
          <ul className="red-flags-list">
            {RED_FLAGS.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
          <button className="text-button" type="button" onClick={() => onCopyPrompt("vet-offer")}>
            Copy the scam-vetting prompt <ArrowRight size={15} aria-hidden="true" />
          </button>
        </aside>
      </div>

      <section className="withdraw-panel">
        <div className="withdraw-panel-head">
          <div>
            <div className="section-kicker">
              <span className="live-mark" />
              THE ONLY MILESTONE THAT MATTERS
            </div>
            <h2>
              <Trophy size={19} aria-hidden="true" /> Path to your first real withdrawal
            </h2>
            <p>
              Earnings are only real once they reach your bank or your own wallet. This is the exact
              sequence the tracker enforces — earn, receive, withdraw, log.
            </p>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => onCopyPrompt("withdraw-brief")}
          >
            <BanknoteArrowDown size={16} aria-hidden="true" />
            Copy withdrawal brief
          </button>
        </div>
        <div className="path-list">
          {WITHDRAWAL_PATH.map((item) => (
            <div className="path-step" key={item.step}>
              <span className="path-step-num">{item.step}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="prompt-footnote">
          <ShieldAlert size={14} aria-hidden="true" />
          Tax note: most countries treat crypto rewards as taxable income at receipt. Keep your
          tracker records and confirm details with a local tax professional.
        </div>
      </section>

      <section className="prompt-pack-preview">
        <div className="section-kicker">
          <span className="live-mark" />
          AUTOMATION PACK
        </div>
        <h2>Four prompts that run the whole operation</h2>
        <div className="prompt-preview-grid">
          {PROMPT_PACK.map((item) => (
            <button
              key={item.id}
              type="button"
              className="prompt-preview-card"
              onClick={() => onCopyPrompt(item.id)}
            >
              <span className="prompt-preview-when">{item.when}</span>
              <strong>{item.name}</strong>
              <span className="prompt-preview-summary">{item.summary}</span>
              <span className="prompt-preview-cta">
                Copy prompt <ArrowRight size={13} aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}
