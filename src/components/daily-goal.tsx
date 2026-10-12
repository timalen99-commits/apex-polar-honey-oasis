import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Flame,
  ListChecks,
  LoaderCircle,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import {
  levelForXp,
  loadGoalsRolled,
  pacePerHourUsd,
  questList,
  todayEarnedUsd,
  type GoalsState,
  type Quest,
} from "@/lib/crypto/goals";
import { LLM_PROVIDER_ORDER, loadBrainConfig, readyProviders } from "@/lib/crypto/llm";

type Navigate = (view: "jobs" | "earnings" | "overview" | "brain" | "grind") => void;

function fmtUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function GoalRing({ earned, goal }: { earned: number; goal: number }) {
  const radius = 82;
  const stroke = 14;
  const circumference = 2 * Math.PI * radius;
  const ratio = goal > 0 ? Math.min(earned / goal, 1) : 0;
  const dash = circumference * ratio;
  return (
    <div className="goal-ring" role="img" aria-label={`${fmtUsd(earned)} of ${fmtUsd(goal)} goal`}>
      <svg viewBox="0 0 200 200" width="200" height="200">
        <circle
          className="goal-ring-track"
          cx="100"
          cy="100"
          r={radius}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          className="goal-ring-fill"
          cx="100"
          cy="100"
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 100 100)"
        />
      </svg>
      <div className="goal-ring-center">
        <span className="micro-label">TODAY</span>
        <strong>{fmtUsd(earned)}</strong>
        <span>of {fmtUsd(goal)} target</span>
      </div>
    </div>
  );
}

function QuestCard({ quest, onNavigate }: { quest: Quest; onNavigate: Navigate }) {
  const ratio = quest.goal > 0 ? Math.min(quest.progress / quest.goal, 1) : 0;
  return (
    <article className={`quest-card ${quest.done ? "quest-done" : ""}`}>
      <div className="quest-top">
        <span className="quest-check" aria-hidden="true">
          {quest.done ? <CheckCircle2 size={16} /> : <ListChecks size={16} />}
        </span>
        <div className="quest-copy">
          <strong>{quest.title}</strong>
          <p>{quest.detail}</p>
        </div>
        <span className="quest-xp">+{quest.xp} XP</span>
      </div>
      <div className="quest-bottom">
        <div
          className="quest-progress"
          role="progressbar"
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
        <span className="quest-figures">
          {quest.unit === "usd"
            ? `${fmtUsd(quest.progress)} / ${fmtUsd(quest.goal)}`
            : `${Math.min(quest.progress, quest.goal)} / ${quest.goal}`}
        </span>
        {!quest.done ? (
          <button className="text-button" type="button" onClick={() => onNavigate(quest.action.go)}>
            {quest.action.label} <ArrowRight size={13} />
          </button>
        ) : (
          <span className="quest-complete-tag">Done</span>
        )}
      </div>
    </article>
  );
}

export function DailyGoalView({ onNavigate }: { onNavigate: Navigate }) {
  const [goals, setGoals] = useState<GoalsState | null>(null);
  const [earned, setEarned] = useState(0);
  const [brainReady, setBrainReady] = useState(0);

  const refresh = useCallback(() => {
    const state = loadGoalsRolled();
    setGoals(state);
    setEarned(todayEarnedUsd());
    setBrainReady(readyProviders(loadBrainConfig()).length);
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("chainscout:goals", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("chainscout:goals", handler);
      window.removeEventListener("storage", handler);
    };
  }, [refresh]);

  if (!goals) {
    return (
      <section className="quests-section" aria-label="Daily quests">
        <div className="empty-state compact-empty">
          <LoaderCircle size={22} className="spin" />
          <h3>Warming up the quest board…</h3>
        </div>
      </section>
    );
  }

  const goalUsd = goals.dailyGoalUsd;
  const pct = goalUsd > 0 ? Math.min(Math.round((earned / goalUsd) * 100), 100) : 0;
  const pace = pacePerHourUsd(earned, goalUsd);
  const quests = questList(goals);
  const questsDone = quests.filter((q) => q.done).length;
  const levelInfo = levelForXp(goals.xp);

  return (
    <section className="quests-section" aria-label="Daily quests">
      <div className="quests-hero">
        <GoalRing earned={earned} goal={goalUsd} />
        <div className="quests-hero-copy">
          <span className="micro-label">DAILY GRIND · TARGET $40/DAY</span>
          <h2>
            {earned >= goalUsd
              ? "Goal crushed. That's how it's done."
              : pct >= 50
                ? "Halfway there — keep the streak alive."
                : "Today's target is a hunt, not a promise."}
          </h2>
          <p>
            {earned >= goalUsd
              ? "Every dollar above the line is gravy. Log anything else that lands and bank the streak."
              : `To reach ${fmtUsd(goalUsd)} by midnight you need about ${fmtUsd(pace)}/hour of real logged work. The agent queues the jobs — you approve, grind, and log the payouts.`}
          </p>
          <div className="quests-hero-chips">
            <span className="streak-chip">
              <Flame size={13} /> {goals.streakDays}-day streak
            </span>
            <span className="level-chip">
              <Trophy size={13} /> Lv {levelInfo.level} · {levelInfo.title} · {goals.xp} XP
            </span>
            <span className="quests-chip">
              <Target size={13} /> {questsDone}/{quests.length} quests done
            </span>
            <span className={`brain-chip ${brainReady > 0 ? "brain-chip-live" : ""}`}>
              <Brain size={13} />{" "}
              {brainReady > 0
                ? `${brainReady}/${LLM_PROVIDER_ORDER.length} brains online`
                : "No brain yet"}
            </span>
          </div>
          <p className="quests-honesty">
            <Zap size={12} /> Only real earnings from your log count toward the ring. XP and streaks
            are play — never money. The target is what we grind for; actual results vary with task
            supply, eligibility, and luck.
          </p>
        </div>
        <div className="quests-side-actions">
          <button className="secondary-button" type="button" onClick={() => onNavigate("brain")}>
            <Brain size={14} /> Agent brain
          </button>
          <button className="secondary-button" type="button" onClick={() => onNavigate("jobs")}>
            <ListChecks size={14} /> Open jobs
          </button>
          <button className="primary-button" type="button" onClick={() => onNavigate("earnings")}>
            Log an earning
          </button>
        </div>
      </div>

      <div className="quests-list-head">
        <div>
          <div className="section-kicker">
            <span className="live-mark" />
            TODAY'S QUESTS
          </div>
          <h2>Small jobs. Real money. Daily quests.</h2>
        </div>
        <span className="result-count">
          {questsDone} of {quests.length} complete
        </span>
      </div>

      <div className="quest-list">
        {quests.map((quest) => (
          <QuestCard key={quest.id} quest={quest} onNavigate={onNavigate} />
        ))}
      </div>
    </section>
  );
}
