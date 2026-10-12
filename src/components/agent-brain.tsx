import { useCallback, useEffect, useState } from "react";
import {
  Brain,
  Check,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import {
  LLM_PROVIDER_ORDER,
  LLM_PROVIDERS,
  brainEnvStatus,
  loadBrainConfig,
  saveBrainConfig,
  testBrainProvider,
  type BrainConfig,
  type LlmProvider,
  type ServerKeyStatus,
} from "@/lib/crypto/llm";
import { awardXp, loadGoalsRolled, saveGoals } from "@/lib/crypto/goals";

type TestState = { status: "idle" | "testing" | "ok" | "fail"; message: string };

const EMPTY_TEST: TestState = { status: "idle", message: "" };

export function AgentBrainView() {
  const [config, setConfig] = useState<BrainConfig>(() => loadBrainConfig());
  const [showKeys, setShowKeys] = useState<Partial<Record<LlmProvider, boolean>>>({});
  const [tests, setTests] = useState<Partial<Record<LlmProvider, TestState>>>({});
  const [serverKeys, setServerKeys] = useState<ServerKeyStatus>({});
  const [toast, setToast] = useState("");

  useEffect(() => {
    let cancelled = false;
    void brainEnvStatus()
      .then((status) => {
        if (!cancelled) setServerKeys(status);
      })
      .catch(() => {
        // Server probe is best-effort; pasted keys still work without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const update = useCallback((next: BrainConfig) => {
    setConfig(next);
    saveBrainConfig(next);
  }, []);

  const patchProvider = useCallback(
    (
      provider: LlmProvider,
      patch: Partial<{ apiKey: string; model: string; enabled: boolean }>,
    ) => {
      update({ ...config, [provider]: { ...config[provider], ...patch } });
    },
    [config, update],
  );

  const runTest = useCallback(
    async (provider: LlmProvider) => {
      const cfg = config[provider];
      if (!cfg.apiKey && !serverKeys[provider]) {
        setTests((prev) => ({
          ...prev,
          [provider]: { status: "fail", message: "Paste an API key first." },
        }));
        return;
      }
      setTests((prev) => ({ ...prev, [provider]: { status: "testing", message: "Checking…" } }));
      const result = await testBrainProvider(provider, config);
      if (result.ok) {
        setTests((prev) => ({
          ...prev,
          [provider]: { status: "ok", message: `Connected · ${result.model} replied.` },
        }));
        const goals = loadGoalsRolled();
        const firstConnect = !goals.brainConnected;
        if (firstConnect) {
          goals.brainConnected = true;
          goals.brainDay = goals.questDay;
          saveGoals(goals);
          const award = awardXp("connect-brain");
          setToast(
            award?.leveledUp
              ? `Brain connected! ${award.message} — Level ${award.level.level}: ${award.level.title}`
              : `Brain connected! ${award?.message ?? "+30 XP"}`,
          );
        } else {
          setToast(`${LLM_PROVIDERS[provider].label} says hello.`);
        }
      } else {
        setTests((prev) => ({
          ...prev,
          [provider]: { status: "fail", message: result.error },
        }));
      }
    },
    [config, serverKeys],
  );

  const readyCount = LLM_PROVIDER_ORDER.filter(
    (id) => config[id].enabled && (config[id].apiKey || serverKeys[id]),
  ).length;

  return (
    <section className="brain-section" aria-label="Agent brain setup">
      <div className="brain-hero">
        <span className="agent-symbol" aria-hidden="true">
          <Brain size={19} />
        </span>
        <div className="brain-hero-copy">
          <span className="micro-label">AGENT BRAIN · FREE-FIRST STACK</span>
          <h2>Give your agent a brain — free tiers stacked</h2>
          <p>
            Stack <strong>Google Gemini</strong>, <strong>Groq</strong>, and{" "}
            <strong>OpenRouter</strong> free tiers (no credit card) and the agent auto-rotates when
            one rate-limits. <strong>xAI Grok</strong> is an optional add-on — its API has no
            permanent free tier, but new console.x.ai accounts often get ~$25 in promo credits (a
            card may be needed to activate).
          </p>
          <p className="brain-hero-note">
            Keys are stored only in this browser and sent straight to the provider. We never ask for
            keys in chat.
          </p>
        </div>
        <div className="brain-ready-card" aria-live="polite">
          <span className="micro-label">STACK STATUS</span>
          <strong>
            {readyCount} of {LLM_PROVIDER_ORDER.length} ready
          </strong>
          <span>
            {readyCount === 0
              ? "Add one free key below to switch the agent on."
              : readyCount === 1
                ? "One brain online — the agent can think."
                : "Rotating stack — rate limits won't stop the grind."}
          </span>
        </div>
      </div>

      <div className="brain-steps">
        {[
          {
            step: "1",
            title: "Open a free key page",
            body: "Gemini or Groq takes about two minutes and needs no credit card.",
          },
          {
            step: "2",
            title: "Create a key and copy it",
            body: "Keys are shown once at creation. Keep it out of chats and screenshots.",
          },
          {
            step: "3",
            title: "Paste it here and test",
            body: "The test sends one tiny prompt so you know the line works before the grind.",
          },
        ].map((item) => (
          <div className="brain-step" key={item.step}>
            <span className="path-step-num">{item.step}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="provider-grid">
        {LLM_PROVIDER_ORDER.map((id) => {
          const info = LLM_PROVIDERS[id];
          const cfg = config[id];
          const test = tests[id] ?? EMPTY_TEST;
          const hasKey = cfg.apiKey.length > 0;
          return (
            <article
              className={`provider-card ${id === "xai" ? "provider-optional" : ""}`}
              key={id}
            >
              <header className="provider-head">
                <div>
                  <h3>{info.label}</h3>
                  <p className="provider-free-note">{info.freeNote}</p>
                  {serverKeys[id] ? (
                    <p className="provider-server-key">
                      <Lock size={10} /> Server key active — works without pasting one here.
                    </p>
                  ) : null}
                </div>
                <label className="provider-toggle">
                  <input
                    type="checkbox"
                    checked={cfg.enabled}
                    onChange={(event) => patchProvider(id, { enabled: event.target.checked })}
                  />
                  <span>enabled</span>
                </label>
              </header>

              <label className="field-label" htmlFor={`key-${id}`}>
                API key
              </label>
              <div className="provider-key-row">
                <input
                  id={`key-${id}`}
                  type={showKeys[id] ? "text" : "password"}
                  value={cfg.apiKey}
                  placeholder={id === "xai" ? "xai-…" : "Paste key…"}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => patchProvider(id, { apiKey: event.target.value.trim() })}
                />
                <button
                  className="icon-button"
                  type="button"
                  aria-label={showKeys[id] ? "Hide key" : "Show key"}
                  onClick={() => setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }))}
                >
                  {showKeys[id] ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              <label className="field-label" htmlFor={`model-${id}`}>
                Model
              </label>
              <input
                id={`model-${id}`}
                className="provider-model"
                type="text"
                value={cfg.model}
                spellCheck={false}
                onChange={(event) => patchProvider(id, { model: event.target.value.trim() })}
              />

              <div className="provider-actions">
                <button
                  className="secondary-button small-primary"
                  type="button"
                  disabled={test.status === "testing"}
                  onClick={() => void runTest(id)}
                >
                  {test.status === "testing" ? (
                    <LoaderCircle size={13} className="spin" />
                  ) : (
                    <RefreshCw size={13} />
                  )}
                  Test
                </button>
                <a className="provider-link" href={info.keyUrl} target="_blank" rel="noreferrer">
                  Get key <ExternalLink size={11} />
                </a>
              </div>

              {test.status !== "idle" ? (
                <p className={`provider-test provider-test-${test.status}`} role="status">
                  {test.status === "testing" ? (
                    <LoaderCircle size={12} className="spin" />
                  ) : test.status === "ok" ? (
                    <CheckCircle2 size={12} />
                  ) : (
                    <XCircle size={12} />
                  )}
                  {test.message}
                </p>
              ) : (
                <p className="provider-test">
                  {hasKey ? (
                    cfg.enabled ? (
                      <>
                        <Check size={12} /> Pasted key ready — overrides the server key.
                      </>
                    ) : (
                      <>
                        <X size={12} /> Disabled — skipped by the agent.
                      </>
                    )
                  ) : serverKeys[id] ? (
                    <>
                      <Lock size={12} /> Server key ready — nothing to paste.
                    </>
                  ) : (
                    <>
                      <KeyRound size={12} /> {info.keyHint}
                    </>
                  )}
                </p>
              )}
            </article>
          );
        })}
      </div>

      <div className="brain-footnotes">
        <p>
          <ShieldCheck size={13} /> <strong>How the stack works:</strong> the agent tries providers
          in order — Gemini → Groq → OpenRouter → xAI → OpenAI (free first, paid last to protect
          balances). Hit a rate limit and it cools that provider for 90 seconds and keeps going on
          the next brain. Keys live in this browser only (<code>chainscout.brain.v1</code>) or in
          the server&apos;s <code>.env</code>, and are never included in exports or chat.
        </p>
        <p>
          <Sparkles size={13} /> <strong>About xAI keys:</strong> only console.x.ai can issue a key
          — an app cannot mint one. Sign up there (free) and check the Credits section for promo
          credits before adding any billing. If you skip xAI, the free stack is enough for the agent
          to plan, draft, and grind.
        </p>
        <p>
          <Lock size={13} /> <strong>Safety:</strong> the brain writes and researches. It never
          connects a wallet or signs anything by itself — every wallet action will wait behind an
          approval card and your wallet popup when wallet features land.
        </p>
      </div>

      {toast ? (
        <div className="toast-message" role="status">
          <CheckCircle2 size={15} />
          {toast}
        </div>
      ) : null}
    </section>
  );
}
