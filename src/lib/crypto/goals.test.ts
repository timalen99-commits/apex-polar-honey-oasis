import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyHttpError,
  isRetryableLlmCode,
  defaultBrainConfig,
  readyProviders,
  type BrainConfig,
} from "./llm.ts";
import {
  DEFAULT_DAILY_GOAL_USD,
  LEVEL_TITLES,
  defaultGoals,
  levelForXp,
  pacePerHourUsd,
  rollDay,
  todayKey,
} from "./goals.ts";

describe("levelForXp", () => {
  it("starts at level 1 with a starter title", () => {
    const info = levelForXp(0);
    assert.equal(info.level, 1);
    assert.equal(info.title, LEVEL_TITLES[0]);
    assert.equal(info.intoLevel, 0);
  });

  it("levels up at the 100 / 300 / 600 XP thresholds", () => {
    assert.equal(levelForXp(99).level, 1);
    assert.equal(levelForXp(100).level, 2);
    assert.equal(levelForXp(299).level, 2);
    assert.equal(levelForXp(300).level, 3);
    assert.equal(levelForXp(600).level, 4);
  });

  it("reports progress within the current level", () => {
    const info = levelForXp(350);
    assert.equal(info.level, 3);
    assert.equal(info.intoLevel, 50);
    assert.equal(info.needForNext, 300);
  });

  it("clamps negative XP to zero", () => {
    assert.equal(levelForXp(-20).level, 1);
    assert.equal(levelForXp(-20).intoLevel, 0);
  });

  it("caps the title at the last rank", () => {
    const info = levelForXp(50_000);
    assert.equal(info.title, LEVEL_TITLES[LEVEL_TITLES.length - 1]);
  });
});

describe("pacePerHourUsd", () => {
  it("is zero once the goal is met", () => {
    assert.equal(pacePerHourUsd(40, 40), 0);
    assert.equal(pacePerHourUsd(55, 40), 0);
  });

  it("spreads the remainder over the hours left in the day", () => {
    const now = new Date(2026, 9, 12, 20, 0, 0); // 4 hours left
    assert.equal(pacePerHourUsd(0, 40, now), 10);
    assert.equal(pacePerHourUsd(30, 40, now), 2.5);
  });

  it("never divides by zero near midnight", () => {
    const now = new Date(2026, 9, 12, 23, 59, 0);
    const pace = pacePerHourUsd(0, 40, now);
    assert.ok(Number.isFinite(pace) && pace > 0);
  });
});

describe("rollDay", () => {
  it("resets quest and counter state on a new day", () => {
    const state = {
      ...defaultGoals(),
      questDay: "2026-10-11",
      questDone: ["log-first-earning"],
      scanDay: "2026-10-11",
      scansToday: 4,
      tasksDay: "2026-10-11",
      tasksQueuedToday: 2,
    };
    const next = rollDay(state, "2026-10-12");
    assert.equal(next.questDay, "2026-10-12");
    assert.deepEqual(next.questDone, []);
    assert.equal(next.scansToday, 0);
    assert.equal(next.tasksQueuedToday, 0);
  });

  it("keeps same-day state untouched", () => {
    const day = todayKey();
    const state = {
      ...defaultGoals(),
      questDay: day,
      questDone: ["hit-goal"],
      scanDay: day,
      scansToday: 3,
    };
    const next = rollDay(state, day);
    assert.deepEqual(next.questDone, ["hit-goal"]);
    assert.equal(next.scansToday, 3);
  });
});

describe("defaults", () => {
  it("uses a $40/day default goal", () => {
    assert.equal(DEFAULT_DAILY_GOAL_USD, 40);
    assert.equal(defaultGoals().dailyGoalUsd, 40);
  });
});

describe("llm error classification", () => {
  it("maps HTTP statuses to provider error codes", () => {
    assert.equal(classifyHttpError(401), "auth");
    assert.equal(classifyHttpError(403), "auth");
    assert.equal(classifyHttpError(404), "model");
    assert.equal(classifyHttpError(429), "rate-limit");
    assert.equal(classifyHttpError(500), "upstream");
    assert.equal(classifyHttpError(503), "upstream");
    assert.equal(classifyHttpError(400), "bad-response");
  });

  it("only retries transient failures", () => {
    assert.equal(isRetryableLlmCode("rate-limit"), true);
    assert.equal(isRetryableLlmCode("upstream"), true);
    assert.equal(isRetryableLlmCode("network"), true);
    assert.equal(isRetryableLlmCode("auth"), false);
    assert.equal(isRetryableLlmCode("model"), false);
    assert.equal(isRetryableLlmCode("bad-response"), false);
  });
});

describe("brain provider stack", () => {
  it("only lists enabled providers that have a key", () => {
    const config: BrainConfig = {
      ...defaultBrainConfig(),
      gemini: { apiKey: "g-key", model: "gemini-2.5-flash", enabled: true },
      groq: { apiKey: "q-key", model: "openai/gpt-oss-20b", enabled: false },
      openrouter: { apiKey: "", model: "x:free", enabled: true },
      xai: { apiKey: "xai-key", model: "grok-4.7", enabled: true },
      openai: { apiKey: "", model: "gpt-4o-mini", enabled: true },
    };
    assert.deepEqual(readyProviders(config), ["gemini", "xai"]);
  });

  it("orders the free stack before optional xAI", () => {
    const config = defaultBrainConfig();
    config.gemini.apiKey = "a";
    config.xai = { apiKey: "b", model: "grok-4.7", enabled: true };
    const ready = readyProviders(config);
    assert.ok(ready.indexOf("gemini") < ready.indexOf("xai"));
    assert.deepEqual(ready, ["gemini", "xai"]);
  });

  it("treats server-side env keys as ready even with no pasted key", () => {
    const config = defaultBrainConfig();
    config.xai = { apiKey: "", model: "grok-4.7", enabled: true };
    config.openai = { apiKey: "", model: "gpt-4o-mini", enabled: true };
    const ready = readyProviders(config, {
      xai: true,
      openai: true,
      gemini: false,
      groq: false,
      openrouter: false,
    });
    assert.deepEqual(ready, ["xai", "openai"]);
  });

  it("skips disabled providers even when a server key exists", () => {
    const config = defaultBrainConfig();
    config.groq = { apiKey: "", model: "openai/gpt-oss-20b", enabled: false };
    const ready = readyProviders(config, { groq: true });
    assert.deepEqual(ready, []);
  });
});
