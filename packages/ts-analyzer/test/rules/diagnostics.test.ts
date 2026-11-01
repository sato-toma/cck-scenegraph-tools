import { describe, expect, it } from "vitest";
import {
  diagnosticRules,
  runDiagnosticRules,
} from "../../src/rules/diagnostics";

const emptyContext = {
  sourceFilePath: "script.ts",
  sceneGraphPath: "SceneGraph.toml",
  sceneGraph: {
    project: "TestProject",
    gameObjects: [],
  },
};

describe("diagnostic rule registry", () => {
  it("uses unique stable IDs for every registered rule", () => {
    const ids = diagnosticRules.map((rule) => rule.id);

    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("aggregates violations and leaves valid source unreported", () => {
    const invalid = runDiagnosticRules({
      ...emptyContext,
      source: '$.setVisiblePlayers(null);\n$.state.profile.score++;',
    });

    expect(invalid.map((issue) => issue.code)).toEqual([
      "INVALID_API_ARGUMENT",
      "INVALID_STATE_MUTATION",
    ]);

    const valid = runDiagnosticRules({
      ...emptyContext,
      source: "$.setVisiblePlayers([]);\n$.state.score = 1;",
    });

    expect(valid).toEqual([]);
  });

  it("reports invalid API callback context", () => {
    const issues = runDiagnosticRules({
      ...emptyContext,
      source: "if (enabled) {\n  $.onGrab(() => {});\n}",
    });

    expect(issues).toMatchObject([
      {
        code: "INVALID_API_CONTEXT",
        apiCall: "onGrab",
        severity: "error",
      },
    ]);
  });
});
