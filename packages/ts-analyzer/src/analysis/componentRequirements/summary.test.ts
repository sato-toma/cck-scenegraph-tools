import { describe, expect, it } from "vitest";
import {
  formatComponentRequirementStatusCounts,
  hasMissingComponentRequirements,
  hasUnverifiedComponentRequirements,
  summarizeComponentRequirements,
} from "./summary";

describe("component requirement summary", () => {
  it("counts every verification status and formats the summary", () => {
    const counts = summarizeComponentRequirements([
      { verificationStatus: "satisfied" },
      { verificationStatus: "missing" },
      { verificationStatus: "ambiguous" },
      { verificationStatus: "unsupported" },
      { verificationStatus: "unverified" },
      { verificationStatus: "satisfied" },
      { verificationStatus: "missing", kind: "optional-lookup" },
    ]);

    expect(counts).toEqual({
      satisfied: 2,
      missing: 1,
      ambiguous: 1,
      unsupported: 1,
      unverified: 1,
      optionalLookupMissing: 1,
    });
    expect(formatComponentRequirementStatusCounts(counts)).toContain(
      "Component requirements: 7",
    );
    expect(formatComponentRequirementStatusCounts(counts)).toContain(
      "  ambiguous: 1",
    );
    expect(formatComponentRequirementStatusCounts(counts)).toContain(
      "  optional lookup missing: 1",
    );
  });

  it("separates confirmed missing requirements from unverified results", () => {
    const missing = [{ verificationStatus: "missing" as const }];
    const optionalLookupMissing = [
      {
        verificationStatus: "missing" as const,
        kind: "optional-lookup" as const,
      },
    ];
    const unresolved = [
      { verificationStatus: "ambiguous" as const },
      { verificationStatus: "unsupported" as const },
      { verificationStatus: "unverified" as const },
    ];

    expect(hasMissingComponentRequirements(missing)).toBe(true);
    expect(hasMissingComponentRequirements(optionalLookupMissing)).toBe(false);
    expect(hasUnverifiedComponentRequirements(missing)).toBe(false);
    expect(hasMissingComponentRequirements(unresolved)).toBe(false);
    expect(hasUnverifiedComponentRequirements(unresolved)).toBe(true);
  });
});
