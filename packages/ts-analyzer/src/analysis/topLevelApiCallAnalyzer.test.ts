import { describe, expect, it } from "vitest";
import { TopLevelApiCallAnalyzer } from "./topLevelApiCallAnalyzer";

describe("TopLevelApiCallAnalyzer", () => {
  it("accepts direct callback registration statements", () => {
    const contexts = TopLevelApiCallAnalyzer.analyze(
      "$.onUse(() => {});\n",
      "onUse",
    );

    expect([...contexts.values()]).toEqual(["top-level"]);
  });

  it("rejects callback registration inside conditionals and functions", () => {
    const contexts = TopLevelApiCallAnalyzer.analyze(
      [
        "if (enabled) {",
        "  $.onUse(() => {});",
        "}",
        "function register() {",
        "  $.onUse(() => {});",
        "}",
      ].join("\n"),
      "onUse",
    );

    expect([...contexts.values()]).toEqual(["nested", "nested"]);
  });

  it("rejects callback registration in unbraced conditionals and callbacks", () => {
    const contexts = TopLevelApiCallAnalyzer.analyze(
      [
        "if (enabled) $.onUse(() => {});",
        "$.onStart(() => $.onUse(() => {}));",
      ].join("\n"),
      "onUse",
    );

    expect([...contexts.values()]).toEqual(["nested", "nested"]);
  });

  it("ignores API-like text in comments and strings", () => {
    const contexts = TopLevelApiCallAnalyzer.analyze(
      [
        '// $.onUse(() => {});',
        'const example = "$.onUse(() => {})";',
        "$.onUse(() => {});",
      ].join("\n"),
      "onUse",
    );

    expect([...contexts.values()]).toEqual(["top-level"]);
  });

  it("marks calls unverified when the source has syntax errors", () => {
    const contexts = TopLevelApiCallAnalyzer.analyze(
      "if (enabled) { $.onUse(() => {});",
      "onUse",
    );

    expect([...contexts.values()]).toEqual(["unverified"]);
  });
});
