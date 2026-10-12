import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SCHEDULER,
  draftDueInMs,
  dueActions,
  huntDueInMs,
  recordRun,
  type SchedulerState,
} from "./scheduler.ts";
import { PAYOUT_RAILS, railForMethod, railSummaries, unmatchedRailCount } from "./payouts.ts";
import type { EarningEntry } from "./earnings-store.ts";

const NOW = new Date("2026-10-12T12:00:00Z");

function state(overrides: Partial<SchedulerState>): SchedulerState {
  return { ...DEFAULT_SCHEDULER, runs: [], ...overrides };
}

describe("huntDueInMs", () => {
  it("never auto-hunts before the first manual hunt arms the loop", () => {
    assert.equal(huntDueInMs(state({ lastHuntAt: "" }), NOW), Number.POSITIVE_INFINITY);
  });

  it("is due once the interval has elapsed and zero when overdue", () => {
    const recent = state({ lastHuntAt: new Date(NOW.getTime() - 10 * 60_000).toISOString() });
    assert.ok(huntDueInMs(recent, NOW) > 0);
    const overdue = state({ lastHuntAt: new Date(NOW.getTime() - 60 * 60_000).toISOString() });
    assert.equal(huntDueInMs(overdue, NOW), 0);
  });

  it("is disabled when the scheduler is off", () => {
    const s = state({ enabled: false, lastHuntAt: new Date(0).toISOString() });
    assert.equal(huntDueInMs(s, NOW), Number.POSITIVE_INFINITY);
  });

  it("clamps tiny intervals to five minutes", () => {
    const s = state({
      autoHuntMins: 1,
      lastHuntAt: new Date(NOW.getTime() - 2 * 60_000).toISOString(),
    });
    assert.ok(huntDueInMs(s, NOW) > 0);
  });
});

describe("draftDueInMs", () => {
  it("is due immediately when auto-draft has never run", () => {
    assert.equal(draftDueInMs(state({ lastDraftAt: "" }), NOW), 0);
  });

  it("respects the 15-minute cadence and the auto-draft toggle", () => {
    const ran = state({ lastDraftAt: new Date(NOW.getTime() - 5 * 60_000).toISOString() });
    assert.ok(draftDueInMs(ran, NOW) > 0);
    const off = state({ autoDraft: false, lastDraftAt: new Date(0).toISOString() });
    assert.equal(draftDueInMs(off, NOW), Number.POSITIVE_INFINITY);
  });
});

describe("dueActions", () => {
  it("returns nothing when disabled", () => {
    assert.deepEqual(dueActions(state({ enabled: false }), NOW), []);
  });

  it("plans and checks in once per local day", () => {
    const first = dueActions(state({}), NOW);
    assert.ok(first.includes("plan"));
    assert.ok(first.includes("check-in"));
    const after = recordRun(recordRun(state({}), "plan", "built", NOW), "check-in", "hi", NOW);
    const next = dueActions(after, NOW);
    assert.ok(!next.includes("plan"));
    assert.ok(!next.includes("check-in"));
  });

  it("rolls the plan over on a new day", () => {
    const s = recordRun(state({}), "plan", "built", NOW);
    const tomorrow = new Date(NOW.getTime() + 25 * 3_600_000);
    assert.ok(dueActions(s, tomorrow).includes("plan"));
  });

  it("includes hunt and draft only when their timers are due", () => {
    const s = state({
      lastPlanDay: "2026-10-12",
      lastCheckInDay: "2026-10-12",
      lastHuntAt: new Date(NOW.getTime() - 90 * 60_000).toISOString(),
      lastDraftAt: new Date(NOW.getTime() - 20 * 60_000).toISOString(),
    });
    const due = dueActions(s, NOW);
    assert.deepEqual(due, ["hunt", "draft"]);
  });
});

describe("recordRun", () => {
  it("stamps the matching timestamp and keeps the log capped", () => {
    let s = state({});
    for (let i = 0; i < 25; i += 1) s = recordRun(s, "draft", `run ${i}`, NOW);
    assert.equal(s.runs.length, 20);
    assert.equal(s.lastDraftAt, NOW.toISOString());
  });
});

describe("payout rails", () => {
  it("maps free-text methods to rails", () => {
    assert.equal(railForMethod("USDT on Polygon"), "crypto-usdt");
    assert.equal(railForMethod("USDC (Base)"), "crypto-usdc");
    assert.equal(railForMethod("Payoneer"), "payoneer");
    assert.equal(railForMethod("Grey virtual USD"), "ng-virtual-usd");
    assert.equal(railForMethod("Amazon gift card"), "gift-card");
    assert.equal(railForMethod("GTBank transfer"), "bank-ngn");
    assert.equal(railForMethod("crypto wallet 0xabc"), "crypto-usdt");
    assert.equal(railForMethod("   "), null);
    assert.equal(railForMethod("some other thing"), null);
  });

  it("groups earnings by rail with status split", () => {
    const entries: EarningEntry[] = [
      entry("Payoneer", 10, "received"),
      entry("Payoneer", 5, "withdrawn"),
      entry("USDT", 3, "pending"),
      entry("mystery rail", 9, "received"),
    ];
    const summaries = railSummaries(entries);
    const payoneer = summaries.find((r) => r.id === "payoneer");
    assert.equal(payoneer?.receivedUsd, 10);
    assert.equal(payoneer?.withdrawnUsd, 5);
    assert.equal(payoneer?.entries, 2);
    const usdt = summaries.find((r) => r.id === "crypto-usdt");
    assert.equal(usdt?.stillPendingUsd, 3);
    assert.equal(unmatchedRailCount(entries), 1);
  });

  it("lists a curated rail set", () => {
    assert.ok(PAYOUT_RAILS.length >= 5);
    for (const rail of PAYOUT_RAILS) {
      assert.ok(rail.checklist.length >= 3);
      assert.ok(rail.friction.length > 10);
    }
  });
});

function entry(
  method: string,
  amountUsd: number,
  status: "pending" | "received" | "withdrawn",
): EarningEntry {
  return {
    id: `e-${method}-${amountUsd}-${status}`,
    date: "2026-10-12",
    source: "test",
    method: "other",
    asset: "USD",
    amountUsd,
    status,
    withdrawalMethod: method,
    note: "",
  };
}
