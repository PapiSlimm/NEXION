import { describe, it, expect } from "vitest";
import { assessReadiness, RUBRIC, isValidKey } from "../src/lib/readiness.js";

const NOW = "2026-07-23T00:00:00.000Z";
const allKeys = RUBRIC.flatMap((c) => c.items.map((i) => i.key));

describe("readiness engine", () => {
  it("scores an empty checklist as do-not-deploy (0.0)", () => {
    const r = assessReadiness({ system: "Nothing", present: [], now: NOW });
    expect(r.score).toBe(0);
    expect(r.verdict).toBe("do-not-deploy");
    expect(r.gaps.length).toBe(allKeys.length);
  });

  it("scores a fully-checked system as production-ready (10.0)", () => {
    const r = assessReadiness({ system: "Everything", present: allKeys, now: NOW });
    expect(r.score).toBe(10);
    expect(r.verdict).toBe("production-ready");
    expect(r.gaps.length).toBe(0);
  });

  it("is deterministic", () => {
    const a = assessReadiness({ system: "X", present: ["zero-trust", "secrets", "slos"], now: NOW });
    const b = assessReadiness({ system: "X", present: ["slos", "secrets", "zero-trust"], now: NOW });
    expect(a).toEqual(b);
  });

  it("ignores unknown keys", () => {
    const r = assessReadiness({ system: "X", present: ["not-a-real-key"], now: NOW });
    expect(r.score).toBe(0);
  });

  it("orders gaps by weight (critical first)", () => {
    const r = assessReadiness({ system: "X", present: [], now: NOW });
    for (let i = 1; i < r.gaps.length; i++) {
      expect(r.gaps[i - 1].weight).toBeGreaterThanOrEqual(r.gaps[i].weight);
    }
    expect(r.gaps[0].severity).toBe("critical");
  });

  it("validates keys", () => {
    expect(isValidKey("zero-trust")).toBe(true);
    expect(isValidKey("nope")).toBe(false);
  });
});
