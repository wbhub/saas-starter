import { describe, expect, it } from "vitest";
import { PLAN_CATALOG, PLAN_KEYS, PLAN_LABELS } from "./plans";

describe("plan catalog consistency", () => {
  it("stays aligned with supported plan keys", () => {
    expect(PLAN_CATALOG.map((plan) => plan.key)).toEqual(PLAN_KEYS);
  });

  it("keeps labels in sync with catalog names", () => {
    for (const plan of PLAN_CATALOG) {
      expect(PLAN_LABELS[plan.key]).toBe(plan.name);
    }
  });
});

